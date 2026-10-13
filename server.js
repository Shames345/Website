const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const FILE = "users.json";

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, "[]");
}

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
}));

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SoonBaba</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #0b0b12;
  color: white;
  font-family: Arial, sans-serif;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 20px;
}

.card {
  width: 100%;
  max-width: 380px;
  background: #151521;
  padding: 28px;
  border-radius: 18px;
  border: 1px solid #34344a;
}

h1 {
  text-align: center;
  color: #a78bfa;
}

p {
  text-align: center;
  color: #aaa;
}

input, button {
  width: 100%;
  padding: 13px;
  margin-top: 12px;
  border-radius: 9px;
  font-size: 15px;
}

input {
  background: #0b0b12;
  color: white;
  border: 1px solid #444;
}

button {
  background: #8b5cf6;
  color: white;
  border: 0;
  cursor: pointer;
  font-weight: bold;
}

.switch {
  background: #292538;
}

#message {
  color: #c4b5fd;
  overflow-wrap: anywhere;
}
</style>
</head>

<body>
<div class="card">
  <h1>SoonBaba</h1>
  <p id="subtitle">Create your account</p>

  <form id="form">
    <input id="username"
      placeholder="Username"
      minlength="3"
      maxlength="30"
      required>

    <input id="email"
      type="email"
      placeholder="Email"
      maxlength="254"
      required>

    <input id="password"
      type="password"
      placeholder="Password"
      minlength="8"
      maxlength="128"
      required>

    <button id="submit">Sign Up</button>
  </form>

  <button class="switch" id="toggle">
    Already registered? Log In
  </button>

  <button id="logout" hidden>Log Out</button>
  <p id="message"></p>
</div>

<script>
let mode = "signup";
const $ = id => document.getElementById(id);

$("toggle").onclick = () => {
  mode = mode === "signup" ? "login" : "signup";

  $("subtitle").textContent =
    mode === "signup"
      ? "Create your account"
      : "Welcome back";

  $("submit").textContent =
    mode === "signup" ? "Sign Up" : "Log In";

  $("toggle").textContent =
    mode === "signup"
      ? "Already registered? Log In"
      : "New here? Sign Up";

  $("username").hidden = mode === "login";
  $("username").required = mode === "signup";
  $("password").value = "";
  $("message").textContent = "";
};

$("form").onsubmit = async e => {
  e.preventDefault();

  const data = {
    username: $("username").value,
    email: $("email").value,
    password: $("password").value
  };

  try {
    const res = await fetch("/api/" + mode, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    $("message").textContent = result.message;

    if (res.ok) await checkLogin();
  } catch {
    $("message").textContent =
      "Server connection failed.";
  }
};

async function checkLogin() {
  try {
    const res = await fetch("/api/me");
    const user = await res.json();

    if (user.loggedIn) {
      $("subtitle").textContent =
        "Welcome, " + user.username + "!";

      $("form").hidden = true;
      $("toggle").hidden = true;
      $("logout").hidden = false;
    } else {
      $("form").hidden = false;
      $("toggle").hidden = false;
      $("logout").hidden = true;
    }
  } catch {
    $("message").textContent = "Unable to connect to server.";
  }
}

$("logout").onclick = async () => {
  try {
    const res = await fetch("/api/logout", {
      method: "POST"
    });

    const data = await res.json();
    $("message").textContent = data.message;

    mode = "login";
    $("form").reset();

    $("username").hidden = true;
    $("username").required = false;
    $("subtitle").textContent = "Welcome back";
    $("submit").textContent = "Log In";
    $("toggle").textContent = "New here? Sign Up";

    await checkLogin();
  } catch {
    $("message").textContent = "Logout failed.";
  }
};

checkLogin();
</script>
</body>
</html>`);
});

function readUsers() {
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(FILE, JSON.stringify(users, null, 2));
}

app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      username.trim().length < 3 ||
      username.length > 30 ||
      email.trim().length === 0 ||
      email.length > 254 ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Enter valid details. Password: 8+ characters."
      });
    }

    const users = readUsers();
    const cleanEmail = email.trim().toLowerCase();

    if (users.some(u => u.email === cleanEmail)) {
      return res.status(409).json({
        message: "Email already registered."
      });
    }

    const user = {
      username: username.trim(),
      email: cleanEmail,
      passwordHash: await bcrypt.hash(password, 12)
    };

    users.push(user);
    saveUsers(users);

    req.session.userEmail = user.email;

    res.json({
      message: "Account created successfully!"
    });
  } catch {
    res.status(500).json({
      message: "Server error during signup."
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 128
    ) {
      return res.status(400).json({
        message: "Invalid details."
      });
    }

    const user = readUsers().find(
      u => u.email === email.trim().toLowerCase()
    );

    if (
      !user ||
      !await bcrypt.compare(password, user.passwordHash)
    ) {
      return res.status(401).json({
        message: "Incorrect email or password."
      });
    }

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          message: "Session error."
        });
      }

      req.session.userEmail = user.email;

      res.json({
        message: "Login successful!"
      });
    });
  } catch {
    res.status(500).json({
      message: "Server error during login."
    });
  }
});

app.get("/api/me", (req, res) => {
  try {
    const user = readUsers().find(
      u => u.email === req.session.userEmail
    );

    if (!user) {
      return res.json({ loggedIn: false });
    }

    res.json({
      loggedIn: true,
      username: user.username
    });
  } catch {
    res.status(500).json({
      message: "Could not load user."
    });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({
        message: "Logout failed."
      });
    }

    res.clearCookie("connect.sid");

    res.json({
      message: "Logged out successfully!"
    });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("SoonBaba server running on port " + PORT);
});
