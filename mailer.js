/* ============================================================
   mailer.js — TimberPro email (order notifications + test send).
   SMTP config is read from the admin Email Settings (DB `settings`
   table): host / port / user / secure / from. The SMTP PASSWORD is
   read from the environment only (SMTP_PASS) — secrets never live
   in the DB. Falls back to SMTP_* env vars, and if no host is set
   anywhere the message is "simulated" (logged) so the demo still
   works with no credentials.
   sendOrderStatusEmail() NEVER throws — a mail failure must not
   block (or roll back) the status update that triggered it.
   ============================================================ */
"use strict";

let nodemailer = null;
try { nodemailer = require("nodemailer"); } catch (e) { /* optional dependency */ }
let pool = null;
try { pool = require("./db"); } catch (e) { /* DB optional */ }

const ENV = {
  from: process.env.SMTP_FROM || "TimberPro <no-reply@timberpro.local>",
  host: process.env.SMTP_HOST || "",
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || ""
};

const LABELS = {
  pending: "Pending", confirmed: "Confirmed", processing: "Processing",
  ready: "Ready for Delivery", delivered: "Delivered", completed: "Completed", cancelled: "Cancelled",
  shipped: "Ready for Delivery"   // legacy fold
};

/* read the admin Email Settings row from the DB (host/port/user/secure/from/notify*) */
async function emailSettings() {
  if (!pool) return {};
  try {
    const [r] = await pool.query("SELECT data FROM settings WHERE section = 'email'");
    if (!r.length) return {};
    return typeof r[0].data === "string" ? JSON.parse(r[0].data) : r[0].data;
  } catch (e) { return {}; }
}

/* Build a transport from DB settings, falling back to env. Password ALWAYS from env. */
async function buildTransport() {
  if (!nodemailer) return null;
  const s = await emailSettings();
  const host = s.smtpHost || ENV.host;
  if (!host) return null;                                   // nothing configured -> simulate
  const port = parseInt(s.smtpPort, 10) || ENV.port;
  const user = s.smtpUser || ENV.user;
  const secure = (s.smtpSecure != null) ? !!s.smtpSecure : (port === 465);
  const from = (s.fromName && s.fromEmail) ? (s.fromName + " <" + s.fromEmail + ">") : (s.fromEmail || ENV.from);
  return {
    from: from,
    transport: nodemailer.createTransport({ host: host, port: port, secure: secure, auth: user ? { user: user, pass: ENV.pass } : undefined })
  };
}

function subjectFor(o) { return "Your TimberPro order " + o.orderNumber + " is now " + (LABELS[o.status] || o.status); }
function bodyFor(o) {
  var label = LABELS[o.status] || o.status;
  var lines = [
    "Hi " + (o.name || "there") + ",", "",
    "Your order " + o.orderNumber + " has been updated to: " + label + ".",
    o.estDelivery ? ("Estimated delivery: " + new Date(o.estDelivery).toDateString() + ".") : null, "",
    "You can track your order any time on our Track Order page using your",
    "order number (" + o.orderNumber + ") and this email address.", "", "— TimberPro"
  ];
  return lines.filter(function (l) { return l !== null; }).join("\n");
}

/* Generic send. Returns { sent, simulated }. Throws only on a real transport error. */
async function sendMail(opts) {
  if (!opts || !opts.to) return { sent: false, simulated: true };
  const t = await buildTransport();
  if (!t) { console.log("[mail:simulated] to=%s | %s", opts.to, opts.subject); return { sent: false, simulated: true }; }
  await t.transport.sendMail({ from: t.from, to: opts.to, subject: opts.subject, text: opts.text });
  console.log("[mail:sent] to=%s | %s", opts.to, opts.subject);
  return { sent: true, simulated: false };
}

async function sendTest(to) {
  return sendMail({
    to: to, subject: "TimberPro — test email",
    text: "This is a test email from your TimberPro admin Email Settings.\nIf you received it, your SMTP configuration works.\n\n— TimberPro"
  });
}

/* Returns true if a REAL email was sent, false if only logged/simulated. Never throws. */
async function sendOrderStatusEmail(o) {
  try {
    if (!o || !o.email) { console.log("[mail] skipped — no recipient for order", o && o.orderNumber); return false; }
    const t = await buildTransport();
    if (!t) { console.log("[mail:simulated] to=%s | %s", o.email, subjectFor(o)); return false; }
    await t.transport.sendMail({ from: t.from, to: o.email, subject: subjectFor(o), text: bodyFor(o) });
    console.log("[mail:sent] to=%s order=%s status=%s", o.email, o.orderNumber, o.status);
    return true;
  } catch (e) {
    console.error("[mail] send failed (order status still saved):", e.message);
    return false;
  }
}

module.exports = { sendOrderStatusEmail: sendOrderStatusEmail, sendMail: sendMail, sendTest: sendTest, emailSettings: emailSettings, LABELS: LABELS };
