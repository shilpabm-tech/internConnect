const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const User = require("../Model/User");
const Resume = require("../Model/Resume");
const Payment = require("../Model/Payment");
const { checkPremiumEligibility } = require("../utils/premiumEligibility");
const { generateNumericCode, hashCode } = require("../utils/verificationCode");
const { sendResumeOtpEmail } = require("../utils/mailer");
const { getRazorpayInstance } = require("../utils/razorpayClient");
const { generateResumePdf } = require("../utils/resumePdf");

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const RESUME_PRICE_PAISE = 5000;

router.post("/request-otp", async (req, res) => {
  const { firebaseUid } = req.body;

  if (!firebaseUid) {
    return res.status(400).json({ error: "firebaseUid is required" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const { isEligible } = await checkPremiumEligibility(user);
    if (!isEligible) {
      return res.status(403).json({
        error: "Resume creation is a premium feature. Please subscribe to a paid plan to continue.",
      });
    }

    let resume = await Resume.findOne({
      user: user._id,
      status: { $in: ["pending_otp", "otp_verified"] },
    });

    if (!resume) {
      resume = new Resume({ user: user._id, status: "pending_otp" });
    } else if (resume.payment) {
      resume.payment = null;
    }

    const code = generateNumericCode();
    resume.otpHash = hashCode(code);
    resume.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
    resume.otpAttempts = 0;
    resume.status = "pending_otp";
    resume.updatedAt = new Date();
    await resume.save();

    const emailResult = await sendResumeOtpEmail(user.email, code);

    res.status(200).json({
      resumeId: resume._id,
      delivered: emailResult.delivered,
      message: emailResult.delivered
        ? "A verification code has been sent to your registered email."
        : "We could not deliver the email right now. Please try again shortly.",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

router.post("/details", async (req, res) => {
  const {
    firebaseUid,
    resumeId,
    name,
    email,
    phone,
    address,
    github,
    linkedin,
    summary,
    education,
    skills,
    experience,
    projects,
    photoUrl,
  } = req.body;

  if (!firebaseUid || !resumeId) {
    return res.status(400).json({ error: "firebaseUid and resumeId are required" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const resume = await Resume.findOne({ _id: resumeId, user: user._id });
    if (!resume) {
      return res.status(404).json({ error: "resume not found" });
    }

    if (resume.status === "paid") {
      return res.status(403).json({ error: "this resume has already been paid for and finalized" });
    }

    if (name !== undefined) resume.name = name;
    if (email !== undefined) resume.email = email;
    if (phone !== undefined) resume.phone = phone;
    if (address !== undefined) resume.address = address;
    if (github !== undefined) resume.github = github;
    if (linkedin !== undefined) resume.linkedin = linkedin;
    if (summary !== undefined) resume.summary = summary;
    if (education !== undefined) resume.education = education;
    if (skills !== undefined) resume.skills = skills;
    if (experience !== undefined) resume.experience = experience;
    if (projects !== undefined) resume.projects = projects;
    if (photoUrl !== undefined) resume.photoUrl = photoUrl;
    resume.updatedAt = new Date();

    await resume.save();

    res.status(200).json({ status: "saved", resume });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { firebaseUid, resumeId, code } = req.body;

  if (!firebaseUid || !resumeId || !code) {
    return res.status(400).json({ error: "firebaseUid, resumeId and code are required" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const resume = await Resume.findOne({ _id: resumeId, user: user._id });
    if (!resume || !resume.otpHash || !resume.otpExpiry) {
      return res.status(400).json({ error: "invalid or expired code" });
    }

    if (resume.status !== "pending_otp") {
      return res.status(400).json({ error: "invalid or expired code" });
    }

    if (resume.otpExpiry.getTime() < Date.now()) {
      resume.otpHash = null;
      resume.otpExpiry = null;
      resume.otpAttempts = 0;
      await resume.save();
      return res.status(400).json({ error: "invalid or expired code" });
    }

    if (resume.otpAttempts >= MAX_OTP_ATTEMPTS) {
      resume.otpHash = null;
      resume.otpExpiry = null;
      resume.otpAttempts = 0;
      await resume.save();
      return res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
    }

    const isCorrect = hashCode(code) === resume.otpHash;

    if (!isCorrect) {
      resume.otpAttempts += 1;
      await resume.save();
      return res.status(400).json({ error: "invalid or expired code" });
    }

    resume.otpHash = null;
    resume.otpExpiry = null;
    resume.otpAttempts = 0;
    resume.status = "otp_verified";
    resume.updatedAt = new Date();
    await resume.save();

    res.status(200).json({
      status: "otp_verified",
      resumeId: resume._id,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

router.post("/create-order", async (req, res) => {
  const { firebaseUid, resumeId } = req.body;

  if (!firebaseUid || !resumeId) {
    return res.status(400).json({ error: "firebaseUid and resumeId are required" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const { isEligible } = await checkPremiumEligibility(user);
    if (!isEligible) {
      return res.status(403).json({
        error: "Resume creation is a premium feature. Please subscribe to a paid plan to continue.",
      });
    }

    const resume = await Resume.findOne({ _id: resumeId, user: user._id });
    if (!resume) {
      return res.status(404).json({ error: "resume not found" });
    }

    if (resume.status !== "otp_verified") {
      return res.status(403).json({
        error: "You must verify the OTP sent to your email before proceeding to payment.",
      });
    }

    const razorpay = getRazorpayInstance();
    const order = await razorpay.orders.create({
      amount: RESUME_PRICE_PAISE,
      currency: "INR",
      receipt: `resume_${resume._id}_${Date.now()}`,
    });

    const payment = await Payment.create({
      user: user._id,
      type: "resume",
      amount: RESUME_PRICE_PAISE,
      razorpayOrderId: order.id,
      status: "created",
    });

    resume.payment = payment._id;
    resume.updatedAt = new Date();
    await resume.save();

    res.status(201).json({
      orderId: order.id,
      amount: RESUME_PRICE_PAISE,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      resumeId: resume._id,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

router.post("/verify-payment", async (req, res) => {
  const {
    firebaseUid,
    resumeId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!firebaseUid || !resumeId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      error: "firebaseUid, resumeId, razorpay_order_id, razorpay_payment_id and razorpay_signature are required",
    });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const resume = await Resume.findOne({ _id: resumeId, user: user._id });
    if (!resume) {
      return res.status(404).json({ error: "resume not found" });
    }

    if (resume.status === "paid") {
      return res.status(200).json({
        status: "already_paid",
        resumeId: resume._id,
        pdfUrl: resume.pdfUrl,
      });
    }

    if (!resume.payment) {
      return res.status(400).json({ error: "no payment order found for this resume" });
    }

    const payment = await Payment.findById(resume.payment);
    if (!payment || payment.razorpayOrderId !== razorpay_order_id) {
      return res.status(404).json({ error: "order not found for this resume" });
    }

    if (payment.status === "verified") {
      return res.status(200).json({
        status: "already_paid",
        resumeId: resume._id,
        pdfUrl: resume.pdfUrl,
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

    let pdfFilename;
    try {
      pdfFilename = await generateResumePdf(resume);
    } catch (pdfError) {
      console.log("Resume PDF generation failed (payment already verified):", pdfError);
      return res.status(500).json({
        error: "Your payment was verified but resume generation failed. Please contact support.",
      });
    }

    const pdfUrl = `${req.protocol}://${req.get("host")}/resumes/${pdfFilename}`;

    resume.pdfUrl = pdfUrl;
    resume.status = "paid";
    resume.updatedAt = new Date();
    await resume.save();

    res.status(200).json({
      status: "paid",
      resumeId: resume._id,
      pdfUrl,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;
