/* ============================================================
   db/migrate-settings.js — one-off, idempotent migration.
   Adds the `settings` table (company / email / system as JSON)
   and seeds the three default sections. Safe to re-run and
   NON-DESTRUCTIVE: existing data is never dropped, and existing
   settings rows are left untouched (INSERT ... the seed only
   fills a section that isn't there yet).
     Run:  node db/migrate-settings.js
   ============================================================ */
"use strict";

const pool = require("../db");

const DDL =
  "CREATE TABLE IF NOT EXISTS settings (" +
  "  section     VARCHAR(32) PRIMARY KEY," +
  "  data        JSON NOT NULL," +
  "  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" +
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

const DEFAULTS = {
  company: {
    name: "TimberPro", legalName: "TimberPro Sawmill Co.",
    email: "hello@timberpro.example", phone: "1-800-458-5697", hours: "Mon–Fri, 8am–6pm",
    address: "120 Mill Road", city: "Portland", postcode: "97201", country: "United States",
    currency: "USD", taxId: "", taxRate: 0
  },
  email: {
    fromName: "TimberPro", fromEmail: "orders@timberpro.example",
    smtpHost: "", smtpPort: 587, smtpUser: "", smtpSecure: true,
    notifyOrders: true, notifyQuotes: true
  },
  system: {
    dateFormat: "DD MMM YYYY", timezone: "America/Los_Angeles", currency: "USD",
    lowStockThreshold: 50, itemsPerPage: 20, theme: "light", maintenanceMode: false
  }
};

(async () => {
  try {
    await pool.query(DDL);
    let added = [];
    for (const section of Object.keys(DEFAULTS)) {
      // INSERT IGNORE preserves any section already present (keeps current data)
      const [r] = await pool.query(
        "INSERT IGNORE INTO settings (section, data) VALUES (?, ?)",
        [section, JSON.stringify(DEFAULTS[section])]
      );
      if (r.affectedRows) added.push(section);
    }
    console.log(added.length ? "✓ settings ready — seeded: " + added.join(", ") : "✓ settings already present — nothing to seed.");
    process.exit(0);
  } catch (e) {
    console.error("✗ migration failed:", e.message);
    process.exit(1);
  }
})();
