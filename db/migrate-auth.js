/* ============================================================
   db/migrate-auth.js — one-off, idempotent, NON-DESTRUCTIVE.
   Stage 2 (auth): adds the `roles` table + users.role_id, seeds
   the three default roles, and ensures a working admin login.
   Safe to re-run — existing users/data are preserved.
     Run:  node db/migrate-auth.js
   ============================================================ */
"use strict";

const pool = require("../db");
const bcrypt = require("bcryptjs");

const MODULES = ["dashboard", "products", "inventory", "orders", "quotes", "customers", "analytics", "settings"];
function perms(overrides) {
  const o = {}; MODULES.forEach((m) => { o[m] = true; });
  Object.keys(overrides || {}).forEach((k) => { o[k] = overrides[k]; });
  return o;
}
const ROLES = [
  { id: "admin",   name: "Administrator", description: "Full access to every module.",            permissions: perms({}),                                          is_system: 1 },
  { id: "manager", name: "Manager",       description: "Operations, but no settings or users.",    permissions: perms({ settings: false }),                         is_system: 0 },
  { id: "staff",   name: "Staff",         description: "Day-to-day orders, products, inventory.",  permissions: perms({ customers: false, analytics: false, settings: false }), is_system: 0 }
];

const ADMIN_EMAIL = "admin@timberpro.example";
const ADMIN_PASSWORD = "admin1234";   // default — change after first login

(async () => {
  try {
    // 1) roles table
    await pool.query(
      "CREATE TABLE IF NOT EXISTS roles (" +
      "  id VARCHAR(32) PRIMARY KEY, name VARCHAR(80) NOT NULL, description VARCHAR(255)," +
      "  permissions JSON NOT NULL, is_system TINYINT(1) DEFAULT 0," +
      "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    for (const r of ROLES) {
      await pool.query(
        "INSERT IGNORE INTO roles (id, name, description, permissions, is_system) VALUES (?,?,?,?,?)",
        [r.id, r.name, r.description, JSON.stringify(r.permissions), r.is_system]
      );
    }

    // 2) users.role_id column (+ FK) if missing
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role_id'"
    );
    if (!cols.length) {
      await pool.query("ALTER TABLE users ADD COLUMN role_id VARCHAR(32) NULL");
      console.log("✓ added users.role_id");
    }
    const [fks] = await pool.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_users_role'"
    );
    if (!fks.length) {
      await pool.query("ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL");
      console.log("✓ added FK users.role_id → roles.id");
    }

    // 3) backfill: existing admins become staff of the 'admin' role
    await pool.query("UPDATE users SET role_id = 'admin' WHERE role = 'admin' AND role_id IS NULL");

    // 4) ensure a working admin login exists (create if absent; never clobber an existing one)
    const [u] = await pool.query("SELECT id FROM users WHERE email = ?", [ADMIN_EMAIL]);
    if (!u.length) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await pool.query(
        "INSERT INTO users (name, email, password, role, role_id, status) VALUES (?,?,?,?,?,1)",
        ["Sawmill Admin", ADMIN_EMAIL, hash, "admin", "admin"]
      );
      console.log("✓ created admin login  →  " + ADMIN_EMAIL + "  /  " + ADMIN_PASSWORD + "   (change it after first login)");
    } else {
      console.log("✓ admin login already exists (" + ADMIN_EMAIL + ") — left untouched");
    }

    console.log("✓ auth migration complete.");
    process.exit(0);
  } catch (e) {
    console.error("✗ migration failed:", e.message);
    process.exit(1);
  }
})();
