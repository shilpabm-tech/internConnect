const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

async function sendResetCodeEmail(toEmail, code) {
  const t = getTransporter();

  if (!t) {
    console.log(
      `[Password Reset] SMTP not configured. Verification code for ${toEmail}: ${code}`
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: "Intern Area - Password Reset Verification Code",
      text: `Your password reset verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can safely ignore this email.`,
      html: `<p>Your password reset verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>`,
    });
    return { delivered: true };
  } catch (error) {
    console.log("Email send failed:", error);
    console.log(
      `[Password Reset] Falling back to console log. Verification code for ${toEmail}: ${code}`
    );
    return { delivered: false, reason: "send_failed" };
  }
}

async function sendInvoiceEmail(toEmail, invoice) {
  const t = getTransporter();

  const {
    userName,
    planLabel,
    amount,
    razorpayOrderId,
    razorpayPaymentId,
    paidAt,
    subscriptionExpiresAt,
    planLimit,
  } = invoice;

  const rupees = (amount / 100).toFixed(2);
  const limitText = planLimit === null ? "Unlimited" : `${planLimit} per month`;

  const textBody = `Hi ${userName},

Thank you for subscribing to Intern Area.

Plan: ${planLabel}
Amount paid: Rs. ${rupees}
Order ID: ${razorpayOrderId}
Payment ID: ${razorpayPaymentId}
Payment date: ${paidAt}
Application limit: ${limitText}
Subscription valid until: ${subscriptionExpiresAt}

If you did not make this payment, please contact support immediately.`;

  const htmlBody = `
    <p>Hi ${userName},</p>
    <p>Thank you for subscribing to Intern Area.</p>
    <table cellpadding="6" style="border-collapse: collapse;">
      <tr><td><strong>Plan</strong></td><td>${planLabel}</td></tr>
      <tr><td><strong>Amount paid</strong></td><td>Rs. ${rupees}</td></tr>
      <tr><td><strong>Order ID</strong></td><td>${razorpayOrderId}</td></tr>
      <tr><td><strong>Payment ID</strong></td><td>${razorpayPaymentId}</td></tr>
      <tr><td><strong>Payment date</strong></td><td>${paidAt}</td></tr>
      <tr><td><strong>Application limit</strong></td><td>${limitText}</td></tr>
      <tr><td><strong>Valid until</strong></td><td>${subscriptionExpiresAt}</td></tr>
    </table>
    <p>If you did not make this payment, please contact support immediately.</p>
  `;

  if (!t) {
    console.log(`[Invoice] SMTP not configured. Invoice for ${toEmail}:\n${textBody}`);
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `Intern Area - ${planLabel} Plan Invoice`,
      text: textBody,
      html: htmlBody,
    });
    return { delivered: true };
  } catch (error) {
    console.log("Invoice email send failed:", error);
    console.log(`[Invoice] Falling back to console log. Invoice for ${toEmail}:\n${textBody}`);
    return { delivered: false, reason: "send_failed" };
  }
}

async function sendResumeOtpEmail(toEmail, code) {
  const t = getTransporter();

  if (!t) {
    console.log(
      `[Resume OTP] SMTP not configured. Verification code for ${toEmail}: ${code}`
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: "Intern Area - Resume Payment Verification Code",
      text: `Your verification code to proceed with your Rs. 50 resume payment is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can safely ignore this email.`,
      html: `<p>Your verification code to proceed with your Rs. 50 resume payment is: <strong>${code}</strong></p><p>This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>`,
    });
    return { delivered: true };
  } catch (error) {
    console.log("Resume OTP email send failed:", error);
    console.log(
      `[Resume OTP] Falling back to console log. Verification code for ${toEmail}: ${code}`
    );
    return { delivered: false, reason: "send_failed" };
  }
}

async function sendLanguageOtpEmail(toEmail, code, language) {
  const t = getTransporter();

  // The OTP is intentionally never written to the console/logs.
  if (!t) {
    console.log("[Language OTP] SMTP not configured. OTP email was not sent.");
    return { delivered: false, reason: "smtp_not_configured" };
  }

  const languageName = language === "fr" ? "French" : language;

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: "Intern Area - Language Verification Code / Code de vérification",
      text: `Your verification code to enable ${languageName} on Intern Area is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can safely ignore this email.\n\nVotre code de vérification pour activer le français sur Intern Area est : ${code}\nCe code expire dans 10 minutes.`,
      html: `<p>Your verification code to enable ${languageName} on Intern Area is: <strong>${code}</strong></p><p>This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p><hr/><p>Votre code de vérification pour activer le français sur Intern Area est : <strong>${code}</strong></p><p>Ce code expire dans 10 minutes.</p>`,
    });
    return { delivered: true };
  } catch (error) {
    console.log("Language OTP email send failed:", error.message);
    return { delivered: false, reason: "send_failed" };
  }
}

async function sendLoginOtpEmail(toEmail, code) {
  const t = getTransporter();

  // The OTP is intentionally never written to the console/logs.
  if (!t) {
    console.log("[Login OTP] SMTP not configured. OTP email was not sent.");
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: "Intern Area - Login Verification Code",
      text: `We noticed a login to your Intern Area account from Google Chrome. Your verification code is: ${code}\n\nThis code expires in 10 minutes. If this wasn't you, you can safely ignore this email - your account was not accessed.`,
      html: `<p>We noticed a login to your Intern Area account from Google Chrome. Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes. If this wasn't you, you can safely ignore this email - your account was not accessed.</p>`,
    });
    return { delivered: true };
  } catch (error) {
    // Distinguish "the provider is throttling us" (e.g. Mailtrap's
    // "550 5.7.0 Too many emails per second") from a genuine delivery
    // failure, so the route can answer with a clear, retryable response
    // instead of an unexplained 502. Only the error message is logged -
    // never the OTP.
    const detail = `${error.response || ""} ${error.message || ""}`;
    const rateLimited =
      /too many (emails|messages|requests)|rate.?limit|throttl/i.test(detail) ||
      error.responseCode === 429 ||
      error.responseCode === 454;
    console.log(
      `Login OTP email send failed (${rateLimited ? "rate limited" : "error"}):`,
      error.message
    );
    return { delivered: false, reason: rateLimited ? "rate_limited" : "send_failed" };
  }
}

module.exports = {
  sendResetCodeEmail,
  sendInvoiceEmail,
  sendResumeOtpEmail,
  sendLanguageOtpEmail,
  sendLoginOtpEmail,
};