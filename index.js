// index.js — Express + Socket.IO — SAFE STATELESS MODE (RENDER COMPATIBLE)

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import http from "http";
import { Server } from "socket.io";
import mysql from "mysql2/promise";

// ----- BOOT TAG -----
console.log("BOOT TAG:", "2025-11-07-render-safe-stateless");

// ---------- DB MODE ----------
const DB_DISABLED =
  !process.env.MYSQL_URL &&
  !process.env.MYSQL_HOST;

if (DB_DISABLED) {
  console.warn("⚠️ DB DISABLED — stateless mode");
} else {
  console.log("ℹ️ DB CONFIG PRESENT — DB routes enabled");
}

// ---------- APP ----------
const app = express();
const ROOT_DIR = process.cwd();

// ---------- CORS ----------
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
  : [
      "https://pwarailway.netlify.app",
      "http://localhost:5173",
    ];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked"));
  },
  credentials: true,
}));

app.use(express.json({ limit: "256kb" }));

// ---------- UPLOADS ----------
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ---------- DB POOL (LAZY, NO STARTUP CHECK) ----------
let pool = null;

if (!DB_DISABLED) {
  pool = mysql.createPool({
    uri: process.env.MYSQL_URL,
    connectionLimit: 10,
  });
}

export { pool };

// ---------- DB GUARD ----------
function requireDb(_req, res, next) {
  if (DB_DISABLED) {
    return res.status(503).json({
      ok: false,
      error: "Database disabled in this deployment",
    });
  }
  next();
}

// ---------- HTTP + SOCKET ----------
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("🔌 socket connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("❌ socket disconnected:", socket.id);
  });
});

// ---------- BASIC ROUTES ----------
app.get("/", (_req, res) => {
  res.send("Rail backend running (stateless-safe)");
});

app.get("/api/version", (_req, res) => {
  res.json({
    ok: true,
    mode: DB_DISABLED ? "stateless" : "mysql",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: !DB_DISABLED,
  });
});

// ---------- UPLOAD (ALLOWED WITHOUT DB) ----------
app.post("/api/upload-template", upload.single("template"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No file uploaded" });
  }

  res.json({
    ok: true,
    file: req.file.originalname,
    storedAs: req.file.filename,
  });
});

// ---------- DB ROUTES BLOCKED WHEN DISABLED ----------
app.all("/api/*", requireDb, (_req, res) => {
  res.status(503).json({
    ok: false,
    error: "Database routes unavailable",
  });
});

// ---------- START SERVER (THIS IS WHAT RENDER NEEDS) ----------
const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
