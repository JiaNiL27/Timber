/* ============================================================
   server.js — TimberPro Phase-2 backend
   Serves the static site AND the Stripe payment API on one origin.

   Run:
     1. npm install
     2. copy .env.example -> .env  and set STRIPE_SECRET_KEY
     3. node server.js   (then open http://localhost:4321)

   The SECRET key is read from the environment only — never hard-code it.
   ============================================================ */
"use strict";

try { require("dotenv").config(); } catch (e) { /* dotenv optional — env vars may be set by the shell */ }
const fs = require("fs");
const path = require("path");
const express = require("express");

const PORT = process.env.PORT || 4321;
const SECRET = process.env.STRIPE_SECRET_KEY || "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

if (!SECRET) {
  console.warn("[stripe] STRIPE_SECRET_KEY is not set — /api/create-payment-intent will return 503. " +
    "The storefront still runs; the checkout falls back to its client-side demo.");
}
const stripe = SECRET ? require("stripe")(SECRET) : null;

const app = express();

/* ---------- catalog (read the embedded products.js, server-side pricing) ---------- */
function loadCatalog() {
  var raw = fs.readFileSync(path.join(__dirname, "data", "products.js"), "utf8");
  var start = raw.indexOf("{");
  var end = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(start, end + 1));
}
// Mirror store.js unitPrice(): apply the best bulk tier for the quantity.
function unitPrice(p, qty) {
  var price = p.price;
  (p.bulkTiers || []).forEach(function (t) { if (qty >= t.minQty) price = t.price; });
  return price;
}

/* ---------- Stripe webhook (raw body, must come before express.json) ---------- */
app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), function (req, res) {
  if (!stripe) return res.status(503).end();
  let event = req.body;
  if (WEBHOOK_SECRET) {
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], WEBHOOK_SECRET);
    } catch (err) {
      console.error("[stripe] webhook signature failed:", err.message);
      return res.status(400).send("Webhook Error: " + err.message);
    }
  }
  if (event.type === "payment_intent.succeeded") {
    // Authoritative: mark the order paid in your DB here (Phase 2 persistence).
    console.log("[stripe] payment succeeded:", event.data.object.id);
  }
  res.json({ received: true });
});

app.use(express.json());

/* ---------- staff sessions (admin auth) ---------- */
const session = require("express-session");
app.use(session({
  secret: process.env.SESSION_SECRET || "timber-dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 }   // 8 hours
}));

/* ---------- auth API (login / logout / me) ---------- */
app.use("/api/auth", require("./auth").router);

/* ---------- data API (timber_db): catalog, orders, quotes, contact ---------- */
app.use("/api", require("./api"));

/* ---------- admin API (timber_db): product CRUD + image upload (auth-gated) ---------- */
app.use("/api/admin", require("./admin-api"));

/* ---------- create a PaymentIntent (amount computed from the catalog, never the client) ---------- */
app.post("/api/create-payment-intent", async function (req, res) {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured on the server." });
  try {
    var catalog = loadCatalog();
    var byId = {};
    catalog.products.forEach(function (p) { byId[p.id] = p; });

    var items = (req.body && req.body.items) || [];
    var amount = 0;                                  // in the currency's smallest unit (cents)
    items.forEach(function (i) {
      var p = byId[i.id];
      var qty = Math.max(1, parseInt(i.qty, 10) || 1);
      if (p && p.type !== "quote-only" && typeof p.price === "number") {
        amount += Math.round(unitPrice(p, qty) * qty * 100);
      }
    });
    if (amount <= 0) return res.status(400).json({ error: "Cart is empty or not payable." });

    var intent = await stripe.paymentIntents.create({
      amount: amount,
      currency: (catalog.currency || "usd").toLowerCase(),
      automatic_payment_methods: { enabled: true }
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error("[stripe] create-payment-intent:", err.message);
    res.status(500).json({ error: "Could not start payment." });
  }
});

/* ---------- static site (same origin as the API) ---------- */
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, function () {
  console.log("TimberPro running at http://localhost:" + PORT);
});
