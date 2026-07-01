/* ============================================================
   db/migrate-orders-quotes.js — Stage 3 additive migration.
   Safe & idempotent (re-runnable). Enables the admin Orders +
   RFQ/Quotation workflows. NO data loss — all changes additive.

     • orders.status  -> add 'processing','completed' (keep old values)
     • orders         -> add delivery_status column
     • quotes.status  -> add 'pending','approved','rejected','expired'
     • quotes         -> add valid_until, quoted_total
     • quote_items    -> new line-item table for the quotation builder

   Run:  node db/migrate-orders-quotes.js
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
    // 1) orders.status — widen enum (keep existing values for storefront)
    await conn.query(
      "ALTER TABLE orders MODIFY status ENUM('pending','processing','completed','cancelled','confirmed','shipped','delivered') NOT NULL DEFAULT 'pending'"
    );
    console.log("✓ orders.status enum widened");

    // 2) orders.delivery_status — new column
    if (!(await hasColumn("orders", "delivery_status"))) {
      await conn.query(
        "ALTER TABLE orders ADD COLUMN delivery_status ENUM('pending','preparing','shipped','delivered') NOT NULL DEFAULT 'pending' AFTER delivery_method"
      );
      console.log("✓ orders.delivery_status added");
    } else console.log("• orders.delivery_status already present");

    // 3) quotes.status — widen enum (keep new/quoted/closed)
    await conn.query(
      "ALTER TABLE quotes MODIFY status ENUM('pending','approved','rejected','expired','new','quoted','closed') NOT NULL DEFAULT 'pending'"
    );
    console.log("✓ quotes.status enum widened");

    // 4) quotes — validity + priced total
    if (!(await hasColumn("quotes", "valid_until"))) {
      await conn.query("ALTER TABLE quotes ADD COLUMN valid_until DATE NULL AFTER status");
      console.log("✓ quotes.valid_until added");
    } else console.log("• quotes.valid_until already present");
    if (!(await hasColumn("quotes", "quoted_total"))) {
      await conn.query("ALTER TABLE quotes ADD COLUMN quoted_total DECIMAL(10,2) NULL AFTER valid_until");
      console.log("✓ quotes.quoted_total added");
    } else console.log("• quotes.quoted_total already present");

    // 5) quote_items — builder line items
    await conn.query(
      "CREATE TABLE IF NOT EXISTS quote_items (" +
      "  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY," +
      "  quote_id INT UNSIGNED NOT NULL," +
      "  product_id INT UNSIGNED," +
      "  product_name VARCHAR(255) NOT NULL," +
      "  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0," +
      "  quantity INT UNSIGNED NOT NULL DEFAULT 1," +
      "  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0," +
      "  INDEX idx_qi_quote (quote_id)," +
      "  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE," +
      "  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    console.log("✓ quote_items table ready");

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
