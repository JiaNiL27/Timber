/* ============================================================
   db.js — MySQL/MariaDB connection pool for timber_db.
   Reads DB_* from the environment; defaults to a local XAMPP
   setup (root / no password). Used by api.js.
   ============================================================ */
"use strict";

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "timber_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
