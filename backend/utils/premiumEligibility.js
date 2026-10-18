const User = require("../Model/User");

// Checks whether a user currently has an active, non-free subscription.
// If a previously-paid plan has expired, this also lazily reverts the
// User document back to "free" (same lazy-expiry pattern already used
// in Routes/application.js), so eligibility checks and stored state
// never drift out of sync.
async function checkPremiumEligibility(user) {
  const now = new Date();

  if (
    user.subscriptionPlan !== "free" &&
    user.subscriptionExpiresAt &&
    user.subscriptionExpiresAt < now
  ) {
    const reverted = await User.findOneAndUpdate(
      { _id: user._id, subscriptionExpiresAt: { $lt: now } },
      { $set: { subscriptionPlan: "free", subscriptionExpiresAt: null } },
      { new: true }
    );
    user = reverted || user;
  }

  const isEligible =
    user.subscriptionPlan !== "free" &&
    !!user.subscriptionExpiresAt &&
    user.subscriptionExpiresAt >= now;

  return { isEligible, user };
}

module.exports = { checkPremiumEligibility };