const express = require("express");
const router = express.Router();
const application = require("../Model/Application");
const User = require("../Model/User");
const { getPlan } = require("../utils/plans");
const { getCurrentISTMonthKey } = require("../utils/dateUtils");

router.post("/", async (req, res) => {
  const firebaseUid = req.body.user?.uid;

  if (!firebaseUid) {
    return res
      .status(400)
      .json({ error: "unable to identify the applicant (missing user.uid)" });
  }

  try {
    let user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    const now = new Date();
    if (
      user.subscriptionPlan !== "free" &&
      user.subscriptionExpiresAt &&
      user.subscriptionExpiresAt < now
    ) {
      user = await User.findOneAndUpdate(
        { _id: user._id, subscriptionExpiresAt: { $lt: now } },
        { $set: { subscriptionPlan: "free", subscriptionExpiresAt: null } },
        { new: true }
      );
    }

    const currentMonthKey = getCurrentISTMonthKey();

    if (user.applicationCountMonth !== currentMonthKey) {
      user = await User.findOneAndUpdate(
        { _id: user._id, applicationCountMonth: { $ne: currentMonthKey } },
        { $set: { applicationCountThisMonth: 0, applicationCountMonth: currentMonthKey } },
        { new: true }
      ) || user;
    }

    const plan = getPlan(user.subscriptionPlan);

    const incrementFilter =
      plan.limit === Infinity
        ? { _id: user._id, applicationCountMonth: currentMonthKey }
        : {
            _id: user._id,
            applicationCountMonth: currentMonthKey,
            applicationCountThisMonth: { $lt: plan.limit },
          };

    const updatedUser = await User.findOneAndUpdate(
      incrementFilter,
      { $inc: { applicationCountThisMonth: 1 } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(403).json({
        error: `You have reached your monthly application limit for the ${plan.label} plan (${plan.limit} per month). Upgrade your plan to apply for more internships.`,
        subscriptionPlan: user.subscriptionPlan,
        planLimit: plan.limit === Infinity ? null : plan.limit,
        applicationCountThisMonth: user.applicationCountThisMonth,
      });
    }

    const applicationipdata = new application({
      company: req.body.company,
      category: req.body.category,
      coverLetter: req.body.coverLetter,
      user: req.body.user,
      Application: req.body.Application,
      body: req.body.body,
    });

    try {
      const data = await applicationipdata.save();
      res.status(201).json(data);
    } catch (saveError) {
      // Roll back the increment, but ONLY if we're still in the same
      // month bucket we incremented in. If the month has since rolled
      // over, this stale rollback must not touch the new month's
      // legitimate count. Also never allow the count to go below 0.
      await User.findOneAndUpdate(
        {
          _id: user._id,
          applicationCountMonth: currentMonthKey,
          applicationCountThisMonth: { $gt: 0 },
        },
        { $inc: { applicationCountThisMonth: -1 } }
      );
      console.log(saveError);
      res.status(500).json({ error: "internal server error" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const data = await application.find();
    res.json(data).status(200);
  } catch (error) {
    console.log(error);
    res.status(404).json({ error: "internal server error" });
  }
});
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const data = await application.findById(id);
    if (!data) {
      res.status(404).json({ error: "application not found" });
    }
    res.json(data).status(200);
  } catch (error) {
    console.log(error);
    res.status(404).json({ error: "internal server error" });
  }
});
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  let status;
  if (action === "accepted") {
    status = "accepted";
  } else if (action === "rejected") {
    status = "rejected";
  } else {
    res.status(404).json({ error: "Invalid action" });
    return;
  }
  try {
    const updateapplication = await application.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    );
    if (!updateapplication) {
      res.status(404).json({ error: "Not able to update the application" });
      return;
    }
    res.status(200).json({ sucess: true, data: updateapplication });
  } catch (error) {
    res.status(500).json({ error: "internal server error" });
  }
});
module.exports = router;