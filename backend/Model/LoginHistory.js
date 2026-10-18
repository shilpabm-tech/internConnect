const mongoose = require("mongoose");

const LoginHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  firebaseUid: {
    type: String,
    required: true,
  },

  browser: { type: String, default: "Unknown" },
  operatingSystem: { type: String, default: "Unknown" },
  // "Desktop" covers both desktops and laptops — see utils/requestContext.js
  // for why that distinction cannot be made from a User-Agent header.
  deviceType: { type: String, enum: ["Desktop", "Mobile"], default: "Desktop" },
  ipAddress: { type: String, default: "unknown" },

  status: {
    type: String,
    enum: [
      "success",
      "failed",
      "blocked_mobile_time",
      "otp_required",
      "otp_failed",
      "otp_expired",
    ],
    required: true,
  },
  reason: { type: String, default: null },

  // Set only while a Chrome-login OTP challenge for THIS attempt is active.
  // Cleared (set back to null) as soon as it is verified, expires, or is
  // superseded by a resend — never left lying around with a usable value.
  otpHash: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  otpAttempts: { type: Number, default: 0 },
  otpLastSentAt: { type: Date, default: null },

  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

LoginHistorySchema.index({ user: 1, timestamp: -1 });

module.exports = mongoose.model("LoginHistory", LoginHistorySchema);
