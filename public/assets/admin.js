/* ============================================================
   assets/admin.js — shared admin UI helpers (no framework)
   Loaded by every admin-*.html. Handles: active nav, mobile
   sidebar toggle, the right-side drawer, and toasts.
   Page-specific rendering lives in each page's inline script.
   Public: window.AdminUI = { openDrawer, closeDrawer, toast }
   ============================================================ */
(function (global) {
  "use strict";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  /* ---------- active nav (match by filename) ---------- */
  function markActive() {
    var here = (location.pathname.split("/").pop() || "admin-dashboard.html").toLowerCase();
    var links = document.querySelectorAll(".admin-nav a");
    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute("href") || "").toLowerCase();
      links[i].classList.toggle("is-active", href === here);
    }
  }

  /* ---------- mobile sidebar ---------- */
  function setupSidebar() {
    var sb = $(".admin-sidebar");
    var burger = $(".hamburger");
    var overlay = $(".sb-overlay");
    if (!sb) return;
    function open() { sb.classList.add("is-open"); if (overlay) overlay.classList.add("is-open"); }
    function close() { sb.classList.remove("is-open"); if (overlay) overlay.classList.remove("is-open"); }
    if (burger) burger.addEventListener("click", open);
    if (overlay) overlay.addEventListener("click", close);
  }

  /* ---------- drawer (slide-over) ---------- */
  var drawer, drawerOverlay, drawerTitle, drawerBody, drawerFoot;
  function ensureDrawer() {
    if (drawer) return;
    drawerOverlay = document.createElement("div");
    drawerOverlay.className = "drawer-overlay";
    drawer = document.createElement("aside");
    drawer.className = "drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.innerHTML =
      '<div class="drawer-head"><h2 class="drawer-title"></h2><div class="spacer"></div>' +
      '<button class="drawer-close" aria-label="Close">&times;</button></div>' +
      '<div class="drawer-body"></div>' +
      '<div class="drawer-foot"></div>';
    document.body.appendChild(drawerOverlay);
    document.body.appendChild(drawer);
    drawerTitle = $(".drawer-title", drawer);
    drawerBody = $(".drawer-body", drawer);
    drawerFoot = $(".drawer-foot", drawer);
    drawerOverlay.addEventListener("click", closeDrawer);
    $(".drawer-close", drawer).addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  }
  function openDrawer(title, bodyHTML, footHTML) {
    ensureDrawer();
    drawerTitle.textContent = title || "";
    drawerBody.innerHTML = bodyHTML || "";
    drawerFoot.innerHTML = footHTML || "";
    drawerFoot.style.display = footHTML ? "" : "none";
    requestAnimationFrame(function () {
      drawerOverlay.classList.add("is-open");
      drawer.classList.add("is-open");
    });
    return drawer;
  }
  function closeDrawer() {
    if (!drawer) return;
    drawerOverlay.classList.remove("is-open");
    drawer.classList.remove("is-open");
  }

  /* ---------- toast ---------- */
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add("is-open"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-open"); }, 2600);
  }

  /* ---------- data-mode badge (Live DB vs offline localStorage) ---------- */
  function setModeBadge() {
    var foot = $(".sb-foot"); if (!foot || !global.AdminStore) return;
    var db = global.AdminStore.isDbBacked && global.AdminStore.isDbBacked();
    var b = document.getElementById("modeBadge");
    if (!b) { b = document.createElement("div"); b.id = "modeBadge"; foot.insertBefore(b, foot.firstChild); }
    b.className = "mode-badge " + (db ? "is-live" : "is-offline");
    b.title = db ? "Connected to the timber_db database via the server." : "The server/API isn't reachable — changes are saved in this browser only. Run: node server.js, then open http://localhost:4321";
    b.textContent = db ? "● Live database" : "○ Offline — saved in browser only";
  }

  /* ---------- auth guard (staff sessions + per-page permission) ---------- */
  var PAGE_MODULE = {
    "admin-dashboard.html": "dashboard",
    "admin-products.html": "products", "admin-product-form.html": "products",
    "admin-inventory.html": "inventory", "admin-inventory-detail.html": "inventory", "admin-stock-movement.html": "inventory",
    "admin-orders.html": "orders", "admin-order.html": "orders",
    "admin-quotes.html": "quotes",
    "admin-customers.html": "customers",
    "admin-analytics.html": "analytics",
    "admin-settings.html": "settings", "admin-settings-company.html": "settings", "admin-settings-users.html": "settings",
    "admin-settings-roles.html": "settings", "admin-settings-email.html": "settings", "admin-settings-system.html": "settings"
  };
  function currentFile() { return (location.pathname.split("/").pop() || "admin-dashboard.html").toLowerCase(); }
  function initials(name) { return (name || "S").split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase(); }

  function applyUser(user) {
    var perms = user.permissions || {};
    var chip = $(".user-chip");
    if (chip) {
      var b = $(".meta b", chip), sm = $(".meta small", chip), ava = $(".ava", chip);
      if (b) b.textContent = user.name || "Staff";
      if (sm) sm.textContent = user.roleName || "";
      if (ava) ava.textContent = initials(user.name);
    }
    // hide nav links the role can't access
    var links = document.querySelectorAll(".admin-nav a");
    for (var i = 0; i < links.length; i++) {
      var mod = PAGE_MODULE[(links[i].getAttribute("href") || "").toLowerCase()];
      if (mod && !perms[mod]) links[i].style.display = "none";
    }
    // sign-out link in the sidebar foot
    var foot = $(".sb-foot");
    if (foot && !document.getElementById("logoutLink")) {
      var lo = document.createElement("a");
      lo.id = "logoutLink"; lo.href = "#"; lo.textContent = "Sign out";
      lo.style.cssText = "display:inline-block;margin-top:8px;color:var(--amber)";
      lo.addEventListener("click", function (e) {
        e.preventDefault();
        fetch("/api/auth/logout", { method: "POST" }).then(function () { location.replace("admin-login.html"); }, function () { location.replace("admin-login.html"); });
      });
      foot.appendChild(lo);
    }
  }
  function enforceAuth() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;   // file:// — no API to authenticate against
    var file = currentFile();
    if (file === "admin-login.html") return;
    var mod = PAGE_MODULE[file];
    fetch("/api/auth/me").then(function (r) {
      if (r.status === 401 || r.status === 403) { location.replace("admin-login.html"); return null; }
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d || !d.user) return;                       // server error — leave page as-is
      var perms = d.user.permissions || {};
      if (mod && !perms[mod]) {                         // logged in but not allowed on this page
        if (perms.dashboard && file !== "admin-dashboard.html") { location.replace("admin-dashboard.html"); return; }
        var first = Object.keys(PAGE_MODULE).filter(function (f) { return perms[PAGE_MODULE[f]]; })[0];
        location.replace(first || "admin-login.html");
        return;
      }
      applyUser(d.user);
    }).catch(function () { /* server unreachable — leave page as-is */ });
  }

  ready(function () {
    enforceAuth();
    markActive(); setupSidebar();
    if (global.AdminStore && global.AdminStore.init) global.AdminStore.init().then(setModeBadge, setModeBadge);
  });

  global.AdminUI = { openDrawer: openDrawer, closeDrawer: closeDrawer, toast: toast };
})(window);
