const UNLIMITED = Infinity;

function getDailyPostLimit(friendCount) {
  if (typeof friendCount !== "number" || friendCount < 0 || Number.isNaN(friendCount)) {
    throw new Error("friendCount must be a non-negative number");
  }

  if (friendCount === 0) {
    return 0;
  }

  if (friendCount > 10) {
    return UNLIMITED;
  }

  // 1–10 friends: limit equals friend count (linear rule)
  return friendCount;
}

module.exports = { getDailyPostLimit, UNLIMITED };