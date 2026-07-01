/* ============================================================
   db/import-catalog.js — one-time, idempotent catalogue import.
   Reads the canonical catalogue (data/products.js) and UPSERTs it
   into timber_db so the DATABASE becomes the source of truth:
     categories, products, product_bulk_tiers, product_finishes,
     tags, product_tags.
   Matching key = product.slug (the app id). Re-runnable: updates
   existing rows, inserts missing ones — never duplicates.

   Run:  node db/import-catalog.js
   ============================================================ */
"use strict";

try { require("dotenv").config(); } catch (e) { /* optional */ }
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

// Load the embedded catalogue (data/products.js sets window.__TIMBER_DATA__)
function loadCatalog() {
  const raw = fs.readFileSync(path.join(__dirname, "..", "data", "products.js"), "utf8");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(start, end + 1));
}

async function main() {
  const cat = loadCatalog();
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "timber_db",
    waitForConnections: true, connectionLimit: 5
  });
  const conn = await pool.getConnection();
  try {
    // ---- categories (by slug) ----
    const catId = {};
    for (const c of cat.categories) {
      await conn.query(
        "INSERT INTO categories (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
        [c.name, c.id]
      );
      const [r] = await conn.query("SELECT id FROM categories WHERE slug = ?", [c.id]);
      catId[c.id] = r[0].id;
    }

    // ---- tags (by slug) ----
    async function tagId(name) {
      const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      await conn.query("INSERT INTO tags (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)", [name, slug]);
      const [r] = await conn.query("SELECT id FROM tags WHERE slug = ?", [slug]);
      return r[0].id;
    }

    let inserted = 0, updated = 0;
    for (const p of cat.products) {
      const d = p.dimensions || {};
      const cols = [
        catId[p.category] || null, p.sku, p.name, p.id, p.species || null, p.grade || null,
        p.type || "buy-now", p.short || null, p.description || null,
        p.price == null ? null : p.price, p.unit || "pcs", p.stock || 0, p.rating || 0,
        d.length_mm || null, d.width_mm || null, d.thickness_mm || null, p.image || null
      ];
      const [exist] = await conn.query("SELECT id FROM products WHERE slug = ?", [p.id]);
      let productId;
      if (exist.length) {
        productId = exist[0].id;
        await conn.query(
          "UPDATE products SET category_id=?, sku=?, name=?, slug=?, species=?, grade=?, type=?, short_desc=?, description=?, price=?, unit=?, stock=?, rating=?, length_mm=?, width_mm=?, thickness_mm=?, image=?, status='active' WHERE id=?",
          [...cols, productId]
        );
        updated++;
      } else {
        const [ins] = await conn.query(
          "INSERT INTO products (category_id, sku, name, slug, species, grade, type, short_desc, description, price, unit, stock, rating, length_mm, width_mm, thickness_mm, image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          cols
        );
        productId = ins.insertId;
        inserted++;
      }

      // bulk tiers — replace
      await conn.query("DELETE FROM product_bulk_tiers WHERE product_id = ?", [productId]);
      for (const t of (p.bulkTiers || [])) {
        await conn.query("INSERT INTO product_bulk_tiers (product_id, min_qty, price) VALUES (?,?,?)", [productId, t.minQty, t.price]);
      }
      // finishes — replace
      await conn.query("DELETE FROM product_finishes WHERE product_id = ?", [productId]);
      for (const f of (p.finishes || [])) {
        await conn.query("INSERT INTO product_finishes (product_id, finish) VALUES (?,?)", [productId, f]);
      }
      // tags — replace
      await conn.query("DELETE FROM product_tags WHERE product_id = ?", [productId]);
      for (const tg of (p.tags || [])) {
        const tid = await tagId(tg);
        await conn.query("INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES (?,?)", [productId, tid]);
      }
    }

    const [[{ n }]] = await conn.query("SELECT COUNT(*) n FROM products");
    console.log(`Catalogue import complete: ${inserted} inserted, ${updated} updated. products table now has ${n} rows.`);
  } catch (e) {
    console.error("Import failed:", e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
