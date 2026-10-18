const { getISTDayRange } = require("./dateUtils");

const DAILY_LIMIT_MESSAGE = "You can use this option only once per day.";

function hasResetToday(user) {
  if (!user.lastPasswordResetAt) {
    return false;
  }

  const { startOfDay, endOfDay } = getISTDayRange();
  const lastReset = new Date(user.lastPasswordResetAt);

  return lastReset >= startOfDay && lastReset < endOfDay;
}

module.exports = { hasResetToday, DAILY_LIMIT_MESSAGE };