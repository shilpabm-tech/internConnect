const crypto = require("crypto");

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateLettersOnlyPassword(length = 12) {
  if (typeof length !== "number" || length < 8) {
    throw new Error("length must be a number, and at least 8 for reasonable security");
  }

  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, LETTERS.length);
    password += LETTERS[randomIndex];
  }
  return password;
}

module.exports = { generateLettersOnlyPassword };