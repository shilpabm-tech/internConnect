const express = require("express");
const router = express.Router();
const Notification = require("../Model/Notification");
const User = require("../Model/User");

// 1. Unread notification count
router.get("/:firebaseUid/unread-count", async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });

    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const count = await Notification.countDocuments({
      recipient: user._id,
      isRead: false,
    });

    res.status(200).json({ count });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 2. List a user's notifications
router.get("/:firebaseUid", async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });

    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const notifications = await Notification.find({
      recipient: user._id,
    })
      .populate("sender", "name email photo firebaseUid")
      .populate("post", "mediaUrl mediaType caption")
      .sort({ createdAt: -1 });

    res.status(200).json(notifications);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 3. Mark a notification as read
router.patch("/:id/read", async (req, res) => {
  const { firebaseUid } = req.body;

  if (!firebaseUid) {
    return res.status(400).json({ error: "firebaseUid is required" });
  }

  try {
    const user = await User.findOne({ firebaseUid });

    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ error: "notification not found" });
    }

    if (notification.recipient.toString() !== user._id.toString()) {
      return res
        .status(403)
        .json({ error: "not authorized to modify this notification" });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json(notification);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;