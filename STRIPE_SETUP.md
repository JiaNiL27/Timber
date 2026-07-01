# Stripe payments (Phase 2)

The storefront runs as a static site **and** as a Node app. Real card charges only
work when you run the Node server (it holds the secret key and creates the charge).

## One-time setup

1. Install dependencies:
   ```
   npm install
   ```
2. Create your env file from the template and add your **secret** test key:
   ```
   cp .env.example .env
   ```
   Edit `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_xxxxxxxx
   ```
   Get keys at https://dashboard.stripe.com/test/apikeys
3. The **publishable** key (`pk_test_...`) is already set in `app.js` (`STRIPE_PK`) — that one is public and safe in the browser.

## Run

```
node server.js
```
Open http://localhost:4321 — the site and the payment API share this one origin.

## Test the card flow

On the checkout Payment step, use a Stripe test card:
- Card: `4242 4242 4242 4242`
- Expiry: any future date · CVC: any 3 digits · Postcode: any

A real **test-mode** PaymentIntent is created and confirmed. See it in
Dashboard → Payments.

## How it works

- `POST /api/create-payment-intent` — recomputes the amount **from the catalog**
  (never trusts the browser), creates a PaymentIntent, returns its `clientSecret`.
- The browser confirms with `stripe.confirmCardPayment(clientSecret, { card })`.
- `POST /api/stripe-webhook` — (optional) set `STRIPE_WEBHOOK_SECRET` to verify
  events and mark orders paid authoritatively.

## Without the backend

If you open the site via the plain static server (`npx serve`) or `file://`,
there's no `/api`, so the checkout falls back to **client-side validation only**
(no real charge) — handy for demos.

## Security

- **Never** put the secret key (`sk_...`) in any frontend file or commit it.
- `.env` is git-ignored. Roll a key immediately if it's ever exposed.
