/* ============================================================
   db/migrate-order-flow.js — Admin Order Flow migration.
   Safe & idempotent (re-runnable). NO data loss — all additive.

     • orders.status        -> add 'ready' (Ready for Delivery),
                               keep every existing value
     • orders.est_delivery  -> new optional DATE column
     • order_status_history -> new per-order timeline table
                               (one row per status change)

   Run:  node db/migrate-order-flow.js
   (Run db/migrate-orders-quotes.js first if you haven't — it
    adds orders.delivery_status which this flow also relies on.)
   ============================================================ */
"use strict";

try { require("dotenv").config(); } catch (e) { /* optional */ }
const mysql = require("mysql2/promise");

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "timber_db",
    waitForConnections: true, connectionLimit: 5
  });
  const db = process.env.DB_NAME || "timber_db";
  const conn = await pool.getConnection();

  async function hasColumn(table, col) {
    const [r] = await conn.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
      [db, table, col]
    );
    return r.length > 0;
  }

  try {
    // 1) orders.status — add 'ready'; keep all existing values (incl. legacy 'shipped')
    await conn.query(
      "ALTER TABLE orders MODIFY status " +
      "ENUM('pending','confirmed','processing','ready','delivered','completed','cancelled','shipped') " +
      "NOT NULL DEFAULT 'pending'"
    );
    console.log("✓ orders.status enum now includes 'ready' (Ready for Delivery)");

    // 2) orders.est_delivery — optional estimated delivery date
    if (!(await hasColumn("orders", "est_delivery"))) {
      await conn.query("ALTER TABLE orders ADD COLUMN est_delivery DATE NULL AFTER notes");
      console.log("✓ orders.est_delivery added");
    } else console.log("• orders.est_delivery already present");

    // 3) order_status_history — the timeline (one row per status change)
    await conn.query(
      "CREATE TABLE IF NOT EXISTS order_status_history (" +
      "  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY," +
      "  order_id   INT UNSIGNED NOT NULL," +
      "  status     VARCHAR(40) NOT NULL," +
      "  note       VARCHAR(500)," +
      "  notified   TINYINT(1) NOT NULL DEFAULT 0," +   // 1 once a customer email was sent
      "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
      "  INDEX idx_osh_order (order_id)," +
      "  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    console.log("✓ order_status_history table ready");

    // 4) backfill: ensure every existing order has at least its current status in the timeline
    await conn.query(
      "INSERT INTO order_status_history (order_id, status, note, created_at) " +
      "SELECT o.id, o.status, 'Imported from order record', o.created_at FROM orders o " +
      "WHERE NOT EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id)"
    );
    console.log("✓ existing orders backfilled into the timeline");

    console.log("\nMigration complete.");
  } catch (e) {
    console.error("Migration failed:", e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
