/* ============================================================
   app.js — TimberPro storefront UI logic
   Shared across pages: header cart/wishlist badges, mobile nav,
   product cards, shop (sidebar filters + sort + wishlist),
   product detail (tabs, reviews, related).
   Depends on store.js (window.Store) and reveal.js.
   ============================================================ */
(function () {
  "use strict";

  var Store = window.Store;
  var repaintMiniCart = null;   // set by initMiniCart so card add-to-cart can refresh the sidebar

  /* ---------- helpers ---------- */
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  // star rating markup (filled vs empty)
  function stars(rating, count) {
    var r = Math.round(rating || 0);
    var out = '<span class="stars" aria-label="' + (rating || 0) + ' out of 5">';
    for (var i = 1; i <= 5; i++) out += '<span class="star' + (i <= r ? " is-on" : "") + '">★</span>';
    out += "</span>";
    if (count != null) out += '<span class="stars-count">(' + count + ")</span>";
    return out;
  }
  // Inline SVG placeholder so the demo looks complete without real photos.
  function placeholder(label) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
      '<rect width="400" height="300" fill="#6b4a2e"/>' +
      '<rect width="400" height="300" fill="url(#g)" opacity="0.25"/>' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#c8862b"/><stop offset="1" stop-color="#2e2017"/></linearGradient></defs>' +
      '<text x="50%" y="50%" fill="#efe7da" font-family="Georgia,serif" font-size="22" ' +
      'text-anchor="middle" dominant-baseline="middle">' + esc(label) + "</text></svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  /* ---------- header badges ---------- */
  function refreshCartCount() {
    var n = Store.cartCount();
    document.querySelectorAll(".cart-count").forEach(function (b) {
      b.textContent = n;
      b.style.display = n > 0 ? "" : "none";
    });
  }
  function refreshWishCount() {
    var n = Store.wishlistCount();
    document.querySelectorAll(".wish-count").forEach(function (b) {
      b.textContent = n;
      b.style.display = n > 0 ? "" : "none";
    });
  }

  /* ---------- mobile nav ---------- */
  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector(".main-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---------- wishlist (delegated, bound once) ---------- */
  function initWishlist() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-wish]");
      if (!btn) return;
      e.preventDefault();
      var on = Store.toggleWishlist(btn.getAttribute("data-wish"));
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      refreshWishCount();
    });
  }
  function wishBtn(id) {
    var on = Store.inWishlist(id);
    return '<button class="wishlist-btn' + (on ? " is-active" : "") + '" data-wish="' +
      esc(id) + '" aria-label="Add to wishlist" aria-pressed="' + (on ? "true" : "false") +
      '" title="Add to wishlist">&#9829;</button>';
  }

  /* ---------- add to cart from a product card (delegated, bound once) ---------- */
  function initAddToCart() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-add-cart]");
      if (!btn || btn.disabled) return;
      e.preventDefault();
      Store.addToCart(btn.getAttribute("data-add-cart"), 1);
      refreshCartCount();
      if (repaintMiniCart) repaintMiniCart();
      btn.classList.add("is-added");                       // brief confirmation pulse
      setTimeout(function () { btn.classList.remove("is-added"); }, 1100);
    });
  }

  /* ---------- product card ---------- */
  function productCard(p, opts) {
    opts = opts || {};
    var isQuote = p.type === "quote-only";
    var detailHref = "product.html?id=" + encodeURIComponent(p.id);
    var quoteHref = "quote.html?id=" + encodeURIComponent(p.id);

    var priceHtml = isQuote
      ? '<span class="product-card_price">' + Store.formatPrice(null) + "</span>"
      : '<span class="product-card_price">' + Store.formatPrice(p.price) +
        ' <small style="font-weight:500;color:var(--ink-soft)">/ ' + esc(p.unit) + "</small></span>";

    var stockBadge = isQuote
      ? '<span class="badge badge--quote">Made to order</span>'
      : (p.stock > 0
          ? '<span class="badge badge--stock">In stock</span>'
          : '<span class="badge badge--low">Out of stock</span>');

    var actions = isQuote
      ? '<a class="btn btn--primary btn--sm" href="' + quoteHref + '">Request Quote</a>' +
        '<a class="btn btn--outline btn--sm" href="' + detailHref + '">View Detail</a>'
      : '<a class="btn btn--primary btn--sm" href="' + detailHref + '">View Detail</a>' +
        '<a class="btn btn--outline btn--sm" href="' + quoteHref + '">Request Quote</a>';

    // overlay icons (heart · cart/quote · view detail) — revealed on hover
    var cartIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
    var arrowIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
    var quoteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';
    var midBtn = isQuote
      ? '<a class="pc-act" href="' + quoteHref + '" aria-label="Request a quote" title="Request a quote">' + quoteIcon + "</a>"
      : '<button class="pc-act" type="button" data-add-cart="' + esc(p.id) + '"' + (p.stock > 0 ? "" : " disabled") +
        ' aria-label="Add to cart" title="Add to cart">' + cartIcon + "</button>";

    var cls = "product-card card" + (opts.reveal ? " reveal" : "");
    return el(
      '<article class="' + cls + '">' +
        '<div class="product-card_media">' +
          '<a href="' + detailHref + '">' +
            '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" ' +
              'onerror="this.onerror=null;this.src=\'' + placeholder(p.species) + '\'">' +
          "</a>" +
          '<div class="product-card_overlay">' +
            wishBtn(p.id) +
            midBtn +
            '<a class="pc-act" href="' + detailHref + '" aria-label="View detail" title="View detail">' + arrowIcon + "</a>" +
          "</div>" +
        "</div>" +
        '<div class="product-card_body">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
            '<span class="product-card_meta">' + esc(p.species) + " &middot; " + esc(p.grade) + "</span>" +
            stockBadge +
          "</div>" +
          '<h3 class="product-card_title"><a href="' + detailHref + '">' + esc(p.name) + "</a></h3>" +
          '<div class="rating-row">' + stars(p.rating, null) + "</div>" +
          '<p class="product-card_meta">' + esc(p.short) + "</p>" +
          priceHtml +
          '<div class="product-card_actions">' + actions + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- testimonials carousel (home) ---------- */
  function initCarousel() {
    var root = document.querySelector("[data-carousel]");
    if (!root) return;
    var track = root.querySelector(".carousel-track");
    var slides = Array.prototype.slice.call(track.children);
    var dotsWrap = root.querySelector("[data-carousel-dots]");
    if (slides.length <= 1) return;

    var index = 0;
    var dots = slides.map(function (_, i) {
      var d = el('<button class="carousel-dot" aria-label="Go to slide ' + (i + 1) + '"></button>');
      d.addEventListener("click", function () { go(i); });
      if (dotsWrap) dotsWrap.appendChild(d);
      return d;
    });

    function go(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = "translateX(" + (-index * 100) + "%)";
      dots.forEach(function (d, k) { d.classList.toggle("is-active", k === index); });
    }

    var prev = root.querySelector("[data-carousel-prev]");
    var next = root.querySelector("[data-carousel-next]");
    if (prev) prev.addEventListener("click", function () { go(index - 1); });
    if (next) next.addEventListener("click", function () { go(index + 1); });

    go(0);

    // auto-advance, pause on hover
    var timer = setInterval(function () { go(index + 1); }, 6000);
    root.addEventListener("mouseenter", function () { clearInterval(timer); });
    root.addEventListener("mouseleave", function () { timer = setInterval(function () { go(index + 1); }, 6000); });
  }

  /* ---------- shop page (sidebar filters + sort) ---------- */
  function initShop() {
    var grid = document.querySelector("[data-shop-grid]");
    if (!grid) return;

    var catList = document.querySelector("[data-cat-list]");
    var tagList = document.querySelector("[data-tag-list]");
    var priceWrap = document.querySelector("[data-price-filter]");
    var titleEl = document.querySelector("[data-shop-title]");
    var countEl = document.querySelector("[data-shop-count]");
    var sortEl = document.querySelector("[data-shop-sort]");
    var searchEl = document.querySelector("[data-shop-search]");

    Store.loadCatalog().then(function (c) {
      var products = c.products;
      var prices = products.filter(function (p) { return p.price != null; })
        .map(function (p) { return p.price; });
      var maxPrice = Math.ceil(Math.max.apply(null, prices.concat([10])));

      var state = {
        cat: qs("cat") || "all",
        tag: qs("tag") || null,
        max: maxPrice,
        sort: "latest",
        q: ""
      };

      function catName(id) {
        var m = c.categories.filter(function (x) { return x.id === id; })[0];
        return m ? m.name : "All products";
      }
      function countIn(catId) {
        return catId === "all" ? products.length
          : products.filter(function (p) { return p.category === catId; }).length;
      }

      /* ----- build sidebar ----- */
      if (catList) {
        var rows = ['<li><button class="cat-link" data-cat="all">All products <span>' + products.length + "</span></button></li>"];
        c.categories.forEach(function (cat) {
          rows.push('<li><button class="cat-link" data-cat="' + esc(cat.id) + '">' +
            esc(cat.name) + " <span>" + countIn(cat.id) + "</span></button></li>");
        });
        catList.innerHTML = rows.join("");
      }
      if (tagList) {
        var allTags = {};
        products.forEach(function (p) { (p.tags || []).forEach(function (t) { allTags[t] = 1; }); });
        tagList.innerHTML = Object.keys(allTags).sort().map(function (t) {
          return '<button class="tag" data-tag="' + esc(t) + '">' + esc(t) + "</button>";
        }).join("");
      }
      if (priceWrap) {
        priceWrap.innerHTML =
          '<input type="range" min="0" max="' + maxPrice + '" value="' + maxPrice + '" step="1" data-price-range>' +
          '<div class="price-readout">Up to <strong data-price-out>RM' + maxPrice + "</strong></div>";
      }

      /* ----- filter + sort + render ----- */
      function apply() {
        var list = products.filter(function (p) {
          if (state.cat !== "all" && p.category !== state.cat) return false;
          if (state.tag && (p.tags || []).indexOf(state.tag) === -1) return false;
          if (p.price != null && p.price > state.max) return false;  // quote-only always pass
          if (state.q) {
            var hay = (p.name + " " + p.species + " " + (p.tags || []).join(" ")).toLowerCase();
            if (hay.indexOf(state.q) === -1) return false;
          }
          return true;
        });

        var sorted = list.slice();
        var big = Number.MAX_SAFE_INTEGER;
        if (state.sort === "price-asc") sorted.sort(function (a, b) { return (a.price == null ? big : a.price) - (b.price == null ? big : b.price); });
        else if (state.sort === "price-desc") sorted.sort(function (a, b) { return (b.price == null ? -1 : b.price) - (a.price == null ? -1 : a.price); });
        else if (state.sort === "name") sorted.sort(function (a, b) { return a.name.localeCompare(b.name); });
        else if (state.sort === "rating") sorted.sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); });

        if (titleEl) titleEl.textContent = state.cat === "all" ? "All products" : catName(state.cat);
        if (countEl) countEl.textContent = "Showing " + sorted.length + " of " + products.length + " products";

        grid.innerHTML = "";
        if (!sorted.length) {
          grid.innerHTML = '<p class="lead">No products match your filters.</p>';
        } else {
          sorted.forEach(function (p) { grid.appendChild(productCard(p, { reveal: true })); });
        }
        if (catList) catList.querySelectorAll("[data-cat]").forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-cat") === state.cat);
        });
        if (tagList) tagList.querySelectorAll("[data-tag]").forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-tag") === state.tag);
        });
        if (window.TimberReveal) window.TimberReveal.refresh();
      }

      /* ----- wire events ----- */
      if (catList) catList.addEventListener("click", function (e) {
        var b = e.target.closest("[data-cat]");
        if (!b) return;
        state.cat = b.getAttribute("data-cat");
        var url = state.cat === "all" ? location.pathname : location.pathname + "?cat=" + state.cat;
        history.replaceState(null, "", url);
        apply();
      });
      if (tagList) tagList.addEventListener("click", function (e) {
        var b = e.target.closest("[data-tag]");
        if (!b) return;
        var t = b.getAttribute("data-tag");
        state.tag = (state.tag === t) ? null : t;   // toggle
        apply();
      });
      if (priceWrap) priceWrap.addEventListener("input", function (e) {
        var r = e.target.closest("[data-price-range]");
        if (!r) return;
        state.max = parseInt(r.value, 10);
        var out = priceWrap.querySelector("[data-price-out]");
        if (out) out.textContent = "RM" + state.max;
        apply();
      });
      if (sortEl) sortEl.addEventListener("change", function () {
        state.sort = sortEl.value;
        apply();
      });
      if (searchEl) searchEl.addEventListener("input", function () {
        state.q = searchEl.value.trim().toLowerCase();
        apply();
      });

      apply();
    });
  }

  /* ---------- sidebar mini-cart (shop page) ---------- */
  function initMiniCart() {
    var wrap = document.querySelector("[data-mini-cart]");
    if (!wrap) return;

    function paint() {
      Store.getCartDetailed().then(function (c) {
        if (!c.lines.length) {
          wrap.innerHTML = '<p class="mini-cart_empty">Your cart is empty.</p>';
          return;
        }
        var items = c.lines.map(function (l) {
          var p = l.product || {};
          return '<div class="mini-cart_item">' +
            '<img class="mini-cart_thumb" src="' + esc(p.image) + '" alt="' + esc(p.name) + '" ' +
              'onerror="this.onerror=null;this.src=\'' + placeholder(p.species || "") + '\'">' +
            '<div class="mini-cart_info">' +
              '<a class="mini-cart_name" href="product.html?id=' + encodeURIComponent(l.id) + '">' + esc(p.name) + "</a>" +
              '<div class="mini-cart_qty">' + l.qty + " &times; " + Store.formatPrice(l.unit) + "</div>" +
            "</div>" +
            '<button class="mini-cart_remove" data-mc-remove="' + esc(l.id) + '" aria-label="Remove">&times;</button>' +
          "</div>";
        }).join("");
        wrap.innerHTML = items +
          '<div class="mini-cart_subtotal"><span>Subtotal:</span> <strong>' + Store.formatPrice(c.subtotal) + "</strong></div>" +
          '<div class="mini-cart_actions">' +
            '<a class="btn btn--primary btn--block" href="cart.html">View cart</a>' +
            '<a class="btn btn--outline btn--block" href="checkout.html">Checkout</a>' +
          "</div>";
      });
    }

    wrap.addEventListener("click", function (e) {
      var b = e.target.closest("[data-mc-remove]");
      if (!b) return;
      Store.removeFromCart(b.getAttribute("data-mc-remove"));
      refreshCartCount();
      paint();
    });
    repaintMiniCart = paint;   // expose for add-to-cart on product cards
    paint();
  }

  /* ---------- cart page ---------- */
  function initCart() {
    var root = document.querySelector("[data-cart]");
    if (!root) return;

    var chevUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>';
    var chevDown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

    function paint() {
      Store.getCartDetailed().then(function (c) {
        if (!c.lines.length) {
          root.innerHTML =
            '<div class="container section cart-empty text-center">' +
              "<h1>Your cart is currently empty</h1>" +
              '<p class="lead">Browse the shop and add some timber to get started.</p>' +
              '<a class="btn btn--primary" href="shop.html">Return to shop</a>' +
            "</div>";
          return;
        }

        var rows = c.lines.map(function (l) {
          var p = l.product || {};
          var name = p.name || l.id;
          var href = "product.html?id=" + encodeURIComponent(l.id);
          return '<tr class="cart-row" data-id="' + esc(l.id) + '">' +
            '<td class="cart-cell--product">' +
              '<a class="cart-thumb" href="' + href + '">' +
                '<img src="' + esc(p.image || "") + '" alt="' + esc(name) + '" ' +
                  'onerror="this.onerror=null;this.src=\'' + placeholder(p.species || "") + '\'">' +
              "</a>" +
              '<div class="cart-prod">' +
                '<a class="cart-prod_name" href="' + href + '">' + esc(name) + "</a>" +
                '<span class="cart-prod_meta">' + esc(p.species || "") + (p.unit ? " &middot; per " + esc(p.unit) : "") + "</span>" +
              "</div>" +
            "</td>" +
            '<td class="cart-cell--price" data-th="Price">' + Store.formatPrice(l.unit) + "</td>" +
            '<td class="cart-cell--qty" data-th="Quantity">' +
              '<div class="qty-stepper">' +
                '<input type="number" min="1" value="' + l.qty + '" data-qty aria-label="Quantity">' +
                '<div class="qty-stepper_btns">' +
                  '<button type="button" class="qty-step" data-qty-inc aria-label="Increase quantity">' + chevUp + "</button>" +
                  '<button type="button" class="qty-step" data-qty-dec aria-label="Decrease quantity">' + chevDown + "</button>" +
                "</div>" +
              "</div>" +
            "</td>" +
            '<td class="cart-cell--total" data-th="Subtotal">' + Store.formatPrice(l.total) + "</td>" +
            '<td class="cart-cell--remove"><button class="cart-remove" data-remove aria-label="Remove ' + esc(name) + '">&times;</button></td>' +
          "</tr>";
        }).join("");

        root.innerHTML =
          '<div class="container section cart-page">' +
            '<div class="cart-layout">' +
              '<div class="cart-main">' +
                '<table class="cart-table">' +
                  "<thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Subtotal</th><th><span class=\"sr-only\">Remove</span></th></tr></thead>" +
                  "<tbody>" + rows + "</tbody>" +
                "</table>" +
                '<div class="cart-actions">' +
                  '<div class="coupon">' +
                    '<span class="coupon_icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/><line x1="9" y1="8" x2="9" y2="16"/></svg></span>' +
                    '<input type="text" placeholder="Coupon Code" data-coupon aria-label="Coupon code">' +
                    '<button class="coupon_apply" type="button" data-coupon-apply>Apply coupon</button>' +
                  "</div>" +
                "</div>" +
                '<p class="coupon-msg" data-coupon-msg hidden></p>' +
              "</div>" +
              '<aside class="cart-totals">' +
                "<h3>Cart totals</h3>" +
                '<div class="cart-totals_row"><span>Subtotal</span><strong>' + Store.formatPrice(c.subtotal) + "</strong></div>" +
                '<div class="cart-totals_row"><span>Shipping</span><span class="cart-totals_muted">Calculated at checkout</span></div>' +
                '<div class="cart-totals_row cart-totals_total"><span>Total</span><strong>' + Store.formatPrice(c.subtotal) + "</strong></div>" +
                '<a class="btn btn--primary btn--block" href="checkout.html">Proceed to Checkout</a>' +
                '<a class="btn btn--primary btn--block btn--shipping" href="shop.html">Continue shopping</a>' +
              "</aside>" +
            "</div>" +
          "</div>";
      });
    }

    /* clicks: remove · clear · coupon · qty chevrons */
    root.addEventListener("click", function (e) {
      var row = e.target.closest(".cart-row");
      if (e.target.closest("[data-remove]") && row) {
        Store.removeFromCart(row.getAttribute("data-id"));
        refreshCartCount(); paint(); return;
      }
      if (e.target.closest("[data-clear]")) {
        Store.clearCart(); refreshCartCount(); paint(); return;
      }
      if (e.target.closest("[data-update]")) {
        root.querySelectorAll(".cart-row").forEach(function (r) {
          var inp = r.querySelector("[data-qty]");
          if (inp) Store.updateCartQty(r.getAttribute("data-id"), Math.max(1, parseInt(inp.value, 10) || 1));
        });
        refreshCartCount(); paint(); return;
      }
      if (e.target.closest("[data-coupon-apply]")) {
        var msg = root.querySelector("[data-coupon-msg]");
        if (msg) { msg.hidden = false; msg.textContent = "Coupons are not available in this demo store."; }
        return;
      }
      var stepBtn = e.target.closest("[data-qty-inc], [data-qty-dec]");
      if (stepBtn && row) {
        var input = row.querySelector("[data-qty]");
        var delta = stepBtn.hasAttribute("data-qty-inc") ? 1 : -1;
        var q = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
        Store.updateCartQty(row.getAttribute("data-id"), q);
        refreshCartCount(); paint();
      }
    });

    /* typing a quantity directly */
    root.addEventListener("change", function (e) {
      var input = e.target.closest("[data-qty]");
      var row = e.target.closest(".cart-row");
      if (input && row) {
        var q = Math.max(1, parseInt(input.value, 10) || 1);
        Store.updateCartQty(row.getAttribute("data-id"), q);
        refreshCartCount(); paint();
      }
    });

    paint();
  }

  /* ---------- checkout page (4-step wizard) ---------- */
  // Structure (steps + fields + progress bar) lives in checkout.html.
  // JS only: fills order data, toggles steps, validates, places the order.
  function initCheckout() {
    var root = document.querySelector("[data-checkout]");
    if (!root) return;

    var form = root.querySelector("[data-checkout-form]");
    var stepsBar = root.querySelector("[data-steps]");
    var stepSections = root.querySelectorAll("[data-step]");

    Store.getCartDetailed().then(function (c) {
      if (!c.lines.length) {
        // nothing to check out — send the shopper to the cart page,
        // which owns the "your cart is empty" state.
        window.location.replace("cart.html");
        return;
      }

      /* fill order review + totals */
      root.querySelector("[data-order-items]").innerHTML = c.lines.map(function (l) {
        var p = l.product || {};
        return '<li class="order-item">' +
          '<span class="order-item_name">' + esc(p.name || l.id) +
            ' <span class="order-item_qty">&times; ' + l.qty + "</span></span>" +
          '<span class="order-item_total">' + Store.formatPrice(l.total) + "</span>" +
        "</li>";
      }).join("");
      var totalStr = Store.formatPrice(c.subtotal);
      root.querySelector("[data-subtotal]").textContent = totalStr;
      root.querySelector("[data-total]").textContent = totalStr;
      var payTotal = root.querySelector("[data-pay-total]");
      if (payTotal) payTotal.textContent = totalStr;

      /* ----- delivery method: self-collect hides + un-requires the address ----- */
      var deliveryFields = root.querySelector("[data-delivery-fields]");
      var pickupNote = root.querySelector("[data-pickup-note]");
      var shippingEl = root.querySelector("[data-shipping]");
      var addrInputs = deliveryFields ? deliveryFields.querySelectorAll("input, select") : [];
      function applyDeliveryMethod() {
        var sel = form.querySelector('[name="deliveryMethod"]:checked');
        var collect = sel && sel.value === "collect";
        if (deliveryFields) deliveryFields.hidden = collect;
        if (pickupNote) pickupNote.hidden = !collect;
        [].forEach.call(addrInputs, function (f) { f.required = !collect; });
        if (shippingEl) shippingEl.textContent = collect ? "Self-collect" : "Free shipping";
      }
      [].forEach.call(form.querySelectorAll('[name="deliveryMethod"]'), function (r) {
        r.addEventListener("change", applyDeliveryMethod);
      });
      applyDeliveryMethod();

      /* ----- payment method + Stripe card element ----- */
      // Stripe TEST publishable key — safe to expose in client code (publishable keys are public).
      // NEVER put a secret key (sk_...) here; it belongs only on a Phase-2 backend.
      var STRIPE_PK = "pk_test_51ThJgoIJzaN5po9QeZCNkz1AYidZOJWuaLdLqpBMriIHldjkUAZAGDSSnwVAgBHrQzodv4zpsgVJgq6cOy9xmvxS009Qt9tMHu";
      var cardPay = root.querySelector("[data-card-pay]");
      var stripeNote = root.querySelector("[data-stripe-note]");
      var cardErrors = root.querySelector("[data-card-errors]");
      var stripe = null, card = null, stripeReady = false, stripeTried = false;
      function ensureStripe() {
        if (stripeTried) return;
        stripeTried = true;
        if (window.Stripe && STRIPE_PK) {
          try {
            stripe = window.Stripe(STRIPE_PK);
            card = stripe.elements().create("card");
            card.mount("#card-element");
            card.on("change", function (ev) {
              if (cardErrors) cardErrors.textContent = ev.error ? ev.error.message : "";
            });
            stripeReady = true;
          } catch (err) {
            if (stripeNote) stripeNote.hidden = false;
          }
        } else if (stripeNote) {
          stripeNote.hidden = false;   // no key set, or Stripe.js failed to load
        }
      }
      function applyPaymentMethod() {
        var sel = form.querySelector('[name="payment"]:checked');
        if (cardPay) cardPay.hidden = !(sel && sel.value === "card");
      }
      [].forEach.call(form.querySelectorAll('[name="payment"]'), function (r) {
        r.addEventListener("change", applyPaymentMethod);
      });
      applyPaymentMethod();

      /* ----- step navigation ----- */
      var current = 1;
      function showStep(n) {
        current = n;
        [].forEach.call(stepSections, function (s) {
          s.hidden = (parseInt(s.getAttribute("data-step"), 10) !== n);
        });
        if (stepsBar) {
          [].forEach.call(stepsBar.querySelectorAll(".step"), function (li) {
            var i = parseInt(li.getAttribute("data-step-ind"), 10);
            li.classList.toggle("is-active", i === n);
            li.classList.toggle("is-done", i < n);
          });
        }
        if (n === 2) ensureStripe();   // mount the card field once step 2 is visible
        var top = stepsBar ? stepsBar.getBoundingClientRect().top + window.pageYOffset - 100 : 0;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
      // Step 1 fields must be valid before leaving step 1.
      function step1Valid() {
        var fields = form.querySelectorAll('[data-step="1"] input, [data-step="1"] select, [data-step="1"] textarea');
        var firstInvalid = null;
        [].forEach.call(fields, function (f) { if (!firstInvalid && !f.checkValidity()) firstInvalid = f; });
        if (firstInvalid) { firstInvalid.reportValidity(); return false; }
        return true;
      }
      showStep(1);

      root.addEventListener("click", function (e) {
        if (e.target.closest("[data-next]")) {
          if (current === 1 && !step1Valid()) return;
          showStep(Math.min(3, current + 1));
        } else if (e.target.closest("[data-prev]")) {
          showStep(Math.max(1, current - 1));
        }
      });

      function finishOrder(pm) {
        var data = new FormData(form);
        var customer = {};
        data.forEach(function (v, k) { customer[k] = v; });
        if (pm && pm.card) customer.cardLast4 = pm.card.last4;   // demo only — no real charge (Phase 2)

        var order = Store.placeOrder({
          items: c.lines.map(function (l) { return { id: l.id, qty: l.qty, unit: l.unit, total: l.total }; }),
          subtotal: c.subtotal,
          customer: customer
        });
        Store.clearCart();
        refreshCartCount();

        var idEl = root.querySelector("[data-order-id]");
        if (idEl) {
          idEl.textContent = order.id;
          document.addEventListener("timber:order-number-updated", function onNum(e) {
            if (e.detail.oldId === order.id || e.detail.oldId === idEl.textContent) {
              idEl.textContent = e.detail.newId;
              document.removeEventListener("timber:order-number-updated", onNum);
            }
          });
        }
        showStep(3);
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!form.checkValidity()) { showStep(1); step1Valid(); return; }

        var paySel = form.querySelector('[name="payment"]:checked');
        if (paySel && paySel.value === "card") {
          if (!stripeReady) { if (stripeNote) stripeNote.hidden = false; return; }
          payByCard();
        } else {
          finishOrder(null);
        }
      });

      // Real charge path: ask the backend for a PaymentIntent, then confirm the card.
      // If the backend isn't running (static demo), fall back to client-side validation only.
      function payByCard() {
        if (cardErrors) cardErrors.textContent = "";
        fetch("/api/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: c.lines.map(function (l) { return { id: l.id, qty: l.qty }; }) })
        }).then(function (r) {
          if (!r.ok) throw new Error("backend-unavailable");
          return r.json();
        }).then(function (d) {
          return stripe.confirmCardPayment(d.clientSecret, { payment_method: { card: card } });
        }).then(function (res) {
          if (res.error) { if (cardErrors) cardErrors.textContent = res.error.message; return; }
          if (res.paymentIntent && res.paymentIntent.status === "succeeded") finishOrder(res.paymentIntent);
        }).catch(function () {
          // No backend reachable → demo mode: validate the card client-side, no real charge.
          stripe.createPaymentMethod({ type: "card", card: card }).then(function (res) {
            if (res.error) { if (cardErrors) cardErrors.textContent = res.error.message; return; }
            finishOrder(res.paymentMethod);
          });
        });
      }
    });
  }

  /* ---------- order history page ---------- */
  function initOrders() {
    var root = document.querySelector("[data-orders]");
    if (!root) return;

    function fmtDate(iso) {
      try {
        return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      } catch (e) { return iso || "—"; }
    }
    // demo orders are saved with status "new" — map each status to a badge style + label
    function statusBadge(status) {
      var map = {
        "new":        ["badge--new", "Pending"],
        "pending":    ["badge--new", "Pending"],
        "confirmed":  ["badge--info", "Confirmed"],
        "processing": ["badge--info", "Processing"],
        "ready":      ["badge--new", "Ready for Delivery"],
        "shipped":    ["badge--new", "Ready for Delivery"],
        "delivered":  ["badge--stock", "Delivered"],
        "completed":  ["badge--stock", "Completed"],
        "cancelled":  ["badge--low", "Cancelled"]
      };
      var s = map[status] || ["badge--new", status || "Pending"];
      return '<span class="badge ' + s[0] + '">' + esc(s[1]) + "</span>";
    }

    Store.loadCatalog().then(function (c) {
      var byId = {};
      c.products.forEach(function (p) { byId[p.id] = p; });

      var orders = Store.getOrders().slice().reverse();   // newest first
      if (!orders.length) {
        root.innerHTML =
          '<div class="container section orders-empty text-center">' +
            "<h2>No orders yet</h2>" +
            '<p class="lead">When you place an order it will appear here.</p>' +
            '<a class="btn btn--primary" href="shop.html">Start shopping</a>' +
          "</div>";
        return;
      }

      var rows = orders.map(function (o) {
        var count = (o.items || []).reduce(function (n, i) { return n + (i.qty || 0); }, 0);
        var cust = o.customer || {};
        var collect = cust.deliveryMethod === "collect";

        var items = (o.items || []).map(function (i) {
          var name = (byId[i.id] && byId[i.id].name) || i.id;
          return '<tr><td>' + esc(name) + ' <span class="order-qty">&times; ' + i.qty + "</span></td>" +
            "<td>" + Store.formatPrice(i.unit) + "</td>" +
            '<td class="order-it-total">' + Store.formatPrice(i.total) + "</td></tr>";
        }).join("");

        var fulfil = collect
          ? "Self-collect"
          : "Delivery" + (cust.address ? " — " + esc(cust.address) + (cust.city ? ", " + esc(cust.city) : "") : "");
        var payLabel = { card: "Card", cod: "Cash on delivery", bank: "Bank transfer" }[cust.payment] || (cust.payment || "—");

        return '<div class="order-acc">' +
          '<button class="order-head" type="button" data-order-toggle aria-expanded="false">' +
            '<span class="order-head_main">' +
              '<span class="order-id">' + esc(o.id) + "</span>" +
              '<span class="order-date">' + fmtDate(o.createdAt) + "</span>" +
            "</span>" +
            '<span class="order-head_meta">' +
              '<span class="order-count">' + count + (count === 1 ? " item" : " items") + "</span>" +
              '<span class="order-amount">' + Store.formatPrice(o.subtotal) + "</span>" +
              statusBadge(o.status) +
              '<span class="order-chev" aria-hidden="true">&#9662;</span>' +
            "</span>" +
          "</button>" +
          '<div class="order-panel">' +
            '<table class="order-items-table">' +
              "<thead><tr><th>Product</th><th>Unit</th><th>Subtotal</th></tr></thead>" +
              "<tbody>" + items + "</tbody>" +
            "</table>" +
            '<div class="order-summary-rows">' +
              "<div><span>Customer</span>" + esc((cust.firstName || "") + " " + (cust.lastName || "")).trim() + "</div>" +
              "<div><span>Fulfilment</span>" + fulfil + "</div>" +
              "<div><span>Payment</span>" + esc(payLabel) + "</div>" +
              '<div class="order-total-row"><span>Total</span><strong>' + Store.formatPrice(o.subtotal) + "</strong></div>" +
            "</div>" +
          "</div>" +
        "</div>";
      }).join("");

      root.innerHTML = '<div class="container section"><div class="orders-list">' + rows + "</div></div>";

      root.addEventListener("click", function (e) {
        var head = e.target.closest("[data-order-toggle]");
        if (!head) return;
        var acc = head.closest(".order-acc");
        var open = acc.classList.toggle("is-open");
        head.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  /* ---------- track order (public, no login) ---------- */
  function initTrack() {
    var root = document.querySelector("[data-track]");
    if (!root) return;
    var form = root.querySelector("[data-track-form]");
    var result = root.querySelector("[data-track-result]");
    if (!form || !result) return;

    function norm(s) { s = (s || "").toLowerCase(); if (s === "new") return "pending"; if (s === "shipped") return "ready"; return s; }
    var STEPS = [
      { key: "pending", label: "Order Submitted" },
      { key: "confirmed", label: "Confirmed" },
      { key: "processing", label: "Processing" },
      { key: "ready", label: "Ready for Delivery" },
      { key: "delivered", label: "Delivered" },
      { key: "completed", label: "Completed" }
    ];
    function fmtDateTime(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    function fmtDate(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
    function badge(status) {
      var map = { pending: ["badge--new", "Pending"], confirmed: ["badge--info", "Confirmed"], processing: ["badge--info", "Processing"], ready: ["badge--new", "Ready for Delivery"], delivered: ["badge--stock", "Delivered"], completed: ["badge--stock", "Completed"], cancelled: ["badge--low", "Cancelled"] };
      var s = map[status] || ["badge--new", status || "Pending"];
      return '<span class="badge ' + s[0] + '">' + esc(s[1]) + "</span>";
    }

    function timelineHTML(o) {
      var status = norm(o.status), cancelled = status === "cancelled", curIdx = -1;
      STEPS.forEach(function (st, i) { if (st.key === status) curIdx = i; });
      var timeMap = {};
      (o.history || []).forEach(function (h) { var k = norm(h.status); if (!(k in timeMap)) timeMap[k] = h.at; });
      var lis = STEPS.map(function (st, i) {
        var cls = "", marker = "○";
        if (cancelled) { if (timeMap[st.key]) { cls = "is-done"; marker = "✓"; } }
        else if (i < curIdx) { cls = "is-done"; marker = "✓"; }
        else if (i === curIdx) { cls = "is-current"; marker = "●"; }
        var when = timeMap[st.key] || (st.key === "pending" ? o.createdAt : null);
        return '<li class="' + cls + '"><span class="tl-dot">' + marker + '</span><span class="tl-title">' + st.label + '</span>' + (when ? '<span class="tl-time">' + fmtDateTime(when) + '</span>' : "") + '</li>';
      });
      if (cancelled) { var c = timeMap.cancelled; lis.push('<li class="is-cancelled"><span class="tl-dot">✕</span><span class="tl-title">Cancelled</span>' + (c ? '<span class="tl-time">' + fmtDateTime(c) + '</span>' : "") + '</li>'); }
      return '<ul class="timeline">' + lis.join("") + '</ul>';
    }

    function render(o) {
      var status = norm(o.status);
      result.innerHTML =
        '<div class="track-card">' +
          '<div class="track-card_head">' +
            '<div><span class="track-label">Order</span><span class="track-num">' + esc(o.orderNumber) + '</span></div>' +
            badge(status) +
          '</div>' +
          (o.estDelivery ? '<p class="track-est"><span class="track-label">Estimated delivery</span> ' + fmtDate(o.estDelivery) + '</p>' : "") +
          '<h3 class="track-tl-title">Order timeline</h3>' +
          timelineHTML(o) +
        '</div>';
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var orderNumber = (form.querySelector('[name="order"]').value || "").trim();
      var email = (form.querySelector('[name="email"]').value || "").trim();
      result.innerHTML = '<p class="lead">Looking up your order…</p>';
      Store.trackOrder(orderNumber, email).then(function (res) {
        if (res.offline) { result.innerHTML = '<div class="track-msg">Order tracking needs the live server. Please try again from the online store.</div>'; return; }
        if (res.error || !res.order) { result.innerHTML = '<div class="track-msg track-msg--err">' + esc(res.error || "We couldn’t find an order with that number and email.") + '</div>'; return; }
        render(res.order);
      });
    });
  }

  /* ---------- contact page ---------- */
  function initContact() {
    var form = document.querySelector("[data-contact-form]");
    if (!form) return;
    var waLink = form.querySelector("[data-wa-link]");
    var success = form.querySelector("[data-contact-success]");

    // Build the WhatsApp deep-link from whatever the visitor has typed so far.
    function buildWa() {
      if (!waLink) return;
      var base = waLink.getAttribute("data-wa-base");
      var get = function (n) { var f = form.querySelector('[name="' + n + '"]'); return f ? f.value.trim() : ""; };
      var parts = ["Hi TimberPro,"];
      if (get("fullName")) parts.push("I'm " + get("fullName") + (get("company") ? " (" + get("company") + ")" : "") + ".");
      if (get("topic")) parts.push("Topic: " + get("topic") + ".");
      if (get("message")) parts.push(get("message"));
      var text = parts.join(" ");
      waLink.href = "https://wa.me/" + base + "?text=" + encodeURIComponent(text);
    }
    form.addEventListener("input", buildWa);
    buildWa();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      // Persist to the DB when the backend is running; otherwise confirm client-side.
      var data = new FormData(form);
      var msg = {};
      data.forEach(function (v, k) { msg[k] = v; });
      if (Store && Store.submitContact) Store.submitContact(msg);
      if (success) success.hidden = false;
      form.querySelectorAll("input, textarea, select").forEach(function (f) {
        if (f.name) f.value = "";
      });
      buildWa();
    });
  }

  /* ---------- request a quote page (quote.html) ---------- */
  // Structure (sections + fields) lives in quote.html.
  // JS only: fills the product list, shows the unit, submits via Store.submitQuote.
  function initQuote() {
    var form = document.querySelector("[data-quote-form]");
    if (!form) return;
    var select = form.querySelector("[data-quote-product]");
    var unitEl = form.querySelector("[data-quote-unit]");
    var success = form.querySelector("[data-quote-success]");
    var refEl = form.querySelector("[data-quote-ref]");
    var byId = {};

    Store.loadCatalog().then(function (c) {
      // quote-only products first (they're the natural RFQ candidates), then buy-now.
      var quoteFirst = c.products.slice().sort(function (a, b) {
        var qa = a.type === "quote-only" ? 0 : 1, qb = b.type === "quote-only" ? 0 : 1;
        return qa - qb || a.name.localeCompare(b.name);
      });
      var opts = ['<option value="">Select a product…</option>'];
      quoteFirst.forEach(function (p) {
        byId[p.id] = p;
        var tag = p.type === "quote-only" ? " (made to order)" : "";
        opts.push('<option value="' + esc(p.id) + '">' + esc(p.name) + esc(tag) + "</option>");
      });
      opts.push('<option value="other">Other / not listed</option>');
      if (select) select.innerHTML = opts.join("");

      // pre-select the product passed via ?id=
      var pre = qs("id");
      if (pre && byId[pre] && select) select.value = pre;
      syncUnit();
    });

    function syncUnit() {
      if (!unitEl) return;
      var p = byId[select && select.value];
      unitEl.value = p ? p.unit : "";
    }
    if (select) select.addEventListener("change", syncUnit);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var get = function (n) { var f = form.querySelector('[name="' + n + '"]'); return f ? f.value.trim() : ""; };

      var pid = get("product");
      var prod = byId[pid];
      var productName = prod ? prod.name : "Other / not listed";

      // dimensions -> "L × W × T mm" (only the parts that were filled in)
      var dims = [get("dimLength"), get("dimWidth"), get("dimThickness")]
        .map(function (v) { return v === "" ? null : v; });
      var dimensions = dims.some(function (v) { return v != null; })
        ? dims.map(function (v) { return v == null ? "—" : v + "mm"; }).join(" × ")
        : "";

      // Timeline has no dedicated field in store/api/db (Phase 1), so fold it into
      // the message text where the admin builder shows it under Notes.
      var neededBy = get("neededBy"), urgency = get("timeline"), finish = get("finish");
      var parts = [];
      if (neededBy) parts.push("Needed by: " + neededBy);
      if (urgency) parts.push("Timeline: " + urgency);
      if (finish) parts.push("Finish/grade: " + finish);
      if (get("message")) parts.push(get("message"));

      var quote = {
        productId: pid === "other" ? null : pid,
        productName: productName,
        qty: Math.max(1, parseInt(get("quantity"), 10) || 1),
        dimensions: dimensions,
        name: get("name"),
        email: get("email"),
        phone: get("phone"),
        company: get("company"),
        timeline: urgency || neededBy || "",
        message: parts.join("\n")
      };

      var saved = Store.submitQuote(quote);
      if (refEl && saved && saved.id) refEl.textContent = saved.id;
      if (success) success.hidden = false;
      form.querySelectorAll("input, textarea, select").forEach(function (f) {
        if (f.name && f.type !== "submit") f.value = "";
      });
      syncUnit();
      success.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  /* ---------- services page: what-we-do slideshow ---------- */
  function initServicesSlideshow() {
    var box = document.querySelector("[data-ww-slideshow]");
    if (!box) return;
    var slides = box.querySelectorAll(".ww-slide");
    if (slides.length < 2) return;
    var i = 0;
    setInterval(function () {
      slides[i].classList.remove("is-active");
      i = (i + 1) % slides.length;
      slides[i].classList.add("is-active");
    }, 10000);   // change every 10 seconds
  }

  /* ---------- project detail page (data/projects.js) ---------- */
  function initProjectDetail() {
    var root = document.querySelector("[data-project-detail]");
    if (!root) return;
    var data = window.__TIMBER_PROJECTS__ || { projects: [] };
    var id = qs("id");
    var p = data.projects.filter(function (x) { return x.id === id; })[0];

    if (!p) {
      root.innerHTML =
        '<div class="container section text-center">' +
          "<h2>Project not found</h2>" +
          '<p class="lead">We couldn\'t find that project.</p>' +
          '<a class="btn btn--primary" href="services.html">Back to services</a>' +
        "</div>";
      return;
    }
    document.title = p.title + " — TimberPro";

    var body = (p.body || []).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
    var services = (p.services || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
    var gallery = (p.gallery || []).map(function (src) {
      return '<img src="' + esc(src) + '" alt="' + esc(p.title) + '" ' +
        'onerror="this.onerror=null;this.src=\'' + placeholder(p.title) + '\'">';
    }).join("");

    root.innerHTML =
      '<div class="container product-detail">' +
        '<nav class="crumbs"><a href="index.html">Home</a> / <a href="services.html">Services</a> / <span>' + esc(p.title) + "</span></nav>" +
        '<div class="grid grid--2 product-top" style="gap:48px;align-items:start">' +
          '<div class="project-hero">' +
            '<img src="' + esc(p.image) + '" alt="' + esc(p.title) + '" ' +
              'onerror="this.onerror=null;this.src=\'' + placeholder(p.title) + '\'">' +
          "</div>" +
          "<div>" +
            '<span class="eyebrow">' + esc(p.category || "Project") + "</span>" +
            "<h1>" + esc(p.title) + "</h1>" +
            '<p class="lead">' + esc(p.summary) + "</p>" +
            '<div class="project-meta">' +
              "<div><span>Client</span>" + esc(p.client || "—") + "</div>" +
              "<div><span>Year</span>" + esc(p.year || "—") + "</div>" +
              "<div><span>Location</span>" + esc(p.location || "—") + "</div>" +
            "</div>" +
            (services ? '<ul class="check-list">' + services + "</ul>" : "") +
             (body ? '<div class="project-body">' + body + "</div>" : "") +
            '<div style="margin-top:44px;"><a class="btn btn--outline" href="services.html">&larr; Back to all projects</a></div>' +
          "</div>" +
        "</div>" +
      "</div>";

    if (window.TimberReveal) window.TimberReveal.refresh();
  }

  /* ---------- product detail page ---------- */
  function initProduct() {
    var root = document.querySelector("[data-product]");
    if (!root) return;
    var id = qs("id");

    Store.loadCatalog().then(function (c) {
      var p = c.products.filter(function (x) { return x.id === id; })[0];
      if (!p) {
        root.innerHTML =
          '<div class="container section text-center">' +
            "<h2>Product not found</h2>" +
            '<p class="lead">We couldn\'t find that product.</p>' +
            '<a class="btn btn--primary" href="shop.html">Back to shop</a>' +
          "</div>";
        return;
      }
      document.title = p.name + " — TimberPro";
      var isQuote = p.type === "quote-only";
      var d = p.dimensions || {};
      var dimRow = [d.length_mm, d.width_mm, d.thickness_mm]
        .map(function (v) { return v == null ? "—" : v + "mm"; }).join(" × ");
      var sum = Store.reviewSummary(p.id);

      /* ----- icons (zoom · cart · qty chevrons) ----- */
      var iconSearch = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></svg>';
      var iconCart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
      var iconChevUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>';
      var iconChevDown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

      /* ----- price · description · actions ----- */
      var priceBlock = isQuote
        ? '<span class="badge badge--quote">Made to order</span>' +
          '<p class="lead" style="margin:14px 0 0">Priced per project to your specification.</p>'
        : '<div class="price-row"><span class="product-card_price" data-unit-price>' + Store.formatPrice(p.price) + "</span>" +
            ' <small style="color:var(--ink-soft)">/ ' + esc(p.unit) + "</small></div>" +
          (p.stock > 0
            ? '<span class="badge badge--stock">In stock (' + p.stock + ")</span>"
            : '<span class="badge badge--low">Out of stock</span>');

      var descBlock = '<div class="product-desc"><p>' + esc(p.short) + "</p></div>";

      var actionBlock = isQuote
        ? '<a class="btn btn--buy btn--block" href="quote.html?id=' + encodeURIComponent(p.id) + '">' + iconCart + "Request a Quote</a>"
        : '<div class="buy-actions">' +
            '<div class="qty-stepper">' +
              '<input id="qty" type="number" min="1" value="1" data-qty aria-label="Quantity">' +
              '<div class="qty-stepper_btns">' +
                '<button type="button" class="qty-step" data-qty-inc aria-label="Increase quantity">' + iconChevUp + "</button>" +
                '<button type="button" class="qty-step" data-qty-dec aria-label="Decrease quantity">' + iconChevDown + "</button>" +
              "</div>" +
            "</div>" +
            '<button class="btn btn--buy" data-add' + (p.stock > 0 ? "" : " disabled") + ">" + iconCart + "Buy Now</button>" +
            wishBtn(p.id) +
          "</div>" +
          '<div class="line-total" data-line-total></div>';

      /* ----- meta (sku / category / tags) ----- */
      var tagsHtml = (p.tags || []).map(function (t) {
        return '<a class="tag" href="shop.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>";
      }).join("");
      var metaHtml =
        '<div class="product-meta">' +
          "<div><span>SKU:</span> " + esc(p.sku || "—") + "</div>" +
          '<div><span>Categories:</span> <a href="shop.html?cat=' + encodeURIComponent(p.category) + '">' +
            esc((c.categories.filter(function (x) { return x.id === p.category; })[0] || {}).name || p.category) + "</a></div>" +
          (tagsHtml ? '<div class="product-tags"><span>Tags:</span> ' + tagsHtml + "</div>" : "") +
          "<div><span>Product ID:</span> " + esc(p.id) + "</div>" +
        "</div>";

      /* ----- tabs content ----- */
      var addInfo =
        '<table class="spec-table">' +
          "<tr><td>Species</td><td>" + esc(p.species) + "</td></tr>" +
          "<tr><td>Grade</td><td>" + esc(p.grade) + "</td></tr>" +
          "<tr><td>Sold by</td><td>per " + esc(p.unit) + "</td></tr>" +
          "<tr><td>Dimensions (L×W×T)</td><td>" + dimRow + "</td></tr>" +
          ((p.finishes && p.finishes.length) ? "<tr><td>Finish options</td><td>" + p.finishes.map(esc).join(", ") + "</td></tr>" : "") +
        "</table>";

      var bulkRows = (p.bulkTiers || []).map(function (t) {
        return "<tr><td>" + t.minQty + "+ " + esc(p.unit) + "s</td><td>" +
          Store.formatPrice(t.price) + " / " + esc(p.unit) + "</td></tr>";
      }).join("");
      var bulkTable = bulkRows
        ? '<h4>Bulk pricing</h4><table class="bulk-table">' +
          "<tr><td>1+ " + esc(p.unit) + "s</td><td>" + Store.formatPrice(p.price) + " / " + esc(p.unit) + "</td></tr>" +
          bulkRows + "</table>"
        : "";

      root.innerHTML =
        '<div class="container product-detail">' +
          '<nav class="crumbs"><a href="index.html">Home</a> / <a href="shop.html">Shop</a> / <span>' + esc(p.name) + "</span></nav>" +
          '<div class="grid grid--2 product-top" style="gap:48px;align-items:start">' +
            '<div class="product-gallery">' +
              '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" ' +
                'onerror="this.onerror=null;this.src=\'' + placeholder(p.species) + '\'">' +
              '<button class="zoom-btn" type="button" data-zoom aria-label="Zoom image" title="Zoom">' + iconSearch + "</button>" +
            "</div>" +
            '<div class="product-info">' +
              "<h1>" + esc(p.name) + "</h1>" +
              priceBlock +
              descBlock +
              actionBlock +
              metaHtml +
            "</div>" +
          "</div>" +

          '<div class="tabs" data-tabs>' +
            '<div class="tab-nav" role="tablist">' +
              '<button class="tab-btn is-active" data-tab="desc">Description</button>' +
              '<button class="tab-btn" data-tab="info">Additional information</button>' +
              '<button class="tab-btn" data-tab="rev">Reviews (' + sum.count + ")</button>" +
            "</div>" +
            '<div class="tab-panels">' +
              '<div class="tab-panel is-active" data-panel="desc"><p>' + esc(p.description) + "</p></div>" +
              '<div class="tab-panel" data-panel="info">' + addInfo + bulkTable + "</div>" +
              '<div class="tab-panel" data-panel="rev" data-reviews></div>' +
            "</div>" +
          "</div>" +

          '<div class="related" data-related></div>' +
          '<div class="lightbox" data-lightbox hidden><img alt="" data-lightbox-img></div>' +
        "</div>";

      /* ----- buy-now interactivity ----- */
      if (!isQuote) {
        var qtyInput = root.querySelector("[data-qty]");
        var unitEl = root.querySelector("[data-unit-price]");
        var lineEl = root.querySelector("[data-line-total]");
        var addBtn = root.querySelector("[data-add]");

        var refresh = function () {
          var qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
          unitEl.textContent = Store.formatPrice(Store.unitPrice(p, qty));
          lineEl.textContent = "Total: " + Store.formatPrice(Store.lineTotal(p, qty));
        };
        var stepQty = function (delta) {
          qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) + delta);
          refresh();
        };
        if (qtyInput) { qtyInput.addEventListener("input", refresh); refresh(); }
        var incBtn = root.querySelector("[data-qty-inc]");
        var decBtn = root.querySelector("[data-qty-dec]");
        if (incBtn) incBtn.addEventListener("click", function () { stepQty(1); });
        if (decBtn) decBtn.addEventListener("click", function () { stepQty(-1); });
        if (addBtn) addBtn.addEventListener("click", function () {
          var qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
          Store.addToCart(p.id, qty);
          refreshCartCount();
          window.location.href = "cart.html";   // Buy Now → straight to cart
        });
      }

      /* ----- image zoom / lightbox ----- */
      var zoomBtn = root.querySelector("[data-zoom]");
      var lightbox = root.querySelector("[data-lightbox]");
      var galleryImg = root.querySelector(".product-gallery img");
      if (zoomBtn && lightbox && galleryImg) {
        var lbImg = lightbox.querySelector("[data-lightbox-img]");
        zoomBtn.addEventListener("click", function () {
          lbImg.src = galleryImg.currentSrc || galleryImg.src;
          lbImg.alt = galleryImg.alt;
          lightbox.hidden = false;
        });
        lightbox.addEventListener("click", function () { lightbox.hidden = true; });
      }

      /* ----- tabs ----- */
      var tabs = root.querySelector("[data-tabs]");
      tabs.addEventListener("click", function (e) {
        var b = e.target.closest("[data-tab]");
        if (!b) return;
        var key = b.getAttribute("data-tab");
        tabs.querySelectorAll("[data-tab]").forEach(function (x) { x.classList.toggle("is-active", x === b); });
        tabs.querySelectorAll("[data-panel]").forEach(function (x) {
          x.classList.toggle("is-active", x.getAttribute("data-panel") === key);
        });
      });

      /* ----- reviews ----- */
      renderReviews(root.querySelector("[data-reviews]"), p, tabs);

      /* ----- related ----- */
      var related = c.products.filter(function (x) {
        return x.category === p.category && x.id !== p.id;
      }).slice(0, 3);
      var relWrap = root.querySelector("[data-related]");
      if (related.length) {
        relWrap.innerHTML = '<h2 style="margin-bottom: 2rem;">Related products</h2>' +
          '<div class="grid grid--3 cards-minimal" data-related-grid></div>';
        var rg = relWrap.querySelector("[data-related-grid]");
        related.forEach(function (rp) { rg.appendChild(productCard(rp, { reveal: true })); });
      }
      if (window.TimberReveal) window.TimberReveal.refresh();
    });
  }

  /* ---------- reviews render + submit ---------- */
  function renderReviews(wrap, p, tabs) {
    if (!wrap) return;
    function paint() {
      var list = Store.getReviews(p.id);
      var items = list.length
        ? list.map(function (r) {
            return '<li class="review">' +
              '<div class="review-head"><strong>' + esc(r.name || "Anonymous") + "</strong>" +
              '<span class="rating-row">' + stars(r.rating, null) + "</span></div>" +
              "<p>" + esc(r.comment) + "</p></li>";
          }).join("")
        : '<li class="review-empty">No reviews yet. Be the first to review this product.</li>';

      wrap.innerHTML =
        '<ul class="review-list">' + items + "</ul>" +
        '<form class="review-form" data-review-form>' +
          "<h4>Add a review</h4>" +
          '<div class="form-row"><label>Your rating</label>' +
            '<select name="rating" required>' +
              '<option value="5">★★★★★ — Excellent</option>' +
              '<option value="4">★★★★ — Good</option>' +
              '<option value="3">★★★ — Average</option>' +
              '<option value="2">★★ — Poor</option>' +
              '<option value="1">★ — Terrible</option>' +
            "</select></div>" +
          '<div class="form-row"><label>Name</label><input name="name" type="text" required></div>' +
          '<div class="form-row"><label>Review</label><textarea name="comment" rows="4" required></textarea></div>' +
          '<button class="btn btn--primary" type="submit">Submit review</button>' +
        "</form>";

      var form = wrap.querySelector("[data-review-form]");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        Store.addReview(p.id, {
          name: fd.get("name"),
          rating: fd.get("rating"),
          comment: fd.get("comment")
        });
        paint();  // re-render list + clear form
        // update the tab label count
        if (tabs) {
          var btn = tabs.querySelector('[data-tab="rev"]');
          if (btn) btn.textContent = "Reviews (" + Store.reviewSummary(p.id).count + ")";
        }
      });
    }
    paint();
  }

  /* ---------- company info (admin-managed, DB-backed) ----------
     Fills any [data-company="email|phone|hours|name|address"] element from
     /api/settings/company. Skips on file:// (no API) so the static fallback
     text written in the HTML stays put. */
  function initCompanyInfo() {
    var hooks = document.querySelectorAll("[data-company]");
    if (!hooks.length) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    fetch("/api/settings/company")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var c = d && d.company;
        if (!c) return;
        hooks.forEach(function (n) {
          var key = n.getAttribute("data-company");
          if (c[key]) n.textContent = c[key];
        });
      })
      .catch(function () { /* offline / API down — keep static text */ });
  }

  /* ---------- maintenance mode (admin-toggled) ----------
     If System Preferences → Maintenance mode is ON, show a full-screen
     holding page to customers. Admin pages don't load app.js, so staff
     can still reach the panel to switch it back off. Skips on file://. */
  function initMaintenance() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    fetch("/api/settings/site").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.maintenanceMode) return;
      var name = d.companyName || "TimberPro";
      var o = document.createElement("div");
      o.id = "maintenanceOverlay";
      o.setAttribute("style", "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;text-align:center;padding:24px;background:#2e2017;color:#efe7da;font-family:'Alata',system-ui,sans-serif");
      o.innerHTML = '<div style="max-width:520px">' +
        '<div style="font-family:Georgia,serif;font-size:30px;margin-bottom:14px">' + esc(name) + '</div>' +
        '<h1 style="font-size:34px;line-height:1.2;margin-bottom:14px">We’ll be right back</h1>' +
        '<p style="opacity:.85;line-height:1.6">Our store is briefly down for scheduled maintenance. Please check back shortly — thank you for your patience.</p>' +
        '</div>';
      document.body.appendChild(o);
      document.body.style.overflow = "hidden";
    }).catch(function () { /* API down — show the normal site */ });
  }

  /* ---------- expose for other pages ---------- */
  window.TimberUI = { productCard: productCard, placeholder: placeholder, stars: stars, refreshCartCount: refreshCartCount };

  /* ---------- init ---------- */
  function init() {
    initNav();
    initWishlist();
    initAddToCart();
    initCart();
    initCheckout();
    initServicesSlideshow();
    initProjectDetail();
    initContact();
    initQuote();
    initOrders();
    initTrack();
    refreshCartCount();
    refreshWishCount();
    initCarousel();
    initShop();
    initMiniCart();
    initProduct();
    initCompanyInfo();
    initMaintenance();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
