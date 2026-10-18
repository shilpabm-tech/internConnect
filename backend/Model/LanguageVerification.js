const mongoose = require("mongoose");

// Stored in its own collection (NOT on the User document) because
// /api/user/sync and /api/user/:firebaseUid return the whole User document
// to the browser. OTP hashes must never be exposed that way.
const LanguageVerificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  language: {
    type: String,
    required: true,
    enum: ["fr"],
  },

  // Pending OTP (hashed, never stored in plain text)
  otpHash: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  otpAttempts: { type: Number, default: 0 },

  // Resend throttling
  lastSentAt: { type: Date, default: null },
  sendWindowStart: { type: Date, default: null },
  sendCount: { type: Number, default: 0 },

  // Set once the user has proven ownership of their email for this language
  verifiedAt: { type: Date, default: null },
});

LanguageVerificationSchema.index({ user: 1, language: 1 }, { unique: true });

module.exports = mongoose.model("LanguageVerification", LanguageVerificationSchema);
