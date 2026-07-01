/* ============================================================
   api.js — TimberPro data API (reads/writes timber_db).
   Mounted at /api by server.js. Uses the db.js pool.
   NOTE: no auth yet — order history is filtered by email only
   (demo-grade). Add sessions/JWT before production.
   ============================================================ */
"use strict";

const express = require("express");
const pool = require("./db");
const router = express.Router();

/* ---------- GET /api/catalog — same shape as window.__TIMBER_DATA__ ---------- */
router.get("/catalog", async (req, res) => {
  try {
    const [cats] = await pool.query("SELECT id, name, slug FROM categories WHERE status = 1");
    const [prods] = await pool.query(
      "SELECT p.*, c.slug AS cat_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.status = 'active'"
    );
    const [tiers] = await pool.query("SELECT product_id, min_qty, price FROM product_bulk_tiers");
    const [tagRows] = await pool.query("SELECT pt.product_id, t.slug FROM product_tags pt JOIN tags t ON pt.tag_id = t.id");
    const [finRows] = await pool.query("SELECT product_id, finish FROM product_finishes");

    const tiersBy = {}, tagsBy = {}, finBy = {};
    tiers.forEach((r) => { (tiersBy[r.product_id] = tiersBy[r.product_id] || []).push({ minQty: r.min_qty, price: +r.price }); });
    tagRows.forEach((r) => { (tagsBy[r.product_id] = tagsBy[r.product_id] || []).push(r.slug); });
    finRows.forEach((r) => { (finBy[r.product_id] = finBy[r.product_id] || []).push(r.finish); });

    const products = prods.map((p) => ({
      id: p.slug,
      name: p.name,
      sku: p.sku,
      category: p.cat_slug,
      species: p.species,
      grade: p.grade,
      type: p.type,
      unit: p.unit,
      price: p.price == null ? null : +p.price,
      stock: p.stock,
      rating: +p.rating,
      tags: tagsBy[p.id] || [],
      finishes: finBy[p.id] || [],
      image: p.image,
      short: p.short_desc,
      description: p.description,
      dimensions: { length_mm: p.length_mm, width_mm: p.width_mm, thickness_mm: p.thickness_mm },
      bulkTiers: tiersBy[p.id] || []
    }));

    res.json({ currency: "RM", categories: cats.map((c) => ({ id: c.slug, name: c.name })), products });
  } catch (e) {
    console.error("[api] catalog:", e.message);
    res.status(500).json({ error: "Catalog query failed." });
  }
});

/* ---------- POST /api/orders — persist order + items + payment + inventory ---------- */
router.post("/orders", async (req, res) => {
  const b = req.body || {};
  const items = b.items || [];
  const cust = b.customer || {};
  if (!items.length) return res.status(400).json({ error: "No items." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const slugs = items.map((i) => i.id);
    const [rows] = await conn.query("SELECT id, slug, name FROM products WHERE slug IN (?)", [slugs]);
    const bySlug = {};
    rows.forEach((r) => { bySlug[r.slug] = r; });

    const orderNumber = b.order_number || ("ORD" + Date.now());
    const [o] = await conn.query(
      "INSERT INTO orders (order_number,total,status,delivery_method,ship_name,ship_company,ship_email,ship_phone,ship_address,ship_city,ship_postcode,ship_state,ship_country,notes) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [orderNumber, b.total || 0, "pending", cust.deliveryMethod === "collect" ? "collect" : "delivery",
        ((cust.firstName || "") + " " + (cust.lastName || "")).trim() || null, cust.company || null,
        cust.email || null, cust.phone || null, cust.address || null, cust.city || null,
        cust.postcode || null, cust.state || null, cust.country || null, cust.notes || null]
    );
    const orderId = o.insertId;

    // seed the timeline with the first step (drives the Track Order page)
    await conn.query(
      "INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'pending', 'Order submitted')",
      [orderId]
    );

    for (const it of items) {
      const p = bySlug[it.id];
      const qty = parseInt(it.qty, 10) || 1;
      await conn.query(
        "INSERT INTO order_items (order_id,product_id,product_name,unit_price,quantity,subtotal) VALUES (?,?,?,?,?,?)",
        [orderId, p ? p.id : null, it.name || (p && p.name) || it.id, it.unit || 0, qty, it.total || (it.unit || 0) * qty]
      );
      if (p) {
        await conn.query("INSERT INTO inventory_logs (product_id,qty_change,reason,ref_id) VALUES (?,?, 'order', ?)", [p.id, -qty, orderId]);
        await conn.query("UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?", [qty, p.id]);
      }
    }

    const pay = b.payment || {};
    await conn.query(
      "INSERT INTO payments (order_id,method,amount,transaction_id,status) VALUES (?,?,?,?,?)",
      [orderId, pay.method || "cod", b.total || 0, pay.transaction_id || null, pay.status || "pending"]
    );

    await conn.commit();
    res.json({ order_number: orderNumber, id: orderId });
  } catch (e) {
    await conn.rollback();
    console.error("[api] orders:", e.message);
    res.status(500).json({ error: "Order failed." });
  } finally {
    conn.release();
  }
});

/* ---------- GET /api/orders?email= — order history for one customer ---------- */
router.get("/orders", async (req, res) => {
  const email = req.query.email;
  if (!email) return res.json({ orders: [] });
  try {
    const [orders] = await pool.query("SELECT * FROM orders WHERE ship_email = ? ORDER BY created_at DESC", [email]);
    const ids = orders.map((o) => o.id);
    const itemsBy = {};
    if (ids.length) {
      const [items] = await pool.query("SELECT * FROM order_items WHERE order_id IN (?)", [ids]);
      items.forEach((it) => { (itemsBy[it.order_id] = itemsBy[it.order_id] || []).push(it); });
    }
    const mapped = orders.map((o) => ({
      id: o.order_number,
      status: o.status,
      createdAt: o.created_at,
      subtotal: +o.total,
      customer: { firstName: o.ship_name, deliveryMethod: o.delivery_method, address: o.ship_address, city: o.ship_city },
      items: (itemsBy[o.id] || []).map((it) => ({ id: null, name: it.product_name, qty: it.quantity, unit: +it.unit_price, total: +it.subtotal }))
    }));
    res.json({ orders: mapped });
  } catch (e) {
    console.error("[api] orders get:", e.message);
    res.status(500).json({ error: "Fetch failed." });
  }
});

/* ---------- GET /api/track?order=&email= — public order tracking ----------
   No login. Returns status + timeline ONLY when the order number and email
   both match. Minimal payload (no pricing/PII) for a public endpoint. */
router.get("/track", async (req, res) => {
  const orderNo = String(req.query.order || "").trim();
  const email = String(req.query.email || "").trim();
  if (!orderNo || !email) return res.status(400).json({ error: "Order number and email are required." });
  try {
    // email comparison is case-insensitive via the column's collation
    const [rows] = await pool.query(
      "SELECT id, order_number, status, delivery_method, est_delivery, created_at FROM orders WHERE order_number = ? AND ship_email = ?",
      [orderNo, email]
    );
    if (!rows.length) return res.status(404).json({ error: "No order matches that number and email." });
    const o = rows[0];
    const [hist] = await pool.query(
      "SELECT status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY id ASC, created_at ASC",
      [o.id]
    );
    res.json({
      order: {
        orderNumber: o.order_number,
        status: o.status,
        deliveryMethod: o.delivery_method,
        estDelivery: o.est_delivery,
        createdAt: o.created_at,
        history: hist.map((h) => ({ status: h.status, note: h.note || "", at: h.created_at }))
      }
    });
  } catch (e) {
    console.error("[api] track:", e.message);
    res.status(500).json({ error: "Lookup failed." });
  }
});

/* ---------- POST /api/quotes ---------- */
router.post("/quotes", async (req, res) => {
  const b = req.body || {};
  try {
    let productId = null;
    if (b.productSlug) {
      const [r] = await pool.query("SELECT id FROM products WHERE slug = ?", [b.productSlug]);
      if (r[0]) productId = r[0].id;
    }
    await pool.query(
      "INSERT INTO quotes (product_id,name,email,phone,company,quantity,dimensions,message) VALUES (?,?,?,?,?,?,?,?)",
      [productId, b.name || "", b.email || "", b.phone || null, b.company || null, b.quantity || null, b.dimensions || null, b.message || null]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[api] quotes:", e.message);
    res.status(500).json({ error: "Quote failed." });
  }
});

/* ---------- POST /api/contact ---------- */
router.post("/contact", async (req, res) => {
  const b = req.body || {};
  try {
    await pool.query(
      "INSERT INTO contact_messages (name,company,phone,email,topic,message) VALUES (?,?,?,?,?,?)",
      [b.fullName || b.name || "", b.company || null, b.phone || null, b.email || "", b.topic || null, b.message || ""]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[api] contact:", e.message);
    res.status(500).json({ error: "Contact failed." });
  }
});

/* ---------- GET /api/settings/company — PUBLIC, safe fields only ----------
   The storefront reads this for footer/contact info. Never exposes SMTP
   credentials or system config — only the public-facing company details. */
router.get("/settings/company", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT data FROM settings WHERE section = 'company'");
    if (!rows.length) return res.json({ company: null });
    const c = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
    res.json({
      company: {
        name: c.name || "", email: c.email || "", phone: c.phone || "", hours: c.hours || "",
        address: c.address || "", city: c.city || "", postcode: c.postcode || "",
        country: c.country || "", currency: c.currency || "RM"
      }
    });
  } catch (e) {
    console.error("[api] company settings:", e.message);
    res.status(500).json({ error: "Lookup failed." });
  }
});

/* ---------- GET /api/settings/site — PUBLIC site flags (maintenance) ----------
   Minimal + safe: just the maintenance flag and the company name for the
   holding page. The storefront reads this on every page load. */
router.get("/settings/site", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT section, data FROM settings WHERE section IN ('system','company')");
    let sys = {}, comp = {};
    rows.forEach((r) => { const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data; if (r.section === "system") sys = d; else comp = d; });
    res.json({ maintenanceMode: !!sys.maintenanceMode, companyName: comp.name || "TimberPro" });
  } catch (e) {
    console.error("[api] site settings:", e.message);
    res.status(500).json({ error: "Lookup failed." });
  }
});

module.exports = router;
