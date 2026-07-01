/* ============================================================
   admin-api.js — TimberPro ADMIN data API (reads/writes timber_db).
   Mounted at /api/admin by server.js. Uses the db.js pool.
   Scope (this stage): product CRUD + image upload.
   NOTE: no auth yet — add staff sessions/JWT before production.
   ============================================================ */
"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const pool = require("./db");
const mailer = require("./mailer");
const auth = require("./auth");
const router = express.Router();

/* ---------- auth gate: every admin route needs a logged-in staff user,
   and each module is checked against the role's permissions ---------- */
router.use(auth.requireAuth);
router.use("/upload", auth.requirePermission("products"));
router.use("/products", auth.requirePermission("products"));
router.use("/orders", auth.requirePermission("orders"));
router.use("/quotes", auth.requirePermission("quotes"));
router.use("/inventory", auth.requirePermission("inventory"));
router.use("/settings", auth.requirePermission("settings"));
router.use("/users", auth.requirePermission("settings"));
router.use("/roles", auth.requirePermission("settings"));

/* ---------- image upload (multipart) -> assets/img/products/uploads ---------- */
const UPLOAD_DIR = path.join(__dirname, "assets", "img", "products", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase().replace(/[^.a-z0-9]/g, "");
    cb(null, "p-" + Date.now() + "-" + Math.round(Math.random() * 1e6) + ext);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },                      // 5 MB
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image (must be an image file ≤ 5MB)." });
  res.json({ url: "assets/img/products/uploads/" + req.file.filename });
});

/* ---------- helpers ---------- */
function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

async function mapProducts(rows) {
  const ids = rows.map((r) => r.id);
  const tiersBy = {}, tagsBy = {}, finBy = {};
  if (ids.length) {
    const [tiers] = await pool.query("SELECT product_id, min_qty, price FROM product_bulk_tiers WHERE product_id IN (?)", [ids]);
    const [tg] = await pool.query("SELECT pt.product_id, t.slug FROM product_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.product_id IN (?)", [ids]);
    const [fin] = await pool.query("SELECT product_id, finish FROM product_finishes WHERE product_id IN (?)", [ids]);
    tiers.forEach((r) => { (tiersBy[r.product_id] = tiersBy[r.product_id] || []).push({ minQty: r.min_qty, price: +r.price }); });
    tg.forEach((r) => { (tagsBy[r.product_id] = tagsBy[r.product_id] || []).push(r.slug); });
    fin.forEach((r) => { (finBy[r.product_id] = finBy[r.product_id] || []).push(r.finish); });
  }
  return rows.map((p) => ({
    id: p.slug, name: p.name, sku: p.sku, category: p.cat_slug, species: p.species, grade: p.grade,
    type: p.type, unit: p.unit, price: p.price == null ? null : +p.price, stock: p.stock,
    minStock: p.min_stock, rating: +p.rating, tags: tagsBy[p.id] || [], finishes: finBy[p.id] || [],
    image: p.image, short: p.short_desc, description: p.description, status: p.status,
    dimensions: { length_mm: p.length_mm, width_mm: p.width_mm, thickness_mm: p.thickness_mm },
    bulkTiers: tiersBy[p.id] || [], createdAt: p.created_at
  }));
}
const SELECT = "SELECT p.*, c.slug AS cat_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id";

/* ---------- GET /api/admin/products (all, incl. inactive) ---------- */
router.get("/products", async (req, res) => {
  try {
    const [rows] = await pool.query(SELECT + " ORDER BY p.created_at DESC, p.id DESC");
    res.json({ products: await mapProducts(rows) });
  } catch (e) { console.error("[admin] products:", e.message); res.status(500).json({ error: "Query failed." }); }
});

/* ---------- GET /api/admin/products/:slug ---------- */
router.get("/products/:slug", async (req, res) => {
  try {
    const [rows] = await pool.query(SELECT + " WHERE p.slug = ?", [req.params.slug]);
    if (!rows.length) return res.status(404).json({ error: "Not found." });
    res.json({ product: (await mapProducts(rows))[0] });
  } catch (e) { console.error("[admin] product:", e.message); res.status(500).json({ error: "Query failed." }); }
});

/* ---------- shared write: map body -> products columns ---------- */
async function catIdFromSlug(slug) {
  if (!slug) return null;
  const [r] = await pool.query("SELECT id FROM categories WHERE slug = ?", [slug]);
  return r.length ? r[0].id : null;
}
async function syncChildren(conn, productId, body) {
  if (Array.isArray(body.finishes)) {
    await conn.query("DELETE FROM product_finishes WHERE product_id = ?", [productId]);
    for (const f of body.finishes) if (f) await conn.query("INSERT INTO product_finishes (product_id, finish) VALUES (?,?)", [productId, f]);
  }
  if (Array.isArray(body.tags)) {
    await conn.query("DELETE FROM product_tags WHERE product_id = ?", [productId]);
    for (const name of body.tags) {
      if (!name) continue;
      const slug = slugify(name);
      await conn.query("INSERT INTO tags (name, slug) VALUES (?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)", [name, slug]);
      const [t] = await conn.query("SELECT id FROM tags WHERE slug = ?", [slug]);
      await conn.query("INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES (?,?)", [productId, t[0].id]);
    }
  }
}
function cols(b, categoryId) {
  const d = b.dimensions || {};
  const price = (b.type === "quote-only" || b.price === "" || b.price == null) ? null : +b.price;
  return {
    category_id: categoryId, sku: b.sku || null, name: b.name, species: b.species || null,
    grade: b.grade || null, type: b.type === "quote-only" ? "quote-only" : "buy-now",
    short_desc: b.short || null, description: b.description || null, price: price,
    unit: b.unit || "pcs", stock: parseInt(b.stock, 10) || 0, min_stock: parseInt(b.minStock, 10) || 10,
    length_mm: d.length_mm || null, width_mm: d.width_mm || null, thickness_mm: d.thickness_mm || null,
    image: b.image || null, status: b.status === "inactive" ? "inactive" : "active"
  };
}

/* ---------- POST /api/admin/products (create) ---------- */
router.post("/products", async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.sku) return res.status(400).json({ error: "Name and SKU are required." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // unique slug
    let slug = slugify(b.name) || "product";
    const [dup] = await conn.query("SELECT id FROM products WHERE slug = ?", [slug]);
    if (dup.length) slug = slug + "-" + Date.now();
    const c = cols(b, await catIdFromSlug(b.category));
    const [ins] = await conn.query(
      "INSERT INTO products (category_id, sku, name, slug, species, grade, type, short_desc, description, price, unit, stock, min_stock, length_mm, width_mm, thickness_mm, image, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [c.category_id, c.sku, c.name, slug, c.species, c.grade, c.type, c.short_desc, c.description, c.price, c.unit, c.stock, c.min_stock, c.length_mm, c.width_mm, c.thickness_mm, c.image, c.status]
    );
    await syncChildren(conn, ins.insertId, b);
    await conn.commit();
    res.json({ id: slug, slug: slug });
  } catch (e) {
    await conn.rollback();
    console.error("[admin] create:", e.message);
    res.status(500).json({ error: e.code === "ER_DUP_ENTRY" ? "SKU already exists." : "Create failed." });
  } finally { conn.release(); }
});

/* ---------- PUT /api/admin/products/:slug (update) ---------- */
router.put("/products/:slug", async (req, res) => {
  const b = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT id FROM products WHERE slug = ?", [req.params.slug]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: "Not found." }); }
    const id = rows[0].id;
    const c = cols(b, await catIdFromSlug(b.category));
    await conn.query(
      "UPDATE products SET category_id=?, sku=?, name=?, species=?, grade=?, type=?, short_desc=?, description=?, price=?, unit=?, stock=?, min_stock=?, length_mm=?, width_mm=?, thickness_mm=?, image=?, status=? WHERE id=?",
      [c.category_id, c.sku, c.name, c.species, c.grade, c.type, c.short_desc, c.description, c.price, c.unit, c.stock, c.min_stock, c.length_mm, c.width_mm, c.thickness_mm, c.image, c.status, id]
    );
    await syncChildren(conn, id, b);
    await conn.commit();
    res.json({ id: req.params.slug, slug: req.params.slug });
  } catch (e) {
    await conn.rollback();
    console.error("[admin] update:", e.message);
    res.status(500).json({ error: e.code === "ER_DUP_ENTRY" ? "SKU already exists." : "Update failed." });
  } finally { conn.release(); }
});

/* ---------- DELETE /api/admin/products/:slug ---------- */
router.delete("/products/:slug", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM products WHERE slug = ?", [req.params.slug]);
    if (!r.affectedRows) return res.status(404).json({ error: "Not found." });
    res.json({ ok: true });
  } catch (e) { console.error("[admin] delete:", e.message); res.status(500).json({ error: "Delete failed." }); }
});

/* ============================================================
   ORDERS
   ============================================================ */
const ORDER_STATUS = ["pending", "confirmed", "processing", "ready", "delivered", "completed", "cancelled"];
const DELIVERY_STATUS = ["pending", "preparing", "shipped", "delivered"];
// fold any legacy enum value into the canonical 7-state workflow
function mapOrderStatus(s) {
  if (s === "shipped") return "ready";
  if (s === "new") return "pending";
  return ORDER_STATUS.indexOf(s) > -1 ? s : "pending";
}

/* GET /api/admin/orders — full rows incl. items + latest payment */
router.get("/orders", async (req, res) => {
  try {
    const [orders] = await pool.query("SELECT * FROM orders ORDER BY created_at DESC, id DESC");
    const ids = orders.map((o) => o.id);
    const itemsBy = {}, payBy = {};
    if (ids.length) {
      const [items] = await pool.query("SELECT * FROM order_items WHERE order_id IN (?)", [ids]);
      const [pays] = await pool.query("SELECT * FROM payments WHERE order_id IN (?) ORDER BY id DESC", [ids]);
      const [pmap] = await pool.query("SELECT id, slug FROM products");
      const slugById = {}; pmap.forEach((p) => { slugById[p.id] = p.slug; });
      items.forEach((it) => { (itemsBy[it.order_id] = itemsBy[it.order_id] || []).push({ id: slugById[it.product_id] || null, name: it.product_name, qty: it.quantity, total: +it.subtotal, unit: +it.unit_price }); });
      pays.forEach((p) => { if (!payBy[p.order_id]) payBy[p.order_id] = p; });  // first = latest (sorted desc)
    }
    const mapped = orders.map((o) => {
      const pay = payBy[o.id];
      return {
        id: o.order_number, date: o.created_at, status: mapOrderStatus(o.status), deliveryStatus: o.delivery_status || "pending",
        estDelivery: o.est_delivery, total: +o.total, items: itemsBy[o.id] || [],
        customerName: o.ship_name || "Guest", customerEmail: o.ship_email || "", company: o.ship_company || "", phone: o.ship_phone || "",
        deliveryMethod: o.delivery_method, notes: o.notes || "",
        ship: { address: o.ship_address, city: o.ship_city, postcode: o.ship_postcode, state: o.ship_state, country: o.ship_country },
        paymentStatus: pay ? pay.status : "pending", paymentMethod: pay ? pay.method : null
      };
    });
    res.json({ orders: mapped });
  } catch (e) { console.error("[admin] orders:", e.message); res.status(500).json({ error: "Query failed." }); }
});

/* GET /api/admin/orders/:orderNumber — single order + full status timeline (for the detail page) */
router.get("/orders/:orderNumber", async (req, res) => {
  try {
    const [r] = await pool.query("SELECT * FROM orders WHERE order_number=?", [req.params.orderNumber]);
    if (!r.length) return res.status(404).json({ error: "Not found." });
    const o = r[0];
    const [items] = await pool.query("SELECT * FROM order_items WHERE order_id=?", [o.id]);
    const [pmap] = await pool.query("SELECT id, slug FROM products");
    const slugById = {}; pmap.forEach((p) => { slugById[p.id] = p.slug; });
    const [pays] = await pool.query("SELECT * FROM payments WHERE order_id=? ORDER BY id DESC", [o.id]);
    const [hist] = await pool.query("SELECT status, note, notified, created_at FROM order_status_history WHERE order_id=? ORDER BY id ASC, created_at ASC", [o.id]);
    const pay = pays[0];
    res.json({
      order: {
        id: o.order_number, date: o.created_at, status: mapOrderStatus(o.status),
        deliveryStatus: o.delivery_status || "pending", deliveryMethod: o.delivery_method,
        estDelivery: o.est_delivery, total: +o.total,
        items: items.map((it) => ({ id: slugById[it.product_id] || null, name: it.product_name, qty: it.quantity, unit: +it.unit_price, total: +it.subtotal })),
        customerName: o.ship_name || "Guest", customerEmail: o.ship_email || "", company: o.ship_company || "", phone: o.ship_phone || "",
        notes: o.notes || "",
        ship: { address: o.ship_address, city: o.ship_city, postcode: o.ship_postcode, state: o.ship_state, country: o.ship_country },
        payment: pay ? { method: pay.method, status: pay.status, amount: +pay.amount, transactionId: pay.transaction_id, paidAt: pay.paid_at } : null,
        paymentStatus: pay ? pay.status : "pending", paymentMethod: pay ? pay.method : null,
        history: hist.map((h) => ({ status: mapOrderStatus(h.status), note: h.note || "", notified: !!h.notified, at: h.created_at }))
      }
    });
  } catch (e) { console.error("[admin] order detail:", e.message); res.status(500).json({ error: "Query failed." }); }
});

/* PUT /api/admin/orders/:orderNumber — status / delivery / est-delivery / notes / payment.
   A status CHANGE automatically: stamps the time, appends to the timeline
   (order_status_history) and emails the customer (real or simulated). */
router.put("/orders/:orderNumber", async (req, res) => {
  const b = req.body || {};
  // validate up-front (before any write)
  if (b.status != null && ORDER_STATUS.indexOf(b.status) < 0) return res.status(400).json({ error: "Bad status." });
  if (b.deliveryStatus != null && DELIVERY_STATUS.indexOf(b.deliveryStatus) < 0) return res.status(400).json({ error: "Bad delivery status." });
  const wantsPayment = b.paymentStatus != null && ["pending", "success", "failed", "refunded"].indexOf(b.paymentStatus) > -1;
  if (b.status == null && b.deliveryStatus == null && b.estDelivery === undefined && b.notes == null && !wantsPayment) {
    return res.status(400).json({ error: "Nothing to update." });
  }
  try {
    const [r] = await pool.query("SELECT * FROM orders WHERE order_number=?", [req.params.orderNumber]);
    if (!r.length) return res.status(404).json({ error: "Not found." });
    const order = r[0];
    const statusChanged = b.status != null && mapOrderStatus(b.status) !== mapOrderStatus(order.status) ? b.status : null;

    const sets = [], vals = [];
    if (statusChanged) { sets.push("status=?"); vals.push(b.status); }
    if (b.deliveryStatus != null) { sets.push("delivery_status=?"); vals.push(b.deliveryStatus); }
    if (b.estDelivery !== undefined) { sets.push("est_delivery=?"); vals.push(b.estDelivery || null); }
    if (b.notes != null) { sets.push("notes=?"); vals.push(b.notes); }
    if (sets.length) { vals.push(req.params.orderNumber); await pool.query("UPDATE orders SET " + sets.join(", ") + " WHERE order_number=?", vals); }
    if (wantsPayment) {
      await pool.query("UPDATE payments SET status=? WHERE order_id=? ORDER BY id DESC LIMIT 1", [b.paymentStatus, order.id]);
    }

    let notified = false;
    if (statusChanged) {
      // email the customer — but only if the "notify on orders" setting is on
      const es = await mailer.emailSettings();
      if (es.notifyOrders !== false) {
        notified = await mailer.sendOrderStatusEmail({
          orderNumber: order.order_number, email: order.ship_email, name: order.ship_name,
          status: mapOrderStatus(statusChanged),
          estDelivery: b.estDelivery !== undefined ? (b.estDelivery || null) : order.est_delivery
        });
      }
      // append the timeline entry
      await pool.query(
        "INSERT INTO order_status_history (order_id, status, note, notified) VALUES (?,?,?,?)",
        [order.id, statusChanged, b.note || null, notified ? 1 : 0]
      );
    }

    res.json({ ok: true, statusChanged: !!statusChanged, notified: notified });
  } catch (e) { console.error("[admin] order update:", e.message); res.status(500).json({ error: "Update failed." }); }
});

/* ============================================================
   QUOTES / RFQ
   ============================================================ */
const QUOTE_STATUS = ["pending", "approved", "rejected", "expired"];
function mapQuoteStatus(s) {
  if (s === "new") return "pending"; if (s === "quoted") return "approved"; if (s === "closed") return "rejected";
  return QUOTE_STATUS.indexOf(s) > -1 ? s : "pending";
}

/* GET /api/admin/quotes — rows incl. line items */
router.get("/quotes", async (req, res) => {
  try {
    const [quotes] = await pool.query(
      "SELECT q.*, p.name AS single_product FROM quotes q LEFT JOIN products p ON q.product_id = p.id ORDER BY q.created_at DESC, q.id DESC"
    );
    const ids = quotes.map((q) => q.id);
    const itemsBy = {};
    if (ids.length) {
      const [items] = await pool.query("SELECT qi.*, pr.slug FROM quote_items qi LEFT JOIN products pr ON qi.product_id = pr.id WHERE quote_id IN (?)", [ids]);
      items.forEach((it) => { (itemsBy[it.quote_id] = itemsBy[it.quote_id] || []).push({ id: it.slug || null, name: it.product_name, qty: it.quantity, unit: +it.unit_price, total: +it.subtotal }); });
    }
    const mapped = quotes.map((q) => {
      const items = itemsBy[q.id] || [];
      let productName = q.single_product || "General enquiry";
      if (items.length) productName = items[0].name + (items.length > 1 ? " +" + (items.length - 1) + " more" : "");
      return {
        id: q.id, date: q.created_at, name: q.name, email: q.email, phone: q.phone || "", company: q.company || "",
        status: mapQuoteStatus(q.status), validUntil: q.valid_until, quotedTotal: q.quoted_total == null ? null : +q.quoted_total,
        productName: productName, qty: q.quantity, dimensions: q.dimensions || "", message: q.message || "", items: items
      };
    });
    res.json({ quotes: mapped });
  } catch (e) { console.error("[admin] quotes:", e.message); res.status(500).json({ error: "Query failed." }); }
});

async function productIdFromSlug(conn, slug) {
  if (!slug) return null;
  const [r] = await conn.query("SELECT id FROM products WHERE slug=?", [slug]);
  return r.length ? r[0].id : null;
}
async function writeQuoteItems(conn, quoteId, items) {
  await conn.query("DELETE FROM quote_items WHERE quote_id=?", [quoteId]);
  let total = 0;
  for (const it of (items || [])) {
    const qty = parseInt(it.qty, 10) || 1, unit = +it.unit || 0, sub = +(qty * unit).toFixed(2);
    total += sub;
    await conn.query(
      "INSERT INTO quote_items (quote_id, product_id, product_name, unit_price, quantity, subtotal) VALUES (?,?,?,?,?,?)",
      [quoteId, await productIdFromSlug(conn, it.id), it.name || "Item", unit, qty, sub]
    );
  }
  return +total.toFixed(2);
}

/* POST /api/admin/quotes — quotation builder */
router.post("/quotes", async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.email) return res.status(400).json({ error: "Customer name and email are required." });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const status = QUOTE_STATUS.indexOf(b.status) > -1 ? b.status : "pending";
    const [ins] = await conn.query(
      "INSERT INTO quotes (name, email, phone, company, message, status, valid_until, quoted_total) VALUES (?,?,?,?,?,?,?,?)",
      [b.name, b.email, b.phone || null, b.company || null, b.notes || b.message || null, status, b.validUntil || null, 0]
    );
    const total = await writeQuoteItems(conn, ins.insertId, b.items);
    await conn.query("UPDATE quotes SET quoted_total=? WHERE id=?", [total, ins.insertId]);
    await conn.commit();
    res.json({ id: ins.insertId, quoted_total: total });
  } catch (e) { await conn.rollback(); console.error("[admin] quote create:", e.message); res.status(500).json({ error: "Create failed." }); }
  finally { conn.release(); }
});

/* PUT /api/admin/quotes/:id — status and/or full quotation */
router.put("/quotes/:id", async (req, res) => {
  const b = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query("SELECT id FROM quotes WHERE id=?", [req.params.id]);
    if (!r.length) { await conn.rollback(); return res.status(404).json({ error: "Not found." }); }
    const sets = [], vals = [];
    if (b.status != null) { if (QUOTE_STATUS.indexOf(b.status) < 0) { await conn.rollback(); return res.status(400).json({ error: "Bad status." }); } sets.push("status=?"); vals.push(b.status); }
    if (b.name != null) { sets.push("name=?"); vals.push(b.name); }
    if (b.email != null) { sets.push("email=?"); vals.push(b.email); }
    if (b.phone != null) { sets.push("phone=?"); vals.push(b.phone); }
    if (b.company != null) { sets.push("company=?"); vals.push(b.company); }
    if (b.notes != null) { sets.push("message=?"); vals.push(b.notes); }
    if (b.validUntil !== undefined) { sets.push("valid_until=?"); vals.push(b.validUntil || null); }
    if (Array.isArray(b.items)) {
      const total = await writeQuoteItems(conn, req.params.id, b.items);
      sets.push("quoted_total=?"); vals.push(total);
    }
    if (sets.length) { vals.push(req.params.id); await conn.query("UPDATE quotes SET " + sets.join(", ") + " WHERE id=?", vals); }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error("[admin] quote update:", e.message); res.status(500).json({ error: "Update failed." }); }
  finally { conn.release(); }
});

/* DELETE /api/admin/quotes/:id */
router.delete("/quotes/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM quotes WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Not found." });
    res.json({ ok: true });
  } catch (e) { console.error("[admin] quote delete:", e.message); res.status(500).json({ error: "Delete failed." }); }
});

/* ============================================================
   INVENTORY — stock-movement ledger (inventory_logs).
   Order-driven stock-out is recorded at order PLACEMENT by
   api.js (reason='order'); this module adds the manual
   Stock In / Stock Out actions and reads the full history.
   ============================================================ */

/* Map an inventory_logs row (joined to product + order) to the UI shape. */
function mapMovement(r) {
  const inbound = r.qty_change >= 0;
  return {
    id: r.id,
    productId: r.slug || null,
    productName: r.product_name || "—",
    sku: r.sku || null,
    type: inbound ? "in" : "out",
    qty: Math.abs(r.qty_change),
    reason: r.reason || (inbound ? "restock" : "adjustment"),
    reference: r.reference || r.order_number || null,
    supplier: r.supplier || null,
    note: r.note || null,
    updatedBy: r.created_by || (r.reason === "order" ? "System" : "Admin"),
    date: r.created_at
  };
}
const MOVE_SELECT =
  "SELECT il.*, p.slug, p.name AS product_name, p.sku, o.order_number " +
  "FROM inventory_logs il " +
  "LEFT JOIN products p ON il.product_id = p.id " +
  "LEFT JOIN orders o ON il.ref_id = o.id ";

/* GET /api/admin/inventory/movements?productId=<slug>&limit=<n> */
router.get("/inventory/movements", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    let sql = MOVE_SELECT, params = [];
    if (req.query.productId) { sql += "WHERE p.slug = ? "; params.push(req.query.productId); }
    sql += "ORDER BY il.created_at DESC, il.id DESC LIMIT ?"; params.push(limit);
    const [rows] = await pool.query(sql, params);
    res.json({ movements: rows.map(mapMovement) });
  } catch (e) { console.error("[admin] movements:", e.message); res.status(500).json({ error: "Query failed." }); }
});

/* Shared write for a manual movement. signedQty: + for in, - for out. */
async function recordMovement(signedQty, fields, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query("SELECT id, stock FROM products WHERE slug = ?", [fields.productId]);
    if (!r.length) { await conn.rollback(); return res.status(404).json({ error: "Product not found." }); }
    const pid = r[0].id;
    await conn.query(
      "INSERT INTO inventory_logs (product_id, qty_change, reason, reference, supplier, note, created_by) VALUES (?,?,?,?,?,?,?)",
      [pid, signedQty, fields.reason, fields.reference || null, fields.supplier || null, fields.note || null, fields.createdBy || "Admin"]
    );
    // stock never goes negative; GREATEST guards stock-out underflow
    await conn.query("UPDATE products SET stock = GREATEST(0, stock + ?) WHERE id = ?", [signedQty, pid]);
    const [u] = await conn.query("SELECT stock FROM products WHERE id = ?", [pid]);
    await conn.commit();
    res.json({ ok: true, stock: u[0].stock });
  } catch (e) {
    await conn.rollback();
    console.error("[admin] movement:", e.message);
    res.status(500).json({ error: "Could not record the movement." });
  } finally { conn.release(); }
}

/* POST /api/admin/inventory/stock-in  { productId, qty, reference, supplier, remarks } */
router.post("/inventory/stock-in", async (req, res) => {
  const b = req.body || {};
  const qty = parseInt(b.qty, 10);
  if (!b.productId) return res.status(400).json({ error: "Product is required." });
  if (!(qty > 0)) return res.status(400).json({ error: "Quantity must be a positive number." });
  return recordMovement(qty, {
    productId: b.productId, reason: "restock", reference: b.reference,
    supplier: b.supplier, note: b.remarks, createdBy: b.createdBy
  }, res);
});

/* POST /api/admin/inventory/stock-out  { productId, qty, reference, reason, remarks } */
router.post("/inventory/stock-out", async (req, res) => {
  const b = req.body || {};
  const qty = parseInt(b.qty, 10);
  if (!b.productId) return res.status(400).json({ error: "Product is required." });
  if (!(qty > 0)) return res.status(400).json({ error: "Quantity must be a positive number." });
  return recordMovement(-qty, {
    productId: b.productId, reason: b.reason || "Stock Adjustment", reference: b.reference,
    note: b.remarks, createdBy: b.createdBy
  }, res);
});

/* ============================================================
   SETTINGS — company / email / system (one JSON row per section).
   ============================================================ */
const SETTINGS_SECTIONS = ["company", "email", "system"];

/* GET /api/admin/settings — all sections as { company:{}, email:{}, system:{} } */
router.get("/settings", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT section, data FROM settings");
    const out = {};
    rows.forEach((r) => { out[r.section] = typeof r.data === "string" ? JSON.parse(r.data) : r.data; });
    res.json({ settings: out });
  } catch (e) { console.error("[admin] settings get:", e.message); res.status(500).json({ error: "Query failed." }); }
});

/* PUT /api/admin/settings/:section — upsert one section's JSON document */
router.put("/settings/:section", async (req, res) => {
  const section = req.params.section;
  if (SETTINGS_SECTIONS.indexOf(section) < 0) return res.status(400).json({ error: "Unknown settings section." });
  const data = req.body && typeof req.body === "object" ? req.body : null;
  if (!data) return res.status(400).json({ error: "Invalid settings payload." });
  try {
    await pool.query(
      "INSERT INTO settings (section, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
      [section, JSON.stringify(data)]
    );
    res.json({ ok: true, section: section, data: data });
  } catch (e) { console.error("[admin] settings put:", e.message); res.status(500).json({ error: "Save failed." }); }
});

/* POST /api/admin/settings/email/test — send a test email using the saved Email settings.
   Returns { sent:true } for a real send, or { simulated:true } when no SMTP is configured. */
router.post("/settings/email/test", async (req, res) => {
  try {
    const es = await mailer.emailSettings();
    const to = (req.body && req.body.to) || es.fromEmail;
    if (!to) return res.status(400).json({ error: "No recipient — set a From email and Save first." });
    const r = await mailer.sendTest(to);
    res.json({ ok: true, sent: !!r.sent, simulated: !!r.simulated, to: to });
  } catch (e) { console.error("[admin] test email:", e.message); res.status(500).json({ error: "Send failed: " + e.message }); }
});

/* ============================================================
   STAFF USERS (users rows with a role_id) — passwords bcrypt-hashed
   ============================================================ */
function mapUser(u) {
  return { id: String(u.id), name: u.name, email: u.email,
    role: u.role_id || (u.role === "admin" ? "admin" : ""),
    status: u.status ? "active" : "inactive", created: u.created_at };
}
router.get("/users", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, email, role, role_id, status, created_at FROM users WHERE role_id IS NOT NULL ORDER BY created_at ASC, id ASC");
    res.json({ users: rows.map(mapUser) });
  } catch (e) { console.error("[admin] users:", e.message); res.status(500).json({ error: "Query failed." }); }
});
router.post("/users", async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.email) return res.status(400).json({ error: "Name and email are required." });
  if (!b.password) return res.status(400).json({ error: "A password is required for a new user." });
  try {
    const hash = await bcrypt.hash(String(b.password), 10);
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password, role, role_id, status) VALUES (?,?,?,?,?,?)",
      [b.name, b.email, hash, "admin", b.role || "staff", b.status === "inactive" ? 0 : 1]
    );
    res.json({ id: String(r.insertId) });
  } catch (e) { console.error("[admin] user create:", e.message); res.status(500).json({ error: e.code === "ER_DUP_ENTRY" ? "That email already exists." : "Create failed." }); }
});
router.put("/users/:id", async (req, res) => {
  const b = req.body || {};
  try {
    const sets = [], vals = [];
    if (b.name != null) { sets.push("name=?"); vals.push(b.name); }
    if (b.email != null) { sets.push("email=?"); vals.push(b.email); }
    if (b.role != null) { sets.push("role_id=?"); vals.push(b.role); }
    if (b.status != null) { sets.push("status=?"); vals.push(b.status === "inactive" ? 0 : 1); }
    if (b.password) { sets.push("password=?"); vals.push(await bcrypt.hash(String(b.password), 10)); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
    vals.push(req.params.id);
    const [r] = await pool.query("UPDATE users SET " + sets.join(", ") + " WHERE id=? AND role_id IS NOT NULL", vals);
    if (!r.affectedRows) return res.status(404).json({ error: "Not found." });
    res.json({ ok: true });
  } catch (e) { console.error("[admin] user update:", e.message); res.status(500).json({ error: e.code === "ER_DUP_ENTRY" ? "That email already exists." : "Update failed." }); }
});
router.delete("/users/:id", async (req, res) => {
  try {
    if (req.session && req.session.user && String(req.session.user.id) === String(req.params.id)) {
      return res.status(400).json({ error: "You can't delete your own account." });
    }
    const [r] = await pool.query("DELETE FROM users WHERE id=? AND role_id IS NOT NULL", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Not found." });
    res.json({ ok: true });
  } catch (e) { console.error("[admin] user delete:", e.message); res.status(500).json({ error: "Delete failed." }); }
});

/* ============================================================
   ROLES & PERMISSIONS
   ============================================================ */
function mapRole(r) {
  return { id: r.id, name: r.name, desc: r.description || "", system: !!r.is_system,
    perms: typeof r.permissions === "string" ? JSON.parse(r.permissions) : r.permissions };
}
router.get("/roles", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM roles ORDER BY is_system DESC, name ASC");
    res.json({ roles: rows.map(mapRole) });
  } catch (e) { console.error("[admin] roles:", e.message); res.status(500).json({ error: "Query failed." }); }
});
router.post("/roles", async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "Role name is required." });
  const id = slugify(b.name) || ("role-" + Date.now());
  try {
    await pool.query("INSERT INTO roles (id, name, description, permissions, is_system) VALUES (?,?,?,?,0)",
      [id, b.name, b.desc || null, JSON.stringify(b.perms || {})]);
    res.json({ id: id });
  } catch (e) { console.error("[admin] role create:", e.message); res.status(500).json({ error: e.code === "ER_DUP_ENTRY" ? "A role with that name already exists." : "Create failed." }); }
});
router.put("/roles/:id", async (req, res) => {
  const b = req.body || {};
  try {
    const [rows] = await pool.query("SELECT is_system FROM roles WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found." });
    const sets = [], vals = [];
    if (b.name != null) { sets.push("name=?"); vals.push(b.name); }
    if (b.desc != null) { sets.push("description=?"); vals.push(b.desc); }
    if (b.perms != null && !rows[0].is_system) { sets.push("permissions=?"); vals.push(JSON.stringify(b.perms)); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update." });
    vals.push(req.params.id);
    await pool.query("UPDATE roles SET " + sets.join(", ") + " WHERE id=?", vals);
    res.json({ ok: true });
  } catch (e) { console.error("[admin] role update:", e.message); res.status(500).json({ error: "Update failed." }); }
});
router.delete("/roles/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT is_system FROM roles WHERE id=?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found." });
    if (rows[0].is_system) return res.status(400).json({ error: "System roles can't be deleted." });
    await pool.query("DELETE FROM roles WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error("[admin] role delete:", e.message); res.status(500).json({ error: "Delete failed." }); }
});

module.exports = router;
