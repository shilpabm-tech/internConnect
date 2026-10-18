const express = require("express");
const router = express.Router();
const User = require("../Model/User");

router.post("/sync", async (req, res) => {
  const { firebaseUid, name, email, photo } = req.body;

  if (!firebaseUid) {
    return res.status(400).json({ error: "firebaseUid is required" });
  }

  try {
    const user = await User.findOneAndUpdate(
      { firebaseUid: firebaseUid },
      {
        $set: {
          name: name,
          email: email,
          photo: photo,
        },
        $setOnInsert: {
          firebaseUid: firebaseUid,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
    res.status(200).json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

router.get("/:firebaseUid", async (req, res) => {
  const { firebaseUid } = req.params;
  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;