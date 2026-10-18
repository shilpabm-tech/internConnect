const PLANS = {
  free: {
    label: "Free",
    price: 0, // paise
    limit: 1,
  },
  bronze: {
    label: "Bronze",
    price: 10000, // paise = ₹100
    limit: 3,
  },
  silver: {
    label: "Silver",
    price: 30000, // paise = ₹300
    limit: 5,
  },
  gold: {
    label: "Gold",
    price: 100000, // paise = ₹1000
    limit: Infinity,
  },
};

function isValidPlan(plan) {
  return Object.prototype.hasOwnProperty.call(PLANS, plan);
}

function getPlan(plan) {
  if (!isValidPlan(plan)) {
    throw new Error(`Unknown plan: ${plan}`);
  }
  return PLANS[plan];
}

module.exports = { PLANS, isValidPlan, getPlan };