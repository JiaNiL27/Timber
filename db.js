/* ============================================================
   db.js — MySQL/MariaDB connection pool for timber_db.
   Reads DB_* from the environment; defaults to a local XAMPP
   setup (root / no password). Used by api.js.
   ============================================================ */
"use strict";

const mysql = require("mysql2/promise");

// Enable SSL only when DB_SSL=true (e.g. Aiven, which requires TLS).
// With a CA cert -> verify it; without -> encrypt but skip verification.
// Local XAMPP leaves DB_SSL unset, so behaviour is unchanged there.
const ssl = process.env.DB_SSL === "true"
  ? (process.env.DB_CA_CERT ? { ca: process.env.DB_CA_CERT } : { rejectUnauthorized: false })
  : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "timber_db",
  ssl,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
