const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
  },
  name: String,
  email: String,
  photo: String,
  friends: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  friendRequests: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  sentFriendRequests: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },

  // --- Task 2: Forgot Password fields ---
  phoneNumber: {
    type: String,
    default: null,
  },
  lastPasswordResetAt: {
    type: Date,
    default: null,
  },
  resetCodeHash: {
    type: String,
    default: null,
  },
  resetCodeExpiry: {
    type: Date,
    default: null,
  },
  resetCodeAttempts: {
    type: Number,
    default: 0,
  },

  // --- Task 3: Subscription fields (added below, nothing above changed) ---
  subscriptionPlan: {
    type: String,
    enum: ["free", "bronze", "silver", "gold"],
    default: "free",
  },
  subscriptionExpiresAt: {
    type: Date,
    default: null,
  },
  applicationCountThisMonth: {
    type: Number,
    default: 0,
  },
  applicationCountMonth: {
    type: String,
    default: null,
  },

  // --- Forgot Password, step 2: single-use reset session ---
  // Issued only after the emailed code was verified; stored hashed (sha256)
  // like the code itself, expires quickly, and is consumed by /reset.
  resetTokenHash: {
    type: String,
    default: null,
  },
  resetTokenExpiry: {
    type: Date,
    default: null,
  },
});

module.exports = mongoose.model("User", UserSchema);