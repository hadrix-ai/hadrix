const express = require("express");
const { db } = require("../db");

const router = express.Router();

router.get("/profile", (req, res) => {
  const username = typeof req.query.user === "string" ? req.query.user : "maria";
  db.get(
    "SELECT username, display_name, bio FROM users WHERE username = ?",
    [username],
    (err, row) => {
      if (err) {
        return res.status(500).send("Could not load profile");
      }
      const user =
        row ||
        ({
          username,
          display_name: "Guest",
          bio: "",
        });
      res.render("profile", { title: "Profile", user });
    }
  );
});

router.post("/profile", (req, res) => {
  const username = req.body.user || "maria";
  const bio = req.body.bio || "";

  db.run(
    "UPDATE users SET bio = ? WHERE username = ?",
    [bio, username],
    () => {
      res.redirect(`/profile?user=${encodeURIComponent(username)}`);
    }
  );
});

module.exports = router;
