const express = require("express");
const _ = require("lodash");
const { db } = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  db.all(
    "SELECT id, title, body, created_at FROM posts ORDER BY created_at DESC LIMIT 10",
    (err, rows) => {
      if (err) {
        return res.status(500).send("Could not load posts");
      }
      const posts = rows.map((post) => ({
        ...post,
        preview: _.truncate(post.body, { length: 140 }),
      }));
      res.render("index", { title: "Home", posts });
    }
  );
});

module.exports = router;
