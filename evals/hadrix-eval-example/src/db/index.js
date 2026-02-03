const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dataDir = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");
const db = new sqlite3.Database(dbPath);

const samplePosts = [
  {
    title: "Shipping a tiny product",
    body:
      "We kept the scope small, wrote everything down, and let the design breathe. The result is humble but solid.",
  },
  {
    title: "Notes from the build room",
    body:
      "A soft launch taught us more than weeks of planning. We tracked feedback, fixed the sharp edges, and kept momentum.",
  },
  {
    title: "On choosing fewer tools",
    body:
      "Our stack is boring on purpose: simple routes, lightweight storage, and predictable templates. It keeps us fast.",
  },
  {
    title: "Weekend coffee log",
    body:
      "Tried three new roasts, took a walk, and finally closed a few lingering issues. The small wins add up.",
  },
];

const sampleUsers = [
  {
    username: "maria",
    displayName: "Maria D.",
    bio: "Product designer, espresso fan, and keeper of the team sketchbook.",
  },
  {
    username: "devon",
    displayName: "Devon S.",
    bio: "Writes code for breakfast. Usually found rewriting the README.",
  },
];

function init() {
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, body TEXT, created_at TEXT)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, display_name TEXT, bio TEXT)"
    );

    db.get("SELECT COUNT(*) AS count FROM posts", (err, row) => {
      if (err) {
        return;
      }
      if (row.count === 0) {
        const stmt = db.prepare(
          "INSERT INTO posts (title, body, created_at) VALUES (?, ?, datetime('now'))"
        );
        samplePosts.forEach((post) => {
          stmt.run(post.title, post.body);
        });
        stmt.finalize();
      }
    });

    db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
      if (err) {
        return;
      }
      if (row.count === 0) {
        const stmt = db.prepare(
          "INSERT INTO users (username, display_name, bio) VALUES (?, ?, ?)"
        );
        sampleUsers.forEach((user) => {
          stmt.run(user.username, user.displayName, user.bio);
        });
        stmt.finalize();
      }
    });
  });
}

module.exports = { db, init };
