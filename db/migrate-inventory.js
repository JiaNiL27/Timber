/* ============================================================
   db/migrate-inventory.js — one-off, idempotent migration.
   Adds the reference / supplier / note / created_by columns to
   inventory_logs (needed by the Inventory module). Safe to re-run:
   each ADD COLUMN is skipped if the column already exists.
     Run:  node db/migrate-inventory.js
   ============================================================ */
"use strict";

const pool = require("../db");

const COLUMNS = [
  { name: "reference",  ddl: "ADD COLUMN reference VARCHAR(120) NULL" },
  { name: "supplier",   ddl: "ADD COLUMN supplier VARCHAR(160) NULL" },
  { name: "note",       ddl: "ADD COLUMN note VARCHAR(255) NULL" },
  { name: "created_by", ddl: "ADD COLUMN created_by VARCHAR(120) NULL DEFAULT 'Admin'" }
];

(async () => {
  try {
    const [existing] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_logs'"
    );
    const have = new Set(existing.map((r) => r.COLUMN_NAME));
    const todo = COLUMNS.filter((c) => !have.has(c.name));
    if (!todo.length) { console.log("✓ inventory_logs already migrated — nothing to do."); }
    else {
      await pool.query("ALTER TABLE inventory_logs " + todo.map((c) => c.ddl).join(", "));
      console.log("✓ added columns:", todo.map((c) => c.name).join(", "));
    }
    process.exit(0);
  } catch (e) {
    console.error("✗ migration failed:", e.message);
    process.exit(1);
  }
})();
