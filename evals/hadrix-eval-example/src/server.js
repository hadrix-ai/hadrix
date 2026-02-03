const path = require("path");
const express = require("express");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const { init } = require("./db");
const indexRoutes = require("./routes/index");
const postRoutes = require("./routes/posts");
const accountRoutes = require("./routes/account");

const app = express();

init();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(morgan("dev"));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/", indexRoutes);
app.use("/", postRoutes);
app.use("/", accountRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Hadrix Eval Example listening on ${port}`);
});
