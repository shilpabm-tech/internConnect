require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../Model/User");

const [, , firebaseUid, countArg] = process.argv;
const count = parseInt(countArg, 10);

if (!firebaseUid || Number.isNaN(count)) {
  console.log("Usage: node scripts/testSeedFriends.js <firebaseUid> <count>");
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.DATABASE_URL);
  const dummyFriends = Array.from({ length: count }, () => new mongoose.Types.ObjectId());
  const updated = await User.findOneAndUpdate(
    { firebaseUid },
    { $set: { friends: dummyFriends } },
    { new: true }
  );
  if (!updated) {
    console.log("No user found with that firebaseUid — sync it first.");
  } else {
    console.log(`Set ${updated.friends.length} friend(s) on ${firebaseUid}`);
  }
  await mongoose.disconnect();
}

run();