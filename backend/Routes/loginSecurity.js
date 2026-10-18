const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const User = require("../Model/User");
const LoginHistory = require("../Model/LoginHistory");
const { generateNumericCode, hashCode } = require("../utils/verificationCode");
const { sendLoginOtpEmail } = require("../utils/mailer");
const {
  getClientIp,
  parseUserAgent,
  isWithinMobileLoginWindow,
} = require("../utils/requestContext");

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds between OTP emails
const MOBILE_WINDOW_MESSAGE_CODE = "MOBILE_WINDOW_BLOCKED";
// A verified/allowed session may be resumed (e.g. after a page refresh)
// without a new login attempt, OTP email or history row for this long.
const SESSION_RESUME_MS = 12 * 60 * 60 * 1000;
const EMAIL_RETRY_AFTER_SECONDS = 5;

// One /check at a time per firebaseUid. Duplicate requests that arrive while
// the first is still running share its result instead of each creating a
// history row and sending an OTP email. (Per Node process; with several
// server instances you would need a DB-level lock as well.)
const inFlightChecks = new Map();

// Turns a failed OTP email send into a specific, retryable response rather
// than an unexplained 502.
function emailFailureResponse(reason) {
  if (reason === "rate_limited") {
    return {
      status: 429,
      headers: { "Retry-After": String(EMAIL_RETRY_AFTER_SECONDS) },
      body: {
        code: "EMAIL_RATE_LIMITED",
        error: "the email service is temporarily rate limited; please try again shortly",
        retryAfterSeconds: EMAIL_RETRY_AFTER_SECONDS,
      },
    };
  }
  if (reason === "no_email") {
    return { status: 400, body: { code: "NO_EMAIL", error: "no email registered" } };
  }
  return {
    status: 503,
    body: { code: "EMAIL_UNAVAILABLE", error: "could not send the verification email right now" },
  };
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function recordShape(record) {
  // Never send OTP hashes/attempts to the client.
  return {
    _id: record._id,
    browser: record.browser,
    operatingSystem: record.operatingSystem,
    deviceType: record.deviceType,
    ipAddress: record.ipAddress,
    status: record.status,
    reason: record.reason,
    timestamp: record.timestamp,
  };
}

// POST /api/auth/login-security/check
// Called once per Firebase sign-in (and, with `resumeLoginHistoryId`, when an
// already-verified session is reloaded). This is the actual security
// boundary: the browser/OS/device, the IST time window, and the Chrome OTP
// requirement are all decided here from values the server itself derives
// (parsed User-Agent, server clock in Asia/Kolkata, server-seen IP) rather
// than trusting anything the client claims about itself.
router.post("/check", async (req, res) => {
  const { firebaseUid } = req.body;

  if (!firebaseUid) {
    return res.status(400).json({ code: "MISSING_FIELDS", error: "firebaseUid is required" });
  }

  let pending = inFlightChecks.get(firebaseUid);
  if (!pending) {
    pending = performCheck(req).finally(() => inFlightChecks.delete(firebaseUid));
    inFlightChecks.set(firebaseUid, pending);
  }

  try {
    const result = await pending;
    if (result.headers) res.set(result.headers);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.log("Login security check error:", error.message);
    return res.status(500).json({ code: "SERVER_ERROR", error: "internal server error" });
  }
});

async function performCheck(req) {
  const { firebaseUid, name, email, photo, resumeLoginHistoryId } = req.body;

  // Keep the User document in sync the same way /api/user/sync already
  // does, so login history can always link to a User even on a brand
  // new account's very first login check.
  const user = await User.findOneAndUpdate(
    { firebaseUid },
    {
      $set: { name, email, photo },
      $setOnInsert: { firebaseUid },
    },
    { new: true, upsert: true }
  );

  const { browser, operatingSystem, deviceType, isChrome } = parseUserAgent(
    req.headers["user-agent"]
  );
  const ipAddress = getClientIp(req);
  const base = { user: user._id, firebaseUid, browser, operatingSystem, deviceType, ipAddress };
  const sameDevice = (r) =>
    r.browser === browser && r.operatingSystem === operatingSystem && r.deviceType === deviceType;

  const pendingResponse = (record) => {
    const now = Date.now();
    const sinceSend = record.otpLastSentAt ? now - record.otpLastSentAt.getTime() : Infinity;
    return {
      status: 200,
      body: {
        code: "OTP_REQUIRED",
        status: "otp_required",
        loginHistoryId: record._id,
        reused: true,
        cooldownSeconds: Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - sinceSend) / 1000)),
        expiresInSeconds: Math.max(0, Math.ceil((record.otpExpiry.getTime() - now) / 1000)),
      },
    };
  };

  // --- Rule B: mobile time-of-day restriction (fresh logins AND resumed
  // sessions: a mobile session is not carried past 1:00 PM IST on reload) ---
  if (deviceType === "Mobile" && !isWithinMobileLoginWindow()) {
    const record = await LoginHistory.create({
      ...base,
      status: "blocked_mobile_time",
      reason: "Mobile login attempted outside the 10:00 AM - 1:00 PM IST window",
    });
    return {
      status: 403,
      body: {
        code: MOBILE_WINDOW_MESSAGE_CODE,
        error: "mobile login is only allowed between 10:00 AM and 1:00 PM IST",
        loginHistoryId: record._id,
      },
    };
  }

  // --- Resume: a reload of a session this same browser already completed
  // (or is still completing) must not count as a new login attempt, create
  // a history row, or send another OTP email. ---
  if (resumeLoginHistoryId) {
    let prior = null;
    try {
      prior = await LoginHistory.findOne({ _id: resumeLoginHistoryId, user: user._id });
    } catch (error) {
      prior = null; // malformed id -> treat as no resume hint
    }
    if (prior && sameDevice(prior)) {
      if (
        prior.status === "success" &&
        Date.now() - new Date(prior.timestamp).getTime() < SESSION_RESUME_MS
      ) {
        return {
          status: 200,
          body: { code: "ALLOWED", status: "allowed", loginHistoryId: prior._id, resumed: true, user },
        };
      }
      if (prior.status === "otp_required" && prior.otpHash && prior.otpExpiry > new Date()) {
        return pendingResponse(prior);
      }
    }
  }

  // --- Normal, allowed login (non-Chrome) -----------------------------------
  if (!isChrome) {
    const record = await LoginHistory.create({ ...base, status: "success" });
    return {
      status: 200,
      body: { code: "ALLOWED", status: "allowed", loginHistoryId: record._id, user },
    };
  }

  // --- Rule A: Chrome requires an email OTP before access is granted ---------
  // An OTP that was already emailed and has not expired is reused (no second
  // email, no second history row), and an unresolved OTP that was emailed
  // less than RESEND_COOLDOWN_MS ago blocks sending another one, so this
  // route can never be used to bypass the resend cooldown.
  const activeOtp = await LoginHistory.findOne({
    user: user._id,
    status: "otp_required",
    otpExpiry: { $gt: new Date() },
  }).sort({ timestamp: -1 });

  if (activeOtp) {
    if (sameDevice(activeOtp)) {
      return pendingResponse(activeOtp);
    }
    const sinceSend = activeOtp.otpLastSentAt
      ? Date.now() - activeOtp.otpLastSentAt.getTime()
      : Infinity;
    if (sinceSend < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - sinceSend) / 1000);
      return {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
        body: {
          code: "COOLDOWN",
          error: "please wait before requesting another OTP",
          retryAfterSeconds,
        },
      };
    }
  }

  const code = generateNumericCode();
  const record = await LoginHistory.create({
    ...base,
    status: "otp_required",
    reason: "Chrome login requires email OTP verification",
    otpHash: hashCode(code),
    otpExpiry: new Date(Date.now() + OTP_EXPIRY_MS),
    otpAttempts: 0,
    otpLastSentAt: new Date(),
  });

  const emailResult = email
    ? await sendLoginOtpEmail(email, code)
    : { delivered: false, reason: "no_email" };

  if (!emailResult.delivered) {
    record.status = "failed";
    record.reason =
      emailResult.reason === "rate_limited"
        ? "Chrome login OTP email was not sent: email provider rate limit"
        : "Could not deliver Chrome login OTP email";
    record.otpHash = null;
    record.otpExpiry = null;
    record.otpLastSentAt = null;
    await record.save();
    return emailFailureResponse(emailResult.reason);
  }

  return {
    status: 200,
    body: {
      code: "OTP_REQUIRED",
      status: "otp_required",
      loginHistoryId: record._id,
      cooldownSeconds: RESEND_COOLDOWN_MS / 1000,
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
    },
  };
}

// POST /api/auth/login-security/verify-otp
router.post("/verify-otp", async (req, res) => {
  const { firebaseUid, loginHistoryId, code } = req.body;

  if (!firebaseUid || !loginHistoryId || !code) {
    return res
      .status(400)
      .json({ code: "MISSING_FIELDS", error: "firebaseUid, loginHistoryId and code are required" });
  }
  if (!/^\d{6}$/.test(String(code))) {
    return res.status(400).json({ code: "INVALID_OTP", error: "invalid OTP" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ code: "USER_NOT_FOUND", error: "user not found" });
    }

    const record = await LoginHistory.findOne({ _id: loginHistoryId, user: user._id });
    if (!record || record.status !== "otp_required" || !record.otpHash || !record.otpExpiry) {
      return res.status(400).json({ code: "OTP_EXPIRED", error: "no active OTP for this attempt" });
    }

    if (record.otpExpiry.getTime() < Date.now()) {
      record.status = "otp_expired";
      record.otpHash = null;
      record.otpExpiry = null;
      record.otpAttempts = 0;
      await record.save();
      return res.status(400).json({ code: "OTP_EXPIRED", error: "OTP expired" });
    }

    if (record.otpAttempts >= MAX_OTP_ATTEMPTS) {
      record.status = "otp_failed";
      record.otpHash = null;
      record.otpExpiry = null;
      await record.save();
      return res.status(429).json({ code: "TOO_MANY_ATTEMPTS", error: "too many incorrect attempts" });
    }

    if (!safeEqualHex(hashCode(String(code)), record.otpHash)) {
      record.otpAttempts += 1;
      if (record.otpAttempts >= MAX_OTP_ATTEMPTS) {
        record.status = "otp_failed";
        record.otpHash = null;
        record.otpExpiry = null;
      }
      await record.save();
      return res.status(400).json({
        code: "INVALID_OTP",
        error: "invalid OTP",
        attemptsLeft: Math.max(0, MAX_OTP_ATTEMPTS - record.otpAttempts),
      });
    }

    record.status = "success";
    record.otpHash = null;
    record.otpExpiry = null;
    record.otpAttempts = 0;
    await record.save();

    return res.status(200).json({ code: "VERIFIED", status: "allowed", user });
  } catch (error) {
    console.log("Login OTP verify error:", error.message);
    res.status(500).json({ code: "SERVER_ERROR", error: "internal server error" });
  }
});

// POST /api/auth/login-security/resend-otp
router.post("/resend-otp", async (req, res) => {
  const { firebaseUid, loginHistoryId } = req.body;

  if (!firebaseUid || !loginHistoryId) {
    return res
      .status(400)
      .json({ code: "MISSING_FIELDS", error: "firebaseUid and loginHistoryId are required" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ code: "USER_NOT_FOUND", error: "user not found" });
    }
    if (!user.email) {
      return res.status(400).json({ code: "NO_EMAIL", error: "no email registered" });
    }

    const record = await LoginHistory.findOne({ _id: loginHistoryId, user: user._id });
    if (!record || record.status !== "otp_required") {
      return res.status(400).json({ code: "OTP_EXPIRED", error: "no active OTP for this attempt" });
    }

    const now = Date.now();
    if (record.otpLastSentAt) {
      const elapsed = now - record.otpLastSentAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        return res.status(429).json({
          code: "COOLDOWN",
          error: "please wait before requesting another OTP",
          retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
        });
      }
    }

    const code = generateNumericCode();
    const emailResult = await sendLoginOtpEmail(user.email, code);
    if (!emailResult.delivered) {
      const failure = emailFailureResponse(emailResult.reason);
      if (failure.headers) res.set(failure.headers);
      return res.status(failure.status).json(failure.body);
    }

    record.otpHash = hashCode(code);
    record.otpExpiry = new Date(now + OTP_EXPIRY_MS);
    record.otpAttempts = 0;
    record.otpLastSentAt = new Date(now);
    await record.save();

    return res.status(200).json({
      code: "OTP_SENT",
      cooldownSeconds: RESEND_COOLDOWN_MS / 1000,
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
    });
  } catch (error) {
    console.log("Login OTP resend error:", error.message);
    res.status(500).json({ code: "SERVER_ERROR", error: "internal server error" });
  }
});

// GET /api/auth/login-security/history/:firebaseUid?page=1&limit=10
//
// NOTE on access control: like every other route in this project
// (/api/user/:firebaseUid, the French-OTP routes, etc.), there is no
// backend verification of a Firebase ID token anywhere in this codebase —
// every route trusts the firebaseUid supplied in the request. This route
// follows that same existing pattern: a caller can only ever see the
// history tied to the exact firebaseUid they pass, never another user's
// by guessing a Mongo _id, but it does not independently prove that the
// caller IS that firebaseUid. Adding real verification (e.g. with the
// firebase-admin package already in package.json) would close that gap
// app-wide and is recommended as a follow-up — see TASK6_README.md.
router.get("/history/:firebaseUid", async (req, res) => {
  const { firebaseUid } = req.params;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ code: "USER_NOT_FOUND", error: "user not found" });
    }

    const total = await LoginHistory.countDocuments({ user: user._id });
    const records = await LoginHistory.find({ user: user._id })
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      records: records.map(recordShape),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.log("Login history fetch error:", error.message);
    res.status(500).json({ code: "SERVER_ERROR", error: "internal server error" });
  }
});

module.exports = router;
