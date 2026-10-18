const mongoose = require("mongoose");

const EducationSchema = new mongoose.Schema(
  {
    degree: String,
    institution: String,
    startYear: String,
    endYear: String,
    description: String,
  },
  { _id: false }
);

const ExperienceSchema = new mongoose.Schema(
  {
    role: String,
    company: String,
    startDate: String,
    endDate: String,
    description: String,
  },
  { _id: false }
);

const ProjectSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    link: String,
  },
  { _id: false }
);

const ResumeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // --- Submitted resume content ---
  name: String,
  email: String,
  phone: String,
  address: String,
  github: {
    type: String,
    default: null,
  },
  linkedin: {
    type: String,
    default: null,
  },
  summary: String,
  education: [EducationSchema],
  skills: [String],
  experience: [ExperienceSchema],
  projects: [ProjectSchema],
  photoUrl: {
    type: String,
    default: null,
  },

  // --- Generated output ---
  pdfUrl: {
    type: String,
    default: null,
  },

  // --- OTP state, scoped to this resume-creation attempt ---
  otpHash: {
    type: String,
    default: null,
  },
  otpExpiry: {
    type: Date,
    default: null,
  },
  otpAttempts: {
    type: Number,
    default: 0,
  },

  // --- Payment linkage ---
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    default: null,
  },

  // --- Lifecycle ---
  status: {
    type: String,
    enum: ["pending_otp", "otp_verified", "paid", "failed"],
    default: "pending_otp",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Resume", ResumeSchema);