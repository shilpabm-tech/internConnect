const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../Model/User");
const Payment = require("../Model/Payment");
const { PLANS, isValidPlan, getPlan } = require("../utils/plans");
const { getCurrentISTHour, getCurrentISTMonthKey } = require("../utils/dateUtils");
const { getRazorpayInstance } = require("../utils/razorpayClient");
const { sendInvoiceEmail } = require("../utils/mailer");

// 1. Get all subscription plans (public, no auth needed)
router.get("/plans", (req, res) => {
  try {
    const plans = Object.entries(PLANS).map(([key, plan]) => ({
      key,
      label: plan.label,
      price: plan.price,
      limit: plan.limit === Infinity ? null : plan.limit,
      unlimited: plan.limit === Infinity,
    }));
    res.status(200).json(plans);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 2. Get a user's current subscription status
router.get("/current/:firebaseUid", async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const plan = PLANS[user.subscriptionPlan];

    res.status(200).json({
      subscriptionPlan: user.subscriptionPlan,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      applicationCountThisMonth: user.applicationCountThisMonth,
      applicationCountMonth: user.applicationCountMonth,
      planLabel: plan.label,
      planLimit: plan.limit === Infinity ? null : plan.limit,
      unlimited: plan.limit === Infinity,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 3. Create a Razorpay order for a paid plan (does NOT activate the plan)
router.post("/create-order", async (req, res) => {
  const { firebaseUid, plan } = req.body;

  if (!firebaseUid || !plan) {
    return res.status(400).json({ error: "firebaseUid and plan are required" });
  }

  if (!isValidPlan(plan)) {
    return res.status(400).json({ error: "invalid plan" });
  }

  if (plan === "free") {
    return res.status(400).json({ error: "the free plan does not require payment" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const istHour = getCurrentISTHour();
    if (istHour !== 10) {
      return res.status(403).json({
        error: "Payments are only accepted between 10:00 AM and 11:00 AM IST.",
      });
    }

    const planDetails = getPlan(plan);
    const amount = planDetails.price;

    const razorpay = getRazorpayInstance();
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `receipt_${user._id}_${Date.now()}`,
    });

    await Payment.create({
      user: user._id,
      plan,
      amount,
      razorpayOrderId: order.id,
      status: "created",
    });

    res.status(201).json({
      orderId: order.id,
      amount,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      plan,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 4. Verify a completed payment, activate the subscription, and send the invoice email
router.post("/verify-payment", async (req, res) => {
  const {
    firebaseUid,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!firebaseUid || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      error:
        "firebaseUid, razorpay_order_id, razorpay_payment_id and razorpay_signature are required",
    });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const payment = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
      user: user._id,
    });
    if (!payment) {
      return res.status(404).json({ error: "order not found for this user" });
    }

    if (payment.status === "verified") {
      return res.status(200).json({
        status: "already_verified",
        plan: payment.plan,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      payment.status = "failed";
      await payment.save();
      return res.status(400).json({ error: "payment verification failed" });
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = "verified";
    await payment.save();

    const subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    user.subscriptionPlan = payment.plan;
    user.subscriptionExpiresAt = subscriptionExpiresAt;
    user.applicationCountThisMonth = 0;
    user.applicationCountMonth = getCurrentISTMonthKey();
    await user.save();

    // Send the invoice email. A failure here must NOT turn a successful,
    // already-activated payment into a failure response.
    const planDetails = getPlan(payment.plan);
    try {
      await sendInvoiceEmail(user.email, {
        userName: user.name || "there",
        planLabel: planDetails.label,
        amount: payment.amount,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        paidAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        subscriptionExpiresAt: subscriptionExpiresAt.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
        planLimit: planDetails.limit === Infinity ? null : planDetails.limit,
      });
    } catch (emailError) {
      console.log("Invoice email failed (payment already activated):", emailError);
    }

    res.status(200).json({
      status: "verified",
      plan: payment.plan,
      subscriptionExpiresAt,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;