const crypto = require("crypto");

function generateNumericCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

module.exports = { generateNumericCode, hashCode };