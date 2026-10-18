require("dotenv").config();
const bodyparser = require("body-parser");
const express = require("express");
const app = express();
const cors = require("cors");
const path = require("path");
const { connect } = require("./db");

const router = require("./Routes/index");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyparser.json({ limit: "50mb" }));
app.use(bodyparser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/resumes", express.static(path.join(__dirname, "resumes")));

app.get("/", (req, res) => {
  res.send("hello this is internshala backend");
});

app.use("/api", router);

connect()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });