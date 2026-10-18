const Razorpay = require("razorpay");

let instance = null;

function getRazorpayInstance() {
  if (instance) return instance;

  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials are not configured in .env");
  }

  instance = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });

  return instance;
}

module.exports = { getRazorpayInstance };