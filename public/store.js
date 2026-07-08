/* ============================================================
   store.js — TimberPro shared data + cart/quote/order helper
   Phase 1 fake backend: products from data/products.json,
   cart / quotes / orders persisted in localStorage.
   No framework. Loaded by every storefront page.
   ============================================================ */
(function (global) {
  "use strict";

  var KEYS = {
    cart: "timber_cart",
    quotes: "timber_quotes",
    orders: "timber_orders",
    wishlist: "timber_wishlist",
    reviews: "timber_reviews"
  };

  var _catalog = null;        // cached { currency, categories, products }

  /* ---------- API (Phase 2 backend) ---------- */
  // Only attempt the API over http(s); on file:// we stay fully client-side.
  var API = !!(global.location && (global.location.protocol === "http:" || global.location.protocol === "https:"));
  function apiGet(path) {
    return fetch(path).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }
  function apiPost(path, body) {
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }

  /* ---------- low-level storage ---------- */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage full / unavailable — ignore in demo */
    }
  }

  /* ---------- catalog loading ---------- */
  // Catalog comes from data/products.js (window.__TIMBER_DATA__), loaded via
  // <script> before this file so the site works from file:// and from a server.
  function loadCatalog() {
    if (_catalog) return Promise.resolve(_catalog);
    var embedded = global.__TIMBER_DATA__ || { currency: "USD", categories: [], products: [] };
    // Prefer the live DB catalog (/api/catalog); fall back to embedded products.js
    // so the site still runs from file:// or a plain static server.
    if (!API) { _catalog = embedded; return Promise.resolve(_catalog); }
    return apiGet("/api/catalog").then(function (d) {
      _catalog = (d && d.products && d.products.length) ? d : embedded;
      return _catalog;
    }).catch(function () { _catalog = embedded; return _catalog; });
  }

  function getProducts() {
    return loadCatalog().then(function (c) { return c.products; });
  }
  function getProduct(id) {
    return loadCatalog().then(function (c) {
      return c.products.filter(function (p) { return p.id === id; })[0] || null;
    });
  }
  function getCategories() {
    return loadCatalog().then(function (c) { return c.categories; });
  }
  function getCurrency() {
    return _catalog ? _catalog.currency : "USD";
  }

  /* ---------- pricing ---------- */
  // Returns the unit price for a product at a given quantity,
  // applying bulk tiers (highest qualifying tier wins).
  function unitPrice(product, qty) {
    if (!product || product.type === "quote-only" || product.price == null) return null;
    qty = qty || 1;
    var price = product.price;
    var tiers = product.bulkTiers || [];
    for (var i = 0; i < tiers.length; i++) {
      if (qty >= tiers[i].minQty) price = tiers[i].price;
    }
    return price;
  }
  function lineTotal(product, qty) {
    var u = unitPrice(product, qty);
    return u == null ? null : +(u * qty).toFixed(2);
  }
  function formatPrice(value) {
    if (value == null) return "Request a quote";
    return "RM" + Number(value).toFixed(2);
  }

  /* ---------- cart ---------- */
  // cart item shape: { id, qty }
  function getCart() { return read(KEYS.cart, []); }

  function addToCart(productId, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    var cart = getCart();
    var found = cart.filter(function (i) { return i.id === productId; })[0];
    if (found) found.qty += qty;
    else cart.push({ id: productId, qty: qty });
    write(KEYS.cart, cart);
    return cart;
  }
  function updateCartQty(productId, qty) {
    var cart = getCart();
    qty = parseInt(qty, 10) || 0;
    cart = cart.filter(function (i) {
      if (i.id === productId) { i.qty = qty; return qty > 0; }
      return true;
    });
    write(KEYS.cart, cart);
    return cart;
  }
  function removeFromCart(productId) {
    var cart = getCart().filter(function (i) { return i.id !== productId; });
    write(KEYS.cart, cart);
    return cart;
  }
  function clearCart() { write(KEYS.cart, []); }
  function cartCount() {
    return getCart().reduce(function (n, i) { return n + i.qty; }, 0);
  }
  // Resolves cart items against the catalog -> detailed lines + total.
  function getCartDetailed() {
    return loadCatalog().then(function (c) {
      var byId = {};
      c.products.forEach(function (p) { byId[p.id] = p; });
      var lines = getCart().map(function (i) {
        var p = byId[i.id];
        return {
          id: i.id,
          qty: i.qty,
          product: p || null,
          unit: p ? unitPrice(p, i.qty) : null,
          total: p ? lineTotal(p, i.qty) : null
        };
      });
      var subtotal = lines.reduce(function (s, l) {
        return s + (l.total || 0);
      }, 0);
      return { lines: lines, subtotal: +subtotal.toFixed(2), count: cartCount() };
    });
  }

  /* ---------- quotes (Request a Quote) ---------- */
  // quote shape: { id, productId, productName, qty, dimensions, name, email, phone, message, status, createdAt }
  function submitQuote(quote) {
    var quotes = read(KEYS.quotes, []);
    quote.id = "Q" + Date.now();
    quote.status = "new";
    quote.createdAt = new Date().toISOString();
    quotes.push(quote);
    write(KEYS.quotes, quotes);
    if (API) apiPost("/api/quotes", {
      productSlug: quote.productId, name: quote.name, email: quote.email, phone: quote.phone,
      company: quote.company, quantity: quote.qty, dimensions: quote.dimensions, message: quote.message
    }).catch(function () {});   // background sync; localStorage already holds it
    return quote;
  }
  function getQuotes() { return read(KEYS.quotes, []); }
  // Contact-form messages (no localStorage mirror needed). Returns Promise<bool persisted>.
  function submitContact(msg) {
    if (API) return apiPost("/api/contact", msg).then(function () { return true; }).catch(function () { return false; });
    return Promise.resolve(false);
  }

  /* ---------- orders (checkout) ---------- */
  // order shape: { id, items, subtotal, customer, status, createdAt }
  function placeOrder(order) {
    var orders = read(KEYS.orders, []);
    order.id = "ORD" + Date.now();
    order.status = "new";
    order.createdAt = new Date().toISOString();
    orders.push(order);
    write(KEYS.orders, orders);
    clearCart();
    if (API) {
      var cust = order.customer || {};
      apiPost("/api/orders", {
        total: order.subtotal, customer: cust, items: order.items,
        payment: { method: cust.payment || "cod", status: cust.payment === "card" ? "success" : "pending" }
      }).then(function (res) {
        if (res && res.order_number) {
          var list = read(KEYS.orders, []);
          var i = list.findIndex(function (o) { return o.id === order.id; });
          if (i !== -1) {
            var oldId = order.id;
            list[i].id = res.order_number; write(KEYS.orders, list); order.id = res.order_number;
            document.dispatchEvent(new CustomEvent("timber:order-number-updated", { detail: { oldId: oldId, newId: res.order_number } }));
          }
        }
      }).catch(function () {});   // background persist; localStorage already holds the timestamp fallback
    }
    return order;
  }
  function getOrders() { return read(KEYS.orders, []); }
  // Order history from the DB by email (no auth yet). Returns Promise<orders|null>.
  function fetchOrders(email) {
    if (!API || !email) return Promise.resolve(null);
    return apiGet("/api/orders?email=" + encodeURIComponent(email))
      .then(function (d) { return (d && d.orders) || null; }).catch(function () { return null; });
  }
  // Public order tracking (no login). Resolves to one of:
  //   { order }     — found (status + timeline)
  //   { error: msg} — not found / bad request
  //   { offline:1 } — no server reachable (file:// or API down)
  function trackOrder(orderNumber, email) {
    if (!API) return Promise.resolve({ offline: true });
    return fetch("/api/track?order=" + encodeURIComponent(orderNumber) + "&email=" + encodeURIComponent(email))
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) { return res.ok ? { order: res.data.order } : { error: (res.data && res.data.error) || "Lookup failed." }; })
      .catch(function () { return { offline: true }; });
  }

  /* ---------- wishlist ---------- */
  function getWishlist() { return read(KEYS.wishlist, []); }
  function inWishlist(productId) { return getWishlist().indexOf(productId) > -1; }
  // toggles membership; returns true if now in the wishlist
  function toggleWishlist(productId) {
    var list = getWishlist();
    var i = list.indexOf(productId);
    if (i > -1) { list.splice(i, 1); write(KEYS.wishlist, list); return false; }
    list.push(productId); write(KEYS.wishlist, list); return true;
  }
  function wishlistCount() { return getWishlist().length; }

  /* ---------- reviews ---------- */
  // stored as { productId: [ { name, rating, comment, createdAt } ] }
  function getAllReviews() { return read(KEYS.reviews, {}); }
  function getReviews(productId) { return getAllReviews()[productId] || []; }
  function addReview(productId, review) {
    var all = getAllReviews();
    if (!all[productId]) all[productId] = [];
    review.rating = Math.max(1, Math.min(5, parseInt(review.rating, 10) || 5));
    review.createdAt = new Date().toISOString();
    all[productId].push(review);
    write(KEYS.reviews, all);
    return review;
  }
  function reviewSummary(productId) {
    var list = getReviews(productId);
    if (!list.length) return { count: 0, avg: 0 };
    var sum = list.reduce(function (s, r) { return s + r.rating; }, 0);
    return { count: list.length, avg: +(sum / list.length).toFixed(1) };
  }

  /* ---------- public API ---------- */
  global.Store = {
    // catalog
    loadCatalog: loadCatalog,
    getProducts: getProducts,
    getProduct: getProduct,
    getCategories: getCategories,
    getCurrency: getCurrency,
    // pricing
    unitPrice: unitPrice,
    lineTotal: lineTotal,
    formatPrice: formatPrice,
    // cart
    getCart: getCart,
    getCartDetailed: getCartDetailed,
    addToCart: addToCart,
    updateCartQty: updateCartQty,
    removeFromCart: removeFromCart,
    clearCart: clearCart,
    cartCount: cartCount,
    // quotes
    submitQuote: submitQuote,
    getQuotes: getQuotes,
    submitContact: submitContact,
    // orders
    placeOrder: placeOrder,
    getOrders: getOrders,
    fetchOrders: fetchOrders,
    trackOrder: trackOrder,
    // wishlist
    getWishlist: getWishlist,
    inWishlist: inWishlist,
    toggleWishlist: toggleWishlist,
    wishlistCount: wishlistCount,
    // reviews
    getReviews: getReviews,
    addReview: addReview,
    reviewSummary: reviewSummary
  };
})(window);
