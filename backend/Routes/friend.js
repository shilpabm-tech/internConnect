const express = require("express");
const router = express.Router();
const User = require("../Model/User");

// Helper: find a user by firebaseUid, or return null
async function findUserByUid(firebaseUid) {
  return await User.findOne({ firebaseUid: firebaseUid });
}

// 1. Send a friend request
router.post("/request", async (req, res) => {
  const { fromFirebaseUid, toFirebaseUid } = req.body;
  if (!fromFirebaseUid || !toFirebaseUid) {
    return res.status(400).json({ error: "fromFirebaseUid and toFirebaseUid are required" });
  }
  if (fromFirebaseUid === toFirebaseUid) {
    return res.status(400).json({ error: "cannot send a friend request to yourself" });
  }

  try {
    const fromUser = await findUserByUid(fromFirebaseUid);
    const toUser = await findUserByUid(toFirebaseUid);
    if (!fromUser || !toUser) {
      return res.status(404).json({ error: "user not found" });
    }

    if (fromUser.friends.includes(toUser._id)) {
      return res.status(400).json({ error: "already friends" });
    }
    if (fromUser.sentFriendRequests.includes(toUser._id)) {
      return res.status(400).json({ error: "request already sent" });
    }

    // Crossed request: toUser already requested fromUser -> auto-accept
    if (fromUser.friendRequests.includes(toUser._id)) {
      await User.findByIdAndUpdate(fromUser._id, {
        $addToSet: { friends: toUser._id },
        $pull: { friendRequests: toUser._id, sentFriendRequests: toUser._id },
      });
      await User.findByIdAndUpdate(toUser._id, {
        $addToSet: { friends: fromUser._id },
        $pull: { friendRequests: fromUser._id, sentFriendRequests: fromUser._id },
      });
      return res.status(200).json({ status: "auto-accepted", message: "you were both already requesting each other" });
    }

    await User.findByIdAndUpdate(fromUser._id, {
      $addToSet: { sentFriendRequests: toUser._id },
    });
    await User.findByIdAndUpdate(toUser._id, {
      $addToSet: { friendRequests: fromUser._id },
    });

    res.status(200).json({ status: "request sent" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 2. Accept a friend request
router.post("/accept", async (req, res) => {
    console.log("Accept route hit");
  console.log(req.body);
  const { firebaseUid, requesterFirebaseUid } = req.body;
  if (!firebaseUid || !requesterFirebaseUid) {
    return res.status(400).json({ error: "firebaseUid and requesterFirebaseUid are required" });
  }

  try {
    const user = await findUserByUid(firebaseUid);
    const requester = await findUserByUid(requesterFirebaseUid);
    console.log("User:", user);
    console.log("Requester:", requester);
    if (!user || !requester) {
      return res.status(404).json({ error: "user not found" });
    }
    console.log("Friend requests:", user.friendRequests);
    console.log("Requester _id:", requester._id);



    if (!user.friendRequests.includes(requester._id)) {
      return res.status(400).json({ error: "no pending request from this user" });
    }

    await User.findByIdAndUpdate(user._id, { 
      $addToSet: { friends: requester._id },
      $pull: { friendRequests: requester._id },
    });
    await User.findByIdAndUpdate(requester._id, {
      $addToSet: { friends: user._id },
      $pull: { sentFriendRequests: user._id },
    });

    res.status(200).json({ status: "accepted" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 3. Reject a friend request
router.post("/reject", async (req, res) => {
    console.log("Accept body:", req.body);
  const { firebaseUid, requesterFirebaseUid } = req.body;
  if (!firebaseUid || !requesterFirebaseUid) {
    return res.status(400).json({ error: "firebaseUid and requesterFirebaseUid are required" });
  }

  try {
    const user = await findUserByUid(firebaseUid);
    const requester = await findUserByUid(requesterFirebaseUid);
    if (!user || !requester) {
      return res.status(404).json({ error: "user not found" });
    }

    await User.findByIdAndUpdate(user._id, {
      $pull: { friendRequests: requester._id },
    });
    await User.findByIdAndUpdate(requester._id, {
      $pull: { sentFriendRequests: user._id },
    });

    res.status(200).json({ status: "rejected" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 4. Cancel a request you sent
router.post("/cancel", async (req, res) => {
  const { firebaseUid, targetFirebaseUid } = req.body;
  if (!firebaseUid || !targetFirebaseUid) {
    return res.status(400).json({ error: "firebaseUid and targetFirebaseUid are required" });
  }

  try {
    const user = await findUserByUid(firebaseUid);
    const target = await findUserByUid(targetFirebaseUid);
    if (!user || !target) {
      return res.status(404).json({ error: "user not found" });
    }

    await User.findByIdAndUpdate(user._id, {
      $pull: { sentFriendRequests: target._id },
    });
    await User.findByIdAndUpdate(target._id, {
      $pull: { friendRequests: user._id },
    });

    res.status(200).json({ status: "cancelled" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 5. Unfriend
router.post("/unfriend", async (req, res) => {
  const { firebaseUid, friendFirebaseUid } = req.body;
  if (!firebaseUid || !friendFirebaseUid) {
    return res.status(400).json({ error: "firebaseUid and friendFirebaseUid are required" });
  }

  try {
    const user = await findUserByUid(firebaseUid);
    const friend = await findUserByUid(friendFirebaseUid);
    if (!user || !friend) {
      return res.status(404).json({ error: "user not found" });
    }

    await User.findByIdAndUpdate(user._id, {
      $pull: { friends: friend._id },
    });
    await User.findByIdAndUpdate(friend._id, {
      $pull: { friends: user._id },
    });

    res.status(200).json({ status: "unfriended" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 6. List friends
router.get("/list/:firebaseUid", async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.params.firebaseUid }).populate(
      "friends",
      "name email photo firebaseUid"
    );
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }
    res.status(200).json(user.friends);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 7. Friend count
router.get("/count/:firebaseUid", async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }
    res.status(200).json({ count: user.friends.length });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});
router.get("/requests/:firebaseUid", async (req, res) => {
  try {
    const user = await User.findOne({
      firebaseUid: req.params.firebaseUid,
    })
      .populate("friendRequests", "name email photo firebaseUid")
      .populate("sentFriendRequests", "name email photo firebaseUid");

    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    res.status(200).json({
      incoming: user.friendRequests,
      outgoing: user.sentFriendRequests,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      error: "internal server error",
    });
  }
});

module.exports = router;