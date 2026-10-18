const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const User = require("../Model/User");
const LanguageVerification = require("../Model/LanguageVerification");
const { generateNumericCode, hashCode } = require("../utils/verificationCode");
const { sendLanguageOtpEmail } = require("../utils/mailer");

const SUPPORTED_LANGUAGES = ["fr"];

const OTP_EXPIRY_MS = 10 * 60 * 1000; // OTP valid for 10 minutes
const MAX_OTP_ATTEMPTS = 5; // wrong guesses before the OTP is invalidated
const RESEND_COOLDOWN_MS = 60 * 1000; // minimum gap between two OTP emails
const SEND_WINDOW_MS = 60 * 60 * 1000; // rolling window for the send cap
const MAX_SENDS_PER_WINDOW = 5; // max OTP emails per window

// The frontend translates by `code`, never by the English `error` text.

function getLanguage(value) {
  const language = (value || "fr").toString().toLowerCase();
  return SUPPORTED_LANGUAGES.includes(language) ? language : null;
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function findUserOr404(firebaseUid, res) {
  const user = await User.findOne({ firebaseUid });
  if (!user) {
    res.status(404).json({ code: "USER_NOT_FOUND", error: "user not found" });
    return null;
  }
  return user;
}

// GET /api/auth/language-otp/status/:firebaseUid?language=fr
router.get("/status/:firebaseUid", async (req, res) => {
  const language = getLanguage(req.query.language);
  if (!language) {
    return res.status(400).json({ code: "UNSUPPORTED_LANGUAGE", error: "unsupported language" });
  }

  try {
    const user = await findUserOr404(req.params.firebaseUid, res);
    if (!user) return;

    const record = await LanguageVerification.findOne({ user: user._id, language });
    res.status(200).json({ verified: Boolean(record && record.verifiedAt) });
  } catch (error) {
    console.log("Language status error:", error.message);
    res.status(500).json({ code: "SERVER_ERROR", error: "internal server error" });
  }
});

// POST /api/auth/language-otp/request  { firebaseUid, language }
router.post("/request", async (req, res) => {
  const { firebaseUid } = req.body;
  const language = getLanguage(req.body.language);

  if (!firebaseUid) {
    return res.status(400).json({ code: "MISSING_FIELDS", error: "firebaseUid is required" });
  }
  if (!language) {
    return res.status(400).json({ code: "UNSUPPORTED_LANGUAGE", error: "unsupported language" });
  }

  try {
    const user = await findUserOr404(firebaseUid, res);
    if (!user) return;

    if (!user.email) {
      return res.status(400).json({ code: "NO_EMAIL", error: "no email registered" });
    }

    let record = await LanguageVerification.findOne({ user: user._id, language });
    if (!record) {
      record = new LanguageVerification({ user: user._id, language });
    }

    if (record.verifiedAt) {
      return res.status(200).json({ code: "ALREADY_VERIFIED", verified: true });
    }

    const now = Date.now();

    // Cooldown between emails
    if (record.lastSentAt) {
      const elapsed = now - record.lastSentAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        return res.status(429).json({
          code: "COOLDOWN",
          error: "please wait before requesting another OTP",
          retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
        });
      }
    }

    // Rolling-window send cap
    let windowStart = record.sendWindowStart ? record.sendWindowStart.getTime() : 0;
    let sendCount = record.sendCount || 0;
    if (!windowStart || now - windowStart >= SEND_WINDOW_MS) {
      windowStart = now;
      sendCount = 0;
    }
    if (sendCount >= MAX_SENDS_PER_WINDOW) {
      return res.status(429).json({
        code: "RATE_LIMITED",
        error: "too many OTP requests",
        retryAfterSeconds: Math.ceil((windowStart + SEND_WINDOW_MS - now) / 1000),
      });
    }

    const code = generateNumericCode();
    record.otpHash = hashCode(code);
    record.otpExpiry = new Date(now + OTP_EXPIRY_MS);
    record.otpAttempts = 0;

    const emailResult = await sendLanguageOtpEmail(user.email, code, language);

    if (!emailResult.delivered) {
      // Do not consume the cooldown/quota for an email that never left.
      record.otpHash = null;
      record.otpExpiry = null;
      await record.save();
      return res.status(502).json({ code: "SEND_FAILED", error: "could not send OTP" });
    }

    record.lastSentAt = new Date(now);
    record.sendWindowStart = new Date(windowStart);
    record.sendCount = sendCount + 1;
    await record.save();

    res.status(200).json({
      code: "OTP_SENT",
      cooldownSeconds: RESEND_COOLDOWN_MS / 1000,
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
    });
  } catch (error) {
    console.log("Language OTP request error:", error.message);
    res.status(500).json({ code: "SERVER_ERROR", error: "internal server error" });
  }
});

// POST /api/auth/language-otp/verify  { firebaseUid, language, code }
router.post("/verify", async (req, res) => {
  const { firebaseUid, code } = req.body;
  const language = getLanguage(req.body.language);

  if (!firebaseUid || !code) {
    return res.status(400).json({ code: "MISSING_FIELDS", error: "firebaseUid and code are required" });
  }
  if (!language) {
    return res.status(400).json({ code: "UNSUPPORTED_LANGUAGE", error: "unsupported language" });
  }
  if (!/^\d{6}$/.test(String(code))) {
    return res.status(400).json({ code: "INVALID_OTP", error: "invalid OTP" });
  }

  try {
    const user = await findUserOr404(firebaseUid, res);
    if (!user) return;

    const record = await LanguageVerification.findOne({ user: user._id, language });

    if (record && record.verifiedAt) {
      return res.status(200).json({ code: "VERIFIED", verified: true });
    }

    if (!record || !record.otpHash || !record.otpExpiry) {
      return res.status(400).json({ code: "OTP_EXPIRED", error: "no active OTP" });
    }

    if (record.otpExpiry.getTime() < Date.now()) {
      record.otpHash = null;
      record.otpExpiry = null;
      record.otpAttempts = 0;
      await record.save();
      return res.status(400).json({ code: "OTP_EXPIRED", error: "OTP expired" });
    }

    if (record.otpAttempts >= MAX_OTP_ATTEMPTS) {
      record.otpHash = null;
      record.otpExpiry = null;
      record.otpAttempts = 0;
      await record.save();
      return res.status(429).json({ code: "TOO_MANY_ATTEMPTS", error: "too many incorrect attempts" });
    }

    if (!safeEqualHex(hashCode(String(code)), record.otpHash)) {
      record.otpAttempts += 1;
      await record.save();
      return res.status(400).json({
        code: "INVALID_OTP",
        error: "invalid OTP",
        attemptsLeft: Math.max(0, MAX_OTP_ATTEMPTS - record.otpAttempts),
      });
    }

    record.otpHash = null;
    record.otpExpiry = null;
    record.otpAttempts = 0;
    record.verifiedAt = new Date();
    await record.save();

    res.status(200).json({ code: "VERIFIED", verified: true });
  } catch (error) {
    console.log("Language OTP verify error:", error.message);
    res.status(500).json({ code: "SERVER_ERROR", error: "internal server error" });
  }
});

module.exports = router;
