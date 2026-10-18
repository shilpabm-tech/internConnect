const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const User = require("../Model/User");
const { hasResetToday, DAILY_LIMIT_MESSAGE } = require("../utils/resetLimit");
const { generateNumericCode, hashCode } = require("../utils/verificationCode");
const { sendResetCodeEmail } = require("../utils/mailer");
const {
  getFirebaseAuth,
  FirebaseAdminNotConfiguredError,
} = require("../utils/firebaseAdmin");

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CODE_ATTEMPTS = 5;
const RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // time allowed to type the new password
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const INVALID_CODE_RESPONSE = { error: "invalid or expired code" };
const UNAVAILABLE_RESPONSE = {
  code: "PASSWORD_RESET_UNAVAILABLE",
  error: "Password reset is temporarily unavailable. Please try again later.",
};

// --- helpers ---------------------------------------------------------------

// Looks the account up in Firebase Auth (the real source of truth for
// passwords) and reports whether it has an email/password sign-in method.
// A Google-only account has no password to reset.
async function lookupFirebaseAccount(firebaseUid) {
  const auth = getFirebaseAuth();
  const record = await auth.getUser(firebaseUid);
  const hasPasswordProvider = record.providerData.some(
    (provider) => provider.providerId === "password"
  );
  return { auth, hasPasswordProvider };
}

function classifyFirebaseError(error) {
  if (error instanceof FirebaseAdminNotConfiguredError) return "unavailable";
  const code = error && (error.code || (error.errorInfo && error.errorInfo.code));
  if (code === "auth/user-not-found") return "not_found";
  if (
    code === "auth/invalid-password" ||
    code === "auth/weak-password" ||
    code === "auth/password-does-not-meet-requirements"
  ) {
    return "weak_password";
  }
  return "unavailable";
}

// Never logs request bodies, so neither codes, tokens nor passwords can end
// up in the server log.
function logFirebaseError(context, error) {
  console.log(
    `${context}:`,
    (error && (error.code || error.name)) || "unknown",
    "-",
    (error && error.message) || ""
  );
}

// 1. Request a password reset (email only for now - phone is deferred
// until Firebase Phone Auth / Console access is unblocked)
router.post("/request", async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }

  const genericResponse = {
    message: "If an account with that email exists, a verification code has been sent.",
  };

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    if (hasResetToday(user)) {
      return res.status(429).json({ error: DAILY_LIMIT_MESSAGE });
    }

    const code = generateNumericCode();
    user.resetCodeHash = hashCode(code);
    user.resetCodeExpiry = new Date(Date.now() + CODE_EXPIRY_MS);
    user.resetCodeAttempts = 0;
    // A new code invalidates any reset session left over from an earlier one.
    user.resetTokenHash = null;
    user.resetTokenExpiry = null;
    await user.save();

    await sendResetCodeEmail(email, code);

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "internal server error" });
  }
});

// 2. Confirm the emailed code. A correct code is exchanged - atomically and
// exactly once - for a short-lived, single-use reset token that /reset
// requires. Accounts that only sign in with Google are told so instead of
// being offered a password form.
router.post("/confirm", async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code || typeof email !== "string" || typeof code !== "string") {
    return res.status(400).json({ error: "email and code are required" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user || !user.resetCodeHash || !user.resetCodeExpiry) {
      return res.status(400).json(INVALID_CODE_RESPONSE);
    }

    if (user.resetCodeExpiry.getTime() < Date.now()) {
      user.resetCodeHash = null;
      user.resetCodeExpiry = null;
      user.resetCodeAttempts = 0;
      await user.save();
      return res.status(400).json(INVALID_CODE_RESPONSE);
    }

    if (user.resetCodeAttempts >= MAX_CODE_ATTEMPTS) {
      user.resetCodeHash = null;
      user.resetCodeExpiry = null;
      user.resetCodeAttempts = 0;
      await user.save();
      return res
        .status(429)
        .json({ error: "Too many incorrect attempts. Please request a new code." });
    }

    const isCorrect = hashCode(code) === user.resetCodeHash;

    if (!isCorrect) {
      user.resetCodeAttempts += 1;
      await user.save();
      return res.status(400).json(INVALID_CODE_RESPONSE);
    }

    // The code is correct (email ownership is proven). Before spending it,
    // check what kind of account this is. If Firebase can't be reached, the
    // code is left intact so the user can simply try again.
    let account;
    try {
      account = await lookupFirebaseAccount(user.firebaseUid);
    } catch (error) {
      if (classifyFirebaseError(error) === "not_found") {
        await User.updateOne(
          { _id: user._id },
          { $set: { resetCodeHash: null, resetCodeExpiry: null, resetCodeAttempts: 0 } }
        );
        return res.status(404).json({
          code: "ACCOUNT_NOT_FOUND",
          error: "no sign-in account was found for this email",
        });
      }
      logFirebaseError("Password reset account lookup failed", error);
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }

    const spendCode = {
      resetCodeHash: null,
      resetCodeExpiry: null,
      resetCodeAttempts: 0,
    };

    if (!account.hasPasswordProvider) {
      // Google-only account: nothing to reset, and we say so honestly.
      const spent = await User.findOneAndUpdate(
        { _id: user._id, resetCodeHash: user.resetCodeHash },
        { $set: spendCode }
      );
      if (!spent) {
        return res.status(400).json(INVALID_CODE_RESPONSE);
      }
      return res.status(200).json({
        codeVerified: true,
        passwordResetSupported: false,
        reason: "GOOGLE_ONLY",
        message:
          "This account signs in with Google and has no password to reset. Please use Login with Google.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const issued = await User.findOneAndUpdate(
      { _id: user._id, resetCodeHash: user.resetCodeHash },
      {
        $set: {
          ...spendCode,
          resetTokenHash: hashCode(resetToken),
          resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
        },
      }
    );

    if (!issued) {
      // Someone else spent this code a moment ago.
      return res.status(400).json(INVALID_CODE_RESPONSE);
    }

    return res.status(200).json({
      codeVerified: true,
      passwordResetSupported: true,
      resetToken,
      expiresInSeconds: RESET_TOKEN_EXPIRY_MS / 1000,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "internal server error" });
  }
});

// 3. Apply the new password. Requires the single-use token from /confirm, so
// it cannot be called without first passing email-code verification. The
// password is handed straight to Firebase Auth, which hashes and stores it;
// it is never written to MongoDB or to the logs.
router.post("/reset", async (req, res) => {
  const { email, resetToken, newPassword } = req.body;

  if (
    !email ||
    !resetToken ||
    typeof email !== "string" ||
    typeof resetToken !== "string" ||
    typeof newPassword !== "string"
  ) {
    return res.status(400).json({
      code: "MISSING_FIELDS",
      error: "email, resetToken and newPassword are required",
    });
  }

  const invalidToken = {
    code: "INVALID_OR_EXPIRED_TOKEN",
    error: "this reset session is invalid or has expired",
  };

  // Tokens are 32 random bytes in hex; anything else (including a 6-digit
  // emailed code) can never be a valid token.
  if (!/^[a-f0-9]{64}$/.test(resetToken)) {
    return res.status(400).json(invalidToken);
  }

  // Checked before the token is spent so a typo doesn't cost the user their
  // verified session.
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      code: "PASSWORD_TOO_SHORT",
      error: `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({
      code: "PASSWORD_TOO_LONG",
      error: `password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    });
  }

  try {
    const tokenHash = hashCode(resetToken);

    // Claim the token atomically: of any number of concurrent requests with
    // the same token, exactly one gets the user back.
    const claimed = await User.findOneAndUpdate(
      { email, resetTokenHash: tokenHash, resetTokenExpiry: { $gt: new Date() } },
      { $set: { resetTokenHash: null, resetTokenExpiry: null } },
      { new: false }
    );

    if (!claimed) {
      return res.status(400).json(invalidToken);
    }

    // Puts the token back after a failure the user can fix or retry
    // (a rejected password, Firebase being briefly unreachable), so they
    // don't have to request and verify a new code.
    const restoreToken = () =>
      User.updateOne(
        { _id: claimed._id, resetTokenHash: null },
        { $set: { resetTokenHash: tokenHash, resetTokenExpiry: claimed.resetTokenExpiry } }
      );

    // The once-per-day limit. /request already enforces it; checked again
    // here so a second reset on the same IST day is impossible regardless
    // of how the flow was entered.
    if (hasResetToday(claimed)) {
      return res.status(429).json({ code: "DAILY_LIMIT", error: DAILY_LIMIT_MESSAGE });
    }

    let auth;
    try {
      const account = await lookupFirebaseAccount(claimed.firebaseUid);
      auth = account.auth;

      if (!account.hasPasswordProvider) {
        // Never silently turn a Google-only account into a password
        // account, and never claim a password was changed.
        return res.status(400).json({
          code: "GOOGLE_ONLY",
          error: "this account signs in with Google and has no password to reset",
        });
      }

      await auth.updateUser(claimed.firebaseUid, { password: newPassword });
    } catch (error) {
      const kind = classifyFirebaseError(error);
      if (kind === "not_found") {
        return res.status(404).json({
          code: "ACCOUNT_NOT_FOUND",
          error: "no sign-in account was found for this email",
        });
      }
      await restoreToken();
      if (kind === "weak_password") {
        return res.status(400).json({
          code: "WEAK_PASSWORD",
          error: "this password is not accepted; please choose a stronger one",
        });
      }
      logFirebaseError("Password reset update failed", error);
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }

    // The password is changed. Record it so the once-per-day limit applies.
    try {
      await User.updateOne({ _id: claimed._id }, { $set: { lastPasswordResetAt: new Date() } });
    } catch (error) {
      console.log("Could not record password reset time:", error.message);
    }

    // Best effort: sign the account out everywhere else.
    try {
      await auth.revokeRefreshTokens(claimed.firebaseUid);
    } catch (error) {
      logFirebaseError("Could not revoke refresh tokens after password reset", error);
    }

    return res.status(200).json({
      code: "PASSWORD_RESET",
      message: "Your password has been reset. You can now log in with your new password.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;
