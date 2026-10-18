const { UAParser } = require("ua-parser-js");

// --- IP address -----------------------------------------------------------
//
// In production this app typically sits behind a single reverse proxy
// (e.g. Render's load balancer). Express's own req.ip only reflects the
// real client IP if "trust proxy" is enabled (done in index.js) AND only
// the proxy is allowed to set X-Forwarded-For — a client can otherwise
// spoof that header. This is a best-effort, non-authoritative value used
// for login-history/auditing, never for an access-control decision.
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  let ip;
  if (forwarded) {
    // X-Forwarded-For can be a comma-separated list; the first entry is
    // the original client as seen by the first proxy in the chain.
    ip = forwarded.split(",")[0].trim();
  } else {
    ip = req.ip || req.socket?.remoteAddress || "";
  }
  // Normalise the IPv4-mapped IPv6 form (::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip && ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }
  return ip || "unknown";
}

// --- Browser / OS / device -------------------------------------------------
//
// device.type from ua-parser-js is only populated for "mobile", "tablet",
// "console", "smarttv" and "wearable" user agents; it is left undefined for
// every ordinary computer. No publicly available User-Agent token
// distinguishes a laptop from a desktop tower — both report the same OS
// platform string (e.g. "Windows", "Mac OS") with no form-factor hint, so
// that distinction is not technically possible from a User-Agent header.
// This project therefore reports two device categories: "Mobile" (phones
// and tablets) and "Desktop" (laptops and desktops alike), which is
// documented in TASK6_README.md.
function parseUserAgent(userAgentString) {
  const ua = userAgentString || "";
  const result = new UAParser(ua).getResult();

  const browser = result.browser.name || "Unknown";
  const operatingSystem = result.os.name || "Unknown";

  let deviceType = "Desktop";
  if (result.device.type === "mobile" || result.device.type === "tablet") {
    deviceType = "Mobile";
  }

  // ua-parser-js checks Edge's "Edg/", Opera's "OPR/", Samsung Internet's
  // "SamsungBrowser/" etc. ahead of the generic "Chrome/" token, so
  // `browser.name === "Chrome"` here already excludes every other
  // Chromium-based browser (Edge, Opera, Samsung Internet, Brave's default
  // UA, Vivaldi, etc.) — it is not a plain substring check on "Chrome".
  const isChrome = browser === "Chrome";

  return { browser, operatingSystem, deviceType, isChrome, rawUserAgent: ua };
}

// --- IST mobile login window ------------------------------------------------
//
// Always computed from Asia/Kolkata via Intl, never the server's local
// timezone/offset. Window is 10:00 AM inclusive to 1:00 PM exclusive.
function isWithinMobileLoginWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= 10 * 60 && minutesSinceMidnight < 13 * 60; // [10:00, 13:00)
}

module.exports = { getClientIp, parseUserAgent, isWithinMobileLoginWindow };
