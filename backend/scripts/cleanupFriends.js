require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../Model/User");

const [, , targetFirebaseUid, ...keepFirebaseUids] = process.argv;

if (!targetFirebaseUid) {
  console.log(
    "Usage: node scripts/cleanupFriends.js <targetFirebaseUid> <realFriendFirebaseUid1> <realFriendFirebaseUid2> ..."
  );
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.DATABASE_URL);

  const targetUser = await User.findOne({ firebaseUid: targetFirebaseUid });
  if (!targetUser) {
    console.log("Target user not found.");
    await mongoose.disconnect();
    return;
  }

  const keepUsers = await User.find({ firebaseUid: { $in: keepFirebaseUids } });
  const keepIds = keepUsers.map((u) => u._id);

  console.log(`Before: ${targetUser.friends.length} entries in friends array`);
  console.log(`Keeping ${keepIds.length} real, resolved friend(s):`, keepUsers.map(u => u.name));

  await User.findByIdAndUpdate(targetUser._id, { $set: { friends: keepIds } });

  const updated = await User.findOne({ firebaseUid: targetFirebaseUid });
  console.log(`After: ${updated.friends.length} entries in friends array`);

  await mongoose.disconnect();
}

run();