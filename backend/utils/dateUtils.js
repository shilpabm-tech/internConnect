// Computes the UTC instants corresponding to 00:00 IST (start) and
// 00:00 IST the next day (end) for "today", regardless of the server's
// own local timezone.
function getISTDayRange() {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const now = new Date();
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);

  const startOfDayShiftedUTC = Date.UTC(
    istShifted.getUTCFullYear(),
    istShifted.getUTCMonth(),
    istShifted.getUTCDate(),
    0, 0, 0, 0
  );

  const startOfDay = new Date(startOfDayShiftedUTC - IST_OFFSET_MS);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  return { startOfDay, endOfDay };
}

function getCurrentISTMonthKey() {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const now = new Date();
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);

  const year = istShifted.getUTCFullYear();
  const month = String(istShifted.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getCurrentISTHour() {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const now = new Date();
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);

  return istShifted.getUTCHours();
}

module.exports = {
  getISTDayRange,
  getCurrentISTMonthKey,
  getCurrentISTHour,
};