/* ============================================================
   assets/admin-store.js — Admin data layer
   PRODUCTS are now DB-backed when the node server is running:
     • init() loads products from /api/admin/products (cached)
     • saveProduct / deleteProduct / uploadImage hit the API
   When opened without the server (file:// or static host), it
   FALLS BACK to the embedded catalogue (data/products.js) +
   localStorage overlay so the admin still works offline.
   Orders / quotes / customers still use storefront localStorage
   (+ opt-in sample) until Stage 3 wires them to the DB.
   Public: window.AdminStore  — call AdminStore.init() first.
   ============================================================ */
(function (global) {
  "use strict";

  var DATA = global.__TIMBER_DATA__ || { currency: "USD", categories: [], products: [] };
  var SEED = global.__TIMBER_ADMIN_SEED__ || { orders: [], quotes: [], customers: [] };
  var KEYS = { orders: "timber_orders", quotes: "timber_quotes", overlay: "timber_admin_products", sample: "timber_admin_sample", invlog: "timber_inventory_logs", settings: "timber_admin_settings", users: "timber_admin_users", roles: "timber_admin_roles" };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var API = !!(global.location && (global.location.protocol === "http:" || global.location.protocol === "https:"));

  var _products = null;      // product cache (set by init)
  var _orders = null;        // order cache (DB-backed); null => use localStorage
  var _quotes = null;        // quote cache (DB-backed); null => use localStorage
  var _settings = null;      // settings cache { company, email, system } (set by init)
  var _users = null;         // staff users cache (set by init)
  var _roles = null;         // roles cache (set by init)
  var _dbBacked = false;     // true once products come from the API
  var _initPromise = null;

  function read(key, fb) { try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch (e) { return fb; } }
  function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  function slugify(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  function apiGet(p) { return fetch(p).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function apiSend(method, p, body) {
    return fetch(p, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || r.status); return d; }); });
  }

  /* ---------- formatting ---------- */
  function money(v) { return "RM" + Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
  function money2(v) { return "RM" + Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatPrice(v) { return v == null ? "Request a quote" : money2(v); }

  /* Format a date per the System preference (dateFormat + timezone). */
  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    var sys = getSettings().system || {};
    var tz = sys.timezone || undefined, fmt = sys.dateFormat || "DD MMM YYYY";
    function parts(opts) {
      var o = {};
      try { opts.timeZone = tz; new Intl.DateTimeFormat("en-US", opts).formatToParts(d).forEach(function (x) { o[x.type] = x.value; }); }
      catch (e) { delete opts.timeZone; new Intl.DateTimeFormat("en-US", opts).formatToParts(d).forEach(function (x) { o[x.type] = x.value; }); }
      return o;
    }
    var n = parts({ year: "numeric", month: "2-digit", day: "2-digit" });
    var mon = parts({ month: "short" }).month;
    switch (fmt) {
      case "MM/DD/YYYY": return n.month + "/" + n.day + "/" + n.year;
      case "DD/MM/YYYY": return n.day + "/" + n.month + "/" + n.year;
      case "YYYY-MM-DD": return n.year + "-" + n.month + "-" + n.day;
      default: return n.day + " " + mon + " " + n.year;   // DD MMM YYYY
    }
  }

  /* ---------- sample toggle (orders/quotes only) ---------- */
  function sampleOn() { return read(KEYS.sample, false) === true; }
  function setSample(on) { write(KEYS.sample, !!on); }

  /* ---------- categories ---------- */
  function getCategories() { return DATA.categories.slice(); }
  function catName(slug) { var c = DATA.categories.filter(function (x) { return x.id === slug; })[0]; return c ? c.name : (slug || "—"); }

  /* ---------- product cache load (DB or fallback) ---------- */
  function overlay() { return read(KEYS.overlay, {}); }
  function fixImagePaths(products) {
    /* Admin pages are in admin/ subfolder, so relative paths need ../ prefix */
    return (products || []).map(function (p) {
      if (p.image && p.image.indexOf("assets/") === 0 && p.image.indexOf("../") !== 0) {
        return merge(p, { image: "../" + p.image });
      }
      return p;
    });
  }
  function embeddedProducts() {
    var ov = overlay(), baseIds = {};
    var list = DATA.products.map(function (p) { baseIds[p.id] = 1; return ov[p.id] ? merge(p, ov[p.id]) : p; })
      .filter(function (p) { return !(ov[p.id] && ov[p.id].__deleted); });
    Object.keys(ov).forEach(function (id) { if (!baseIds[id] && !ov[id].__deleted) list.push(ov[id]); });
    return list;
  }
  function loadOrders() { return apiGet("/api/admin/orders").then(function (d) { _orders = d.orders || []; }).catch(function () { _orders = []; }); }
  function loadQuotes() { return apiGet("/api/admin/quotes").then(function (d) { _quotes = d.quotes || []; }).catch(function () { _quotes = []; }); }
  function loadAll() {
    if (API) {
      return apiGet("/api/admin/products").then(function (d) {
        if (!(d && d.products)) throw new Error("bad payload");
        _products = d.products; _dbBacked = true;
        return Promise.all([loadOrders(), loadQuotes(), loadSettings(), loadStaff()]);   // DB-backed orders/quotes/settings/staff
      }).catch(function () { _products = embeddedProducts(); _dbBacked = false; _orders = null; _quotes = null; _settings = settingsFromLocal(); _users = usersFromLocal(); _roles = rolesFromLocal(); });
    }
    _products = embeddedProducts(); _dbBacked = false; _orders = null; _quotes = null; _settings = settingsFromLocal(); _users = usersFromLocal(); _roles = rolesFromLocal(); return Promise.resolve();
  }
  function init() { if (!_initPromise) _initPromise = loadAll(); return _initPromise; }
  function refresh() { _initPromise = loadAll(); return _initPromise; }
  function isDbBacked() { return _dbBacked; }

  function getProducts() { return fixImagePaths((_products || (_products = embeddedProducts())).slice()); }
  function getProduct(id) { return getProducts().filter(function (p) { return p.id === id; })[0] || null; }

  /* ---------- product writes (Promise-based) ---------- */
  function saveProduct(p) {
    if (_dbBacked) {
      var req = p.id ? apiSend("PUT", "/api/admin/products/" + encodeURIComponent(p.id), p) : apiSend("POST", "/api/admin/products", p);
      return req.then(function (d) { return refresh().then(function () { return (d && (d.id || d.slug)) || p.id; }); });
    }
    // offline fallback: localStorage overlay
    var ov = overlay();
    if (!p.id) p.id = (slugify(p.name) || "product") + "-" + Date.now();
    var prev = (ov[p.id] && !ov[p.id].__deleted) ? ov[p.id] : {};
    ov[p.id] = merge(prev, p); delete ov[p.id].__deleted;
    write(KEYS.overlay, ov); _products = embeddedProducts();
    return Promise.resolve(p.id);
  }
  function deleteProduct(id) {
    if (_dbBacked) return apiSend("DELETE", "/api/admin/products/" + encodeURIComponent(id)).then(refresh);
    var ov = overlay(); ov[id] = { __deleted: true }; write(KEYS.overlay, ov); _products = embeddedProducts();
    return Promise.resolve();
  }
  function resetProducts() { write(KEYS.overlay, {}); _products = embeddedProducts(); }

  /* ---------- image upload (file from the user's computer) ---------- */
  function downscale(file, max) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var r = Math.min(1, (max || 900) / Math.max(img.width, img.height));
        var w = Math.round(img.width * r), h = Math.round(img.height * r);
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }
  function uploadImage(file) {
    if (_dbBacked) {
      var fd = new FormData(); fd.append("image", file);
      return fetch("/api/admin/upload", { method: "POST", body: fd })
        .then(function (r) { if (!r.ok) throw new Error("upload"); return r.json(); })
        .then(function (d) { return d.url; })
        .catch(function () { return downscale(file); });   // fall back to inline data URL
    }
    return downscale(file);
  }

  /* ---------- orders / quotes / customers (localStorage + opt-in sample) ---------- */
  function mapStatus(s) {
    s = (s || "").toLowerCase();
    if (s === "new") return "pending";
    if (s === "shipped") return "ready";   // legacy fold
    if (["pending", "confirmed", "processing", "ready", "delivered", "completed", "cancelled"].indexOf(s) > -1) return s;
    return "pending";
  }
  function normOrder(o) {
    var items = (o.items || []).map(function (it) {
      var qty = parseInt(it.qty != null ? it.qty : it.quantity, 10) || 1;
      var total = it.total != null ? +it.total : (+(it.unit || it.unit_price || 0) * qty);
      return { id: it.id || it.productId || null, name: it.name || it.product_name || "Item", qty: qty, unit: +(it.unit || it.unit_price || (total / qty) || 0), total: +total };
    });
    var total = o.subtotal != null ? +o.subtotal : (o.total != null ? +o.total : items.reduce(function (s, l) { return s + (l.total || 0); }, 0));
    var cust = o.customer || {};
    var name = ((cust.firstName || "") + " " + (cust.lastName || "")).trim() || cust.name || o.ship_name || "Guest";
    return { id: o.id || o.order_number || "ORD", date: o.createdAt || o.created_at || o.date || null, status: mapStatus(o.status),
      total: +(+total).toFixed(2), items: items, customerName: name, customerEmail: cust.email || o.ship_email || "", company: cust.company || "",
      phone: cust.phone || o.ship_phone || "", deliveryMethod: cust.deliveryMethod || o.delivery_method || "delivery",
      deliveryStatus: o.deliveryStatus || "pending", estDelivery: o.estDelivery || o.est_delivery || null,
      paymentMethod: cust.payment || null, paymentStatus: o.paymentStatus || null, notes: cust.notes || o.notes || "",
      ship: { address: cust.address || o.ship_address || "", city: cust.city || o.ship_city || "", postcode: cust.postcode || o.ship_postcode || "", state: cust.state || o.ship_state || "", country: cust.country || o.ship_country || "" } };
  }
  function normQuote(q) {
    var s = (q.status || "new").toLowerCase();
    if (s === "new") s = "pending"; if (s === "quoted") s = "approved"; if (s === "closed") s = "rejected";
    return { id: q.id || "Q", date: q.createdAt || q.created_at || null, name: q.name || "—", email: q.email || "",
      phone: q.phone || "", message: q.message || "",
      company: q.company || "", productName: q.productName || q.product || "General enquiry", qty: q.qty || q.quantity || null,
      status: ["pending", "approved", "rejected", "expired"].indexOf(s) > -1 ? s : "pending" };
  }
  function getOrders() {
    if (_orders != null) return _orders.slice();               // DB-backed cache
    var real = read(KEYS.orders, []).map(normOrder);
    var demo = sampleOn() ? (SEED.orders || []).map(normOrder) : [];
    return real.concat(demo).sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
  }
  function getQuotes() {
    if (_quotes != null) return _quotes.slice();               // DB-backed cache
    var real = read(KEYS.quotes, []).map(normQuote);
    var demo = sampleOn() ? (SEED.quotes || []).map(normQuote) : [];
    return real.concat(demo).sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
  }
  function getOrder(id) { return getOrders().filter(function (o) { return o.id === id; })[0] || null; }
  function getQuote(id) { return getQuotes().filter(function (q) { return String(q.id) === String(id); })[0] || null; }

  /* Full order + status timeline for the detail page.
     DB-backed: GET /api/admin/orders/:n (includes history).
     Offline: the cached order with a one-entry synthetic timeline. */
  function getOrderDetail(orderNumber) {
    if (_dbBacked) {
      return apiGet("/api/admin/orders/" + encodeURIComponent(orderNumber))
        .then(function (d) { return (d && d.order) || null; })
        .catch(function () { return null; });
    }
    var o = getOrder(orderNumber);
    if (!o) return Promise.resolve(null);
    if (!o.history) o.history = [{ status: o.status, note: "", notified: false, at: o.date }];
    return Promise.resolve(o);
  }

  /* ---------- order / quote writes (DB only; offline rejects) ---------- */
  function updateOrder(orderNumber, patch) {
    if (!_dbBacked) return Promise.reject(new Error("Offline — connect to the database to update orders."));
    return apiSend("PUT", "/api/admin/orders/" + encodeURIComponent(orderNumber), patch).then(loadOrders);
  }
  function saveQuote(q) {
    if (!_dbBacked) return Promise.reject(new Error("Offline — connect to the database to save quotations."));
    var req = q.id ? apiSend("PUT", "/api/admin/quotes/" + encodeURIComponent(q.id), q) : apiSend("POST", "/api/admin/quotes", q);
    return req.then(function (d) { return loadQuotes().then(function () { return (d && d.id) || q.id; }); });
  }
  function deleteQuote(id) {
    if (!_dbBacked) return Promise.reject(new Error("Offline — connect to the database to delete quotations."));
    return apiSend("DELETE", "/api/admin/quotes/" + encodeURIComponent(id)).then(loadQuotes);
  }
  function customerMap() {
    var map = {};
    getOrders().forEach(function (o) {
      var key = (o.customerEmail || o.customerName || "guest").toLowerCase(); if (!key) return;
      var sh = o.ship || {};
      var addr = [sh.address, sh.city, sh.postcode, sh.state, sh.country].filter(Boolean).join(", ");
      if (!map[key]) map[key] = { key: key, name: o.customerName, email: o.customerEmail, company: o.company, phone: o.phone || "", address: addr, orders: 0, spent: 0, last: null, first: null, orderList: [] };
      var c = map[key];
      if (o.status !== "cancelled") c.spent += o.total;
      c.orders++; c.orderList.push(o);
      if (!c.last || (o.date || "") > c.last) { c.last = o.date; c.name = o.customerName || c.name; if (o.company) c.company = o.company; if (o.phone) c.phone = o.phone; if (addr) c.address = addr; }
      if (!c.first || (o.date || "") < c.first) c.first = o.date;
    });
    if (sampleOn()) (SEED.customers || []).forEach(function (s) {
      var k = (s.email || "").toLowerCase();
      if (k && !map[k]) map[k] = { key: k, name: (s.firstName + " " + s.lastName).trim(), email: s.email, company: s.company, phone: "", address: "", orders: 0, spent: 0, last: null, first: null, orderList: [] };
    });
    return map;
  }
  function getCustomers() {
    var map = customerMap();
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.spent - a.spent; });
  }
  function getCustomer(email) {
    var c = customerMap()[(email || "").toLowerCase()];
    if (!c) return null;
    c.orderList.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    c.avg = c.orders ? +(c.spent / c.orders).toFixed(2) : 0;
    return c;
  }

  /* ---------- KPIs / trends / inventory (read the product cache) ---------- */
  function kpis() {
    var orders = getOrders();
    return { revenue: orders.reduce(function (s, o) { return s + (o.status === "cancelled" ? 0 : o.total); }, 0),
      orders: orders.length, products: getProducts().length, customers: getCustomers().length,
      pendingQuotes: getQuotes().filter(function (q) { return q.status === "pending"; }).length };
  }
  function lastMonths(n) { var arr = [], d = new Date(); for (var i = n - 1; i >= 0; i--) { var dt = new Date(d.getFullYear(), d.getMonth() - i, 1); arr.push({ y: dt.getFullYear(), m: dt.getMonth(), label: MON[dt.getMonth()], value: 0 }); } return arr; }
  function bucket(n, fn) { var months = lastMonths(n), idx = {}; months.forEach(function (b, i) { idx[b.y + "-" + b.m] = i; }); getOrders().forEach(function (o) { if (!o.date) return; var dt = new Date(o.date); var k = dt.getFullYear() + "-" + dt.getMonth(); if (k in idx) fn(months[idx[k]], o); }); return months; }
  function revenueByMonth(n) { return bucket(n || 6, function (b, o) { if (o.status !== "cancelled") b.value += o.total; }).map(function (b) { return { label: b.label, value: +b.value.toFixed(2) }; }); }
  function ordersByMonth(n) { return bucket(n || 6, function (b) { b.value += 1; }).map(function (b) { return { label: b.label, value: b.value }; }); }
  function salesByProduct() {
    var agg = {};
    getOrders().forEach(function (o) { if (o.status === "cancelled") return; o.items.forEach(function (it) { if (!it.id) return; if (!agg[it.id]) agg[it.id] = { qty: 0, revenue: 0 }; agg[it.id].qty += it.qty; agg[it.id].revenue += it.total || 0; }); });
    return agg;
  }
  function topProducts(n) {
    var byId = {}; getProducts().forEach(function (p) { byId[p.id] = p; });
    var agg = salesByProduct();
    return Object.keys(agg).map(function (id) { var p = byId[id] || {}; return { id: id, name: p.name || id, sku: p.sku, image: p.image, qty: agg[id].qty, revenue: +agg[id].revenue.toFixed(2) }; })
      .sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, n || 5);
  }
  function recentOrders(n) { return getOrders().slice(0, n || 6); }
  function getInventory() {
    var resv = {};
    getOrders().forEach(function (o) { if (o.status === "pending" || o.status === "processing") o.items.forEach(function (it) { if (it.id) resv[it.id] = (resv[it.id] || 0) + it.qty; }); });
    var fallbackLow = +((getSettings().system || {}).lowStockThreshold);   // System preference (default 50)
    if (!(fallbackLow > 0)) fallbackLow = 50;
    return getProducts().map(function (p) {
      var stock = +p.stock || 0, reserved = resv[p.id] || 0, incoming = +(p.incoming || 0);
      var available = Math.max(0, stock - reserved), low = +(p.minStock || p.min_stock || fallbackLow);
      var status = stock <= 0 ? "out" : (available <= low ? "low" : "in");
      var price = typeof p.price === "number" ? p.price : 0;
      return { id: p.id, sku: p.sku, name: p.name, category: p.category, type: p.type, unit: p.unit || "units",
        image: p.image || "", price: price, value: +(price * stock).toFixed(2),
        stock: stock, reserved: reserved, incoming: incoming, available: available,
        minStock: low, low: low, status: status };
    });
  }
  function lowStock() { return getInventory().filter(function (i) { return i.status !== "in"; }); }
  function getInventoryItem(id) { return getInventory().filter(function (i) { return i.id === id; })[0] || null; }

  /* ---------- inventory summary (cards + analytics) ---------- */
  function inventorySummary() {
    var inv = getInventory();
    var byCat = {};
    inv.forEach(function (i) { byCat[i.category] = (byCat[i.category] || 0) + i.stock; });
    return {
      productCount: inv.length,
      stockValue: +inv.reduce(function (s, i) { return s + i.value; }, 0).toFixed(2),
      lowCount: inv.filter(function (i) { return i.status === "low"; }).length,
      outCount: inv.filter(function (i) { return i.status === "out"; }).length,
      totalUnits: inv.reduce(function (s, i) { return s + i.stock; }, 0),
      stockByCategory: Object.keys(byCat).map(function (c) { return { id: c, label: catName(c), value: byCat[c] }; })
                              .sort(function (a, b) { return b.value - a.value; })
    };
  }

  /* Bucket a movements array into n months for the "Monthly Stock Movement" chart.
     value = total units moved (in + out); also exposes inQty / outQty. */
  function movementByMonth(movements, n) {
    var months = lastMonths(n || 6), idx = {};
    months.forEach(function (b, i) { b.inQty = 0; b.outQty = 0; idx[b.y + "-" + b.m] = i; });
    (movements || []).forEach(function (mv) {
      if (!mv.date) return;
      var dt = new Date(mv.date), k = dt.getFullYear() + "-" + dt.getMonth();
      if (!(k in idx)) return;
      var b = months[idx[k]];
      if (mv.type === "in") b.inQty += mv.qty; else b.outQty += mv.qty;
    });
    return months.map(function (b) { return { label: b.label, inQty: b.inQty, outQty: b.outQty, value: b.inQty + b.outQty }; });
  }

  /* ---------- stock movements (DB-backed, else localStorage + derived order rows) ---------- */
  function readManualMoves() { return read(KEYS.invlog, []); }
  function offlineMovements(productId) {
    var byId = {}; getProducts().forEach(function (p) { byId[p.id] = p; });
    var manual = readManualMoves().map(function (m) {
      var p = byId[m.productId] || {};
      return { id: m.id, productId: m.productId, productName: m.productName || p.name || "—", sku: p.sku || null,
        type: m.type, qty: m.qty, reason: m.reason, reference: m.reference || null, supplier: m.supplier || null,
        note: m.note || null, updatedBy: m.updatedBy || "Admin", date: m.date };
    });
    var orderRows = [];
    getOrders().forEach(function (o) {
      if (o.status === "cancelled") return;
      o.items.forEach(function (it) {
        if (!it.id) return;
        var p = byId[it.id] || {};
        orderRows.push({ id: "o" + o.id + "-" + it.id, productId: it.id, productName: it.name || p.name || "—",
          sku: p.sku || null, type: "out", qty: it.qty, reason: "order", reference: o.id, supplier: null,
          note: null, updatedBy: "System", date: o.date });
      });
    });
    var all = manual.concat(orderRows);
    if (productId) all = all.filter(function (m) { return m.productId === productId; });
    return all.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
  }
  function getMovements(productId) {
    if (_dbBacked) {
      return apiGet("/api/admin/inventory/movements" + (productId ? "?productId=" + encodeURIComponent(productId) : ""))
        .then(function (d) { return d.movements || []; }).catch(function () { return []; });
    }
    return Promise.resolve(offlineMovements(productId));
  }

  /* Offline: adjust a product's stock via the overlay (clamped at 0). */
  function bumpStock(id, delta) {
    var ov = overlay(), base = getProduct(id) || {};
    var newStock = Math.max(0, (+base.stock || 0) + delta);
    var prev = (ov[id] && !ov[id].__deleted) ? ov[id] : {};
    ov[id] = merge(prev, { stock: newStock }); delete ov[id].__deleted;
    write(KEYS.overlay, ov); _products = embeddedProducts();
    return newStock;
  }
  function pushManualMove(m) { var list = readManualMoves(); list.push(m); write(KEYS.invlog, list); }

  function recordMovement(type, data) {
    var qty = parseInt(data.qty, 10);
    if (!data.id) return Promise.reject(new Error("Please choose a product."));
    if (!(qty > 0)) return Promise.reject(new Error("Quantity must be a positive number."));
    if (_dbBacked) {
      var path = type === "in" ? "/api/admin/inventory/stock-in" : "/api/admin/inventory/stock-out";
      var body = { productId: data.id, qty: qty, reference: data.reference || null, remarks: data.remarks || null };
      if (type === "in") body.supplier = data.supplier || null; else body.reason = data.reason || "Stock Adjustment";
      return apiSend("POST", path, body).then(function (d) { return refresh().then(function () { return d; }); });
    }
    var signed = type === "in" ? qty : -qty;
    var stock = bumpStock(data.id, signed);
    var now = new Date();
    pushManualMove({ id: "m" + now.getTime(), productId: data.id, type: type, qty: qty,
      reason: type === "in" ? "restock" : (data.reason || "Stock Adjustment"),
      reference: data.reference || null, supplier: type === "in" ? (data.supplier || null) : null,
      note: data.remarks || null, updatedBy: "Admin", date: now.toISOString() });
    return Promise.resolve({ ok: true, stock: stock });
  }
  function stockIn(data) { return recordMovement("in", data); }
  function stockOut(data) { return recordMovement("out", data); }

  /* ---------- settings / users / roles (Phase-1 localStorage; wire to DB in Phase 2) ---------- */
  var MODULES = [
    { id: "dashboard", name: "Dashboard" }, { id: "products", name: "Products" },
    { id: "inventory", name: "Inventory" }, { id: "orders", name: "Orders" },
    { id: "quotes", name: "RFQ & Quotes" }, { id: "customers", name: "Customers" },
    { id: "analytics", name: "Analytics" }, { id: "settings", name: "Settings" }
  ];
  function allPerms(v) { var o = {}; MODULES.forEach(function (m) { o[m.id] = v; }); return o; }
  var DEFAULT_SETTINGS = {
    company: { name: "TimberPro", legalName: "TimberPro Sawmill Co.", email: "hello@timberpro.example", phone: "1-800-458-5697", hours: "Mon–Fri, 8am–6pm", address: "120 Mill Road", city: "Portland", postcode: "97201", country: "United States", currency: "USD", taxId: "", taxRate: 0 },
    email: { fromName: "TimberPro", fromEmail: "orders@timberpro.test", smtpHost: "", smtpPort: 587, smtpUser: "", smtpSecure: true, notifyOrders: true, notifyQuotes: true },
    system: { dateFormat: "DD MMM YYYY", timezone: "America/Los_Angeles", currency: "USD", lowStockThreshold: 50, itemsPerPage: 20, theme: "light", maintenanceMode: false }
  };
  var DEFAULT_ROLES = [
    { id: "admin", name: "Administrator", desc: "Full access to every module.", perms: allPerms(true), system: true },
    { id: "manager", name: "Manager", desc: "Operations, but no settings or user control.", perms: merge(allPerms(true), { settings: false }) },
    { id: "staff", name: "Staff", desc: "Day-to-day orders, products and inventory.", perms: { dashboard: true, products: true, inventory: true, orders: true, quotes: true, customers: false, analytics: false, settings: false } }
  ];
  var DEFAULT_USERS = [
    { id: "u-admin", name: "Sawmill Admin", email: "admin@timberpro.test", role: "admin", status: "active", created: "2026-01-05" },
    { id: "u-mgr", name: "Jordan Pine", email: "jordan@timberpro.test", role: "manager", status: "active", created: "2026-02-12" },
    { id: "u-staff", name: "Casey Oak", email: "casey@timberpro.test", role: "staff", status: "active", created: "2026-03-20" }
  ];

  function getModules() { return MODULES.slice(); }

  // send a test email via the server (DB-backed only); offline reports "simulated"
  function sendTestEmail(to) {
    if (_dbBacked) return apiSend("POST", "/api/admin/settings/email/test", { to: to });
    return Promise.resolve({ ok: true, sent: false, simulated: true, to: to });
  }

  // merge stored sections over the defaults so missing keys always resolve
  function mergeAllSettings(s) {
    s = s || {};
    return {
      company: merge(DEFAULT_SETTINGS.company, s.company || {}),
      email: merge(DEFAULT_SETTINGS.email, s.email || {}),
      system: merge(DEFAULT_SETTINGS.system, s.system || {})
    };
  }
  function settingsFromLocal() { return mergeAllSettings(read(KEYS.settings, {})); }
  // DB-backed load (called by loadAll when _dbBacked); falls back to localStorage on error
  function loadSettings() {
    if (_dbBacked) {
      return apiGet("/api/admin/settings").then(function (d) { _settings = mergeAllSettings(d && d.settings); })
        .catch(function () { _settings = settingsFromLocal(); });
    }
    _settings = settingsFromLocal();
    return Promise.resolve();
  }

  // synchronous read of the cache (seeded from defaults before init resolves)
  function getSettings() { return _settings || (_settings = settingsFromLocal()); }

  // upsert one section. DB-backed: PUT the API; offline: localStorage. Returns a Promise.
  function updateSettings(section, patch) {
    var cur = getSettings();
    cur[section] = merge(cur[section] || DEFAULT_SETTINGS[section] || {}, patch || {});
    if (_dbBacked) {
      return apiSend("PUT", "/api/admin/settings/" + encodeURIComponent(section), cur[section])
        .then(function () { return getSettings(); });
    }
    var all = read(KEYS.settings, {});
    all[section] = cur[section];
    write(KEYS.settings, all);
    return Promise.resolve(getSettings());
  }

  /* ---- staff users + roles: DB-backed (API) with localStorage fallback ---- */
  function usersFromLocal() { return read(KEYS.users, null) || DEFAULT_USERS.slice(); }
  function rolesFromLocal() { return read(KEYS.roles, null) || DEFAULT_ROLES.slice(); }
  function loadUsers() { return apiGet("/api/admin/users").then(function (d) { _users = d.users || []; }).catch(function () { _users = usersFromLocal(); }); }
  function loadRoles() { return apiGet("/api/admin/roles").then(function (d) { _roles = d.roles || []; }).catch(function () { _roles = rolesFromLocal(); }); }
  function loadStaff() {
    if (_dbBacked) return Promise.all([loadUsers(), loadRoles()]);
    _users = usersFromLocal(); _roles = rolesFromLocal();
    return Promise.resolve();
  }

  function getUsers() { return (_users || (_users = usersFromLocal())).slice(); }
  function getUser(id) { return getUsers().filter(function (u) { return String(u.id) === String(id); })[0] || null; }
  function saveUser(u) {
    if (_dbBacked) {
      var req = u.id ? apiSend("PUT", "/api/admin/users/" + encodeURIComponent(u.id), u) : apiSend("POST", "/api/admin/users", u);
      return req.then(function (d) { return loadUsers().then(function () { return (d && d.id) || u.id; }); });
    }
    var list = getUsers(), found = false;
    if (u.id) list = list.map(function (x) { if (String(x.id) === String(u.id)) { found = true; return merge(x, u); } return x; });
    if (!found) { if (!u.id) u.id = "u-" + Date.now(); if (!u.created) u.created = new Date().toISOString().slice(0, 10); list.push(u); }
    write(KEYS.users, list); _users = list;
    return Promise.resolve(u.id);
  }
  function deleteUser(id) {
    if (_dbBacked) return apiSend("DELETE", "/api/admin/users/" + encodeURIComponent(id)).then(loadUsers);
    var list = getUsers().filter(function (u) { return String(u.id) !== String(id); });
    write(KEYS.users, list); _users = list;
    return Promise.resolve();
  }

  function getRoles() { return (_roles || (_roles = rolesFromLocal())).slice(); }
  function getRole(id) { return getRoles().filter(function (r) { return r.id === id; })[0] || null; }
  function saveRole(r) {
    if (_dbBacked) {
      var req = r.id ? apiSend("PUT", "/api/admin/roles/" + encodeURIComponent(r.id), r) : apiSend("POST", "/api/admin/roles", r);
      return req.then(function (d) { return loadRoles().then(function () { return (d && d.id) || r.id; }); });
    }
    if (!r.id) r.id = slugify(r.name) || ("role-" + Date.now());
    var list = getRoles(), found = false;
    list = list.map(function (x) { if (x.id === r.id) { found = true; return merge(x, r); } return x; });
    if (!found) list.push(r);
    write(KEYS.roles, list); _roles = list;
    return Promise.resolve(r.id);
  }
  function deleteRole(id) {
    if (_dbBacked) return apiSend("DELETE", "/api/admin/roles/" + encodeURIComponent(id)).then(loadRoles);
    var list = getRoles().filter(function (r) { return r.id !== id; });
    write(KEYS.roles, list); _roles = list;
    return Promise.resolve();
  }

  global.AdminStore = {
    init: init, refresh: refresh, isDbBacked: isDbBacked,
    currency: DATA.currency || "USD",
    money: money, money2: money2, formatPrice: formatPrice, formatDate: formatDate, catName: catName, slugify: slugify,
    sampleOn: sampleOn, setSample: setSample,
    getCategories: getCategories, getProducts: getProducts, getProduct: getProduct,
    saveProduct: saveProduct, deleteProduct: deleteProduct, resetProducts: resetProducts, uploadImage: uploadImage,
    getOrders: getOrders, getQuotes: getQuotes, getOrder: getOrder, getOrderDetail: getOrderDetail, getQuote: getQuote, getCustomers: getCustomers, getCustomer: getCustomer,
    updateOrder: updateOrder, saveQuote: saveQuote, deleteQuote: deleteQuote,
    kpis: kpis, revenueByMonth: revenueByMonth, ordersByMonth: ordersByMonth,
    salesByProduct: salesByProduct, topProducts: topProducts, recentOrders: recentOrders,
    getInventory: getInventory, getInventoryItem: getInventoryItem, lowStock: lowStock,
    inventorySummary: inventorySummary, movementByMonth: movementByMonth,
    getMovements: getMovements, stockIn: stockIn, stockOut: stockOut,
    getModules: getModules, getSettings: getSettings, updateSettings: updateSettings, sendTestEmail: sendTestEmail,
    getUsers: getUsers, getUser: getUser, saveUser: saveUser, deleteUser: deleteUser,
    getRoles: getRoles, getRole: getRole, saveRole: saveRole, deleteRole: deleteRole
  };
})(window);
