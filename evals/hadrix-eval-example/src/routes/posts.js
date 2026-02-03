const express = require("express");
const { db } = require("../db");

const router = express.Router();

router.get("/search", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const sql =
    "SELECT id, title, body, created_at FROM posts WHERE title LIKE '%" +
    q +
    "%' ORDER BY created_at DESC";

  db.all(sql, (err, rows) => {
    if (err) {
      return res.status(500).send("Search failed");
    }
    res.render("search", { title: "Search", posts: rows, q });
  });
});

router.get("/posts/:id", (req, res) => {
  const id = req.params.id;
  db.get(
    "SELECT id, title, body, created_at FROM posts WHERE id = ?",
    [id],
    (err, row) => {
      if (err) {
        return res.status(500).send("Post not found");
      }
      if (!row) {
        return res.status(404).send("Post not found");
      }
      res.render("post", { title: row.title, post: row });
    }
  );
});

module.exports = router;
