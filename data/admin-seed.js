/* ============================================================
   data/admin-seed.js — DEMO-ONLY data for the admin panel
   Gives the dashboard / analytics realistic orders, quotes and
   customers in Phase 1 so charts aren't empty. AdminStore merges
   this with any REAL storefront localStorage data.
   Does NOT write to localStorage — purely in-memory demo rows.
   Safe to delete once a real backend feeds the admin.
   ============================================================ */
(function (global) {
  "use strict";

  var DATA = global.__TIMBER_DATA__ || { products: [] };
  var buyable = DATA.products.filter(function (p) { return p.type === "buy-now" && typeof p.price === "number"; });
  if (!buyable.length) { global.__TIMBER_ADMIN_SEED__ = { orders: [], quotes: [], customers: [] }; return; }

  var customers = [
    { firstName: "Daniel", lastName: "Hartwell", email: "d.hartwell@oakframe.co",     company: "Oakframe Builders" },
    { firstName: "Mariah", lastName: "Lindqvist", email: "mariah@nordichomes.se",      company: "Nordic Homes" },
    { firstName: "Tomas",  lastName: "Becker",    email: "t.becker@beckerjoinery.de",  company: "Becker Joinery" },
    { firstName: "Aisha",  lastName: "Rahman",    email: "aisha.r@studioterra.com",    company: "Studio Terra" },
    { firstName: "Liam",   lastName: "O'Connor",  email: "liam@oconnordecks.ie",       company: "O'Connor Decking" },
    { firstName: "Sofia",  lastName: "Greco",     email: "sofia.greco@grecodesign.it", company: "Greco Design" },
    { firstName: "Henrik", lastName: "Nilsson",   email: "henrik@nilssontrade.no",     company: "Nilsson Trade" },
    { firstName: "Priya",  lastName: "Anand",     email: "priya.anand@anandbuild.in",  company: "Anand Build" }
  ];

  // Orders per month, oldest -> newest (6 months). Rising trend.
  var monthly = [6, 8, 7, 10, 9, 12];
  var orders = [];
  var now = new Date();
  var ref = 1042;

  function buildItems(seed) {
    var k = 1 + (seed % 3);                 // 1..3 distinct products
    var list = [];
    for (var t = 0; t < k; t++) {
      var p = buyable[(seed * 3 + t) % buyable.length];
      var qty = 1 + ((seed + t * 5) % 8);   // 1..8
      list.push({ id: p.id, name: p.name, qty: qty, total: +(p.price * qty).toFixed(2) });
    }
    return list;
  }
  function statusFor(monthsAgo, j) {
    if (monthsAgo >= 2) return (j % 9 === 0) ? "cancelled" : "completed";
    if (monthsAgo === 1) return (j % 4 === 0) ? "processing" : "completed";
    return (j % 3 === 0) ? "pending" : (j % 3 === 1) ? "processing" : "completed";
  }

  for (var m = 5; m >= 0; m--) {
    var cnt = monthly[5 - m], monthsAgo = m;
    for (var j = 0; j < cnt; j++) {
      var seed = ref;
      var d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 2 + (j * 2) % 25, 9 + (j % 8), (j * 7) % 60, 0);
      var items = buildItems(seed);
      var subtotal = +items.reduce(function (s, l) { return s + l.total; }, 0).toFixed(2);
      var c = customers[seed % customers.length];
      orders.push({
        id: "ORD" + (10000 + ref),
        createdAt: d.toISOString(),
        status: statusFor(monthsAgo, j),
        subtotal: subtotal,
        customer: { firstName: c.firstName, lastName: c.lastName, email: c.email, company: c.company },
        items: items,
        _demo: true
      });
      ref++;
    }
  }

  // RFQ / quotations across the four admin statuses
  function dAgo(days) { return new Date(now.getTime() - days * 86400000).toISOString(); }
  var quotes = [
    { id: "Q5001", name: "Daniel Hartwell", email: "d.hartwell@oakframe.co",     company: "Oakframe Builders", productName: "Glulam Structural Beam", qty: 12, status: "pending",  createdAt: dAgo(2) },
    { id: "Q5002", name: "Aisha Rahman",    email: "aisha.r@studioterra.com",    company: "Studio Terra",      productName: "Live-Edge Walnut Slab",  qty: 3,  status: "pending",  createdAt: dAgo(4) },
    { id: "Q5003", name: "Sofia Greco",     email: "sofia.greco@grecodesign.it", company: "Greco Design",      productName: "Green Oak Post",         qty: 40, status: "approved", createdAt: dAgo(11) },
    { id: "Q5004", name: "Henrik Nilsson",  email: "henrik@nilssontrade.no",     company: "Nilsson Trade",     productName: "Glulam Structural Beam", qty: 8,  status: "approved", createdAt: dAgo(15) },
    { id: "Q5005", name: "Liam O'Connor",   email: "liam@oconnordecks.ie",       company: "O'Connor Decking",  productName: "Composite Decking Board",qty: 120,status: "rejected", createdAt: dAgo(20) },
    { id: "Q5006", name: "Tomas Becker",    email: "t.becker@beckerjoinery.de",  company: "Becker Joinery",    productName: "Live-Edge Walnut Slab",  qty: 2,  status: "expired",  createdAt: dAgo(48) }
  ];

  global.__TIMBER_ADMIN_SEED__ = { orders: orders, quotes: quotes, customers: customers };
})(window);
