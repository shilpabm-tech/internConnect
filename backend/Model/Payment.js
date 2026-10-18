const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["subscription", "resume"],
    default: "subscription",
  },
  plan: {
    type: String,
    enum: ["free", "bronze", "silver", "gold"],
    required: function () {
      return this.type === "subscription";
    },
  },
  amount: {
    type: Number,
    required: true, // stored in paise
  },
  razorpayOrderId: {
    type: String,
    required: true,
  },
  razorpayPaymentId: {
    type: String,
    default: null,
  },
  razorpaySignature: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["created", "verified", "failed"],
    default: "created",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Payment", PaymentSchema);