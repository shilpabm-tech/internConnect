const express = require("express");
const router = express.Router();
const Post = require("../Model/Post");
const User = require("../Model/User");
const Share = require("../Model/Share");
const Notification = require("../Model/Notification");
const { getDailyPostLimit } = require("../utils/postLimit");
const { getISTDayRange } = require("../utils/dateUtils");

// 1. Create a post
router.post("/", async (req, res) => {
  const { firebaseUid, mediaUrl, mediaType, caption } = req.body;

  if (!firebaseUid || !mediaUrl || !mediaType) {
    return res
      .status(400)
      .json({ error: "firebaseUid, mediaUrl and mediaType are required" });
  }
  if (!["photo", "video"].includes(mediaType)) {
    return res.status(400).json({ error: "mediaType must be 'photo' or 'video'" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const friendCount = user.friends.length;
    const limit = getDailyPostLimit(friendCount);

    if (friendCount === 0) {
      return res.status(403).json({
        error: "You need at least 1 friend to post in the Public Space.",
        friendCount: 0,
        dailyLimit: 0,
        unlimited: false,
        postsUsedToday: 0,
        remaining: 0,
      });
    }

    const { startOfDay, endOfDay } = getISTDayRange();
    const postsToday = await Post.countDocuments({
      user: user._id,
      createdAt: { $gte: startOfDay, $lt: endOfDay },
    });

    if (limit !== Infinity && postsToday >= limit) {
      return res.status(403).json({
        error: `Daily posting limit reached. You can post up to ${limit} time(s) per day with ${friendCount} friend(s).`,
        friendCount,
        dailyLimit: limit,
        unlimited: false,
        postsUsedToday: postsToday,
        remaining: 0,
      });
    }

    const post = new Post({
      user: user._id,
      mediaUrl,
      mediaType,
      caption,
    });

    const savedPost = await post.save();

    const responseBody = savedPost.toObject();
    responseBody.quota = {
      friendCount,
      dailyLimit: limit === Infinity ? null : limit,
      unlimited: limit === Infinity,
      postsUsedToday: postsToday + 1,
      remaining: limit === Infinity ? null : limit - (postsToday + 1),
    };

    res.status(201).json(responseBody);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 2. Get all posts (feed)
router.get("/", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("user", "name email photo firebaseUid")
      .sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 3. Get a single post by ID
router.get("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("user", "name email photo firebaseUid")
      .populate("comments.user", "name email photo firebaseUid");
    if (!post) {
      return res.status(404).json({ error: "post not found" });
    }
    res.status(200).json(post);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 4. Delete a post (only by its owner) — also cleans up related Share/Notification records
router.delete("/:id", async (req, res) => {
  const { firebaseUid } = req.body;
  if (!firebaseUid) {
    return res.status(400).json({ error: "firebaseUid is required" });
  }

  try {
    const post = await Post.findById(req.params.id).populate("user", "firebaseUid");
    if (!post) {
      return res.status(404).json({ error: "post not found" });
    }
    if (post.user.firebaseUid !== firebaseUid) {
      return res.status(403).json({ error: "not authorized to delete this post" });
    }

    await Post.findByIdAndDelete(req.params.id);
    await Share.deleteMany({ post: post._id });
    await Notification.deleteMany({ post: post._id });

    res.status(200).json({ status: "deleted", postId: post._id });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 5. Unsend a share (only by the original sender, only before the recipient has read it)
router.delete("/share/:shareId", async (req, res) => {
  const { firebaseUid } = req.body;
  if (!firebaseUid) {
    return res.status(400).json({ error: "firebaseUid is required" });
  }

  try {
    const share = await Share.findById(req.params.shareId);
    if (!share) {
      return res.status(404).json({ error: "share not found" });
    }

    const sender = await User.findOne({ firebaseUid });
    if (!sender) {
      return res.status(404).json({ error: "user not found" });
    }

    if (share.sender.toString() !== sender._id.toString()) {
      return res.status(403).json({ error: "not authorized to unsend this share" });
    }

    const notification = await Notification.findOne({ share: share._id });
    if (notification && notification.isRead) {
      return res
        .status(403)
        .json({ error: "Cannot unsend a share after the recipient has viewed it." });
    }

    await Share.findByIdAndDelete(share._id);
    if (notification) {
      await Notification.findByIdAndDelete(notification._id);
    }

    const post = await Post.findById(share.post);
    if (post) {
      post.shareCount = Math.max(0, post.shareCount - 1);
      await post.save();
    }

    res.status(200).json({
      status: "share_unsent",
      shareId: share._id,
      postId: share.post,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 6. Like / Unlike a post (toggle)
router.put("/:id/like", async (req, res) => {
  const { firebaseUid } = req.body;
  if (!firebaseUid) {
    return res.status(400).json({ error: "firebaseUid is required" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "post not found" });
    }

    const alreadyLiked = post.likes.some(
      (likeUserId) => likeUserId.toString() === user._id.toString()
    );

    let updatedPost;
    if (alreadyLiked) {
      updatedPost = await Post.findByIdAndUpdate(
        req.params.id,
        { $pull: { likes: user._id } },
        { new: true }
      ).populate("user", "name email photo firebaseUid");
    } else {
      updatedPost = await Post.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { likes: user._id } },
        { new: true }
      ).populate("user", "name email photo firebaseUid");
    }

    res.status(200).json({
      status: alreadyLiked ? "unliked" : "liked",
      likeCount: updatedPost.likes.length,
      post: updatedPost,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 7. Add a comment to a post
router.post("/:id/comment", async (req, res) => {
  const { firebaseUid, text } = req.body;

  if (!firebaseUid || !text) {
    return res.status(400).json({ error: "firebaseUid and text are required" });
  }
  if (typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "comment text cannot be empty" });
  }

  try {
    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "post not found" });
    }

    post.comments.push({
      user: user._id,
      text: text.trim(),
    });

    const savedPost = await post.save();
    const updatedPost = await Post.findById(savedPost._id)
      .populate("user", "name email photo firebaseUid")
      .populate("comments.user", "name email photo firebaseUid");

    const newComment = updatedPost.comments[updatedPost.comments.length - 1];

    res.status(201).json({
      status: "commented",
      commentCount: updatedPost.comments.length,
      comment: newComment,
      post: updatedPost,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 8. Share a post with a specific friend (creates a Share record AND a linked Notification)
router.put("/:id/share", async (req, res) => {
  const { firebaseUid, recipientFirebaseUid } = req.body;

  if (!firebaseUid || !recipientFirebaseUid) {
    return res
      .status(400)
      .json({ error: "firebaseUid and recipientFirebaseUid are required" });
  }
  if (firebaseUid === recipientFirebaseUid) {
    return res.status(400).json({ error: "cannot share a post with yourself" });
  }

  try {
    const sender = await User.findOne({ firebaseUid });
    if (!sender) {
      return res.status(404).json({ error: "user not found" });
    }

    const recipient = await User.findOne({ firebaseUid: recipientFirebaseUid });
    if (!recipient) {
      return res.status(404).json({ error: "recipient not found" });
    }

    const isFriend = sender.friends.some(
      (friendId) => friendId.toString() === recipient._id.toString()
    );
    if (!isFriend) {
      return res
        .status(403)
        .json({ error: "you can only share posts with your friends" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: "post not found" });
    }

    const share = await Share.create({
      post: post._id,
      sender: sender._id,
      recipient: recipient._id,
    });

    const notification = await Notification.create({
      recipient: recipient._id,
      sender: sender._id,
      type: "share",
      post: post._id,
      share: share._id,
      message: `${sender.name || "Someone"} shared a post with you.`,
    });

    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { $inc: { shareCount: 1 } },
      { new: true }
    )
      .populate("user", "name email photo firebaseUid")
      .populate("comments.user", "name email photo firebaseUid");

    res.status(201).json({
      status: "shared",
      shareCount: updatedPost.shareCount,
      post: updatedPost,
      share,
      notification,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

// 9. Get posts that have been shared with the current user
router.get("/shared/:firebaseUid", async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const shares = await Share.find({ recipient: user._id })
      .populate("sender", "name email photo firebaseUid")
      .populate({
        path: "post",
        populate: [
          { path: "user", select: "name email photo firebaseUid" },
          { path: "comments.user", select: "name email photo firebaseUid" },
        ],
      })
      .sort({ createdAt: -1 });

    res.status(200).json(shares);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

module.exports = router;