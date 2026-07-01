/* ============================================================
   auth.js — TimberPro staff authentication (sessions + bcrypt).
   Mounted at /api/auth by server.js. Also exports middleware
   (requireAuth / requirePermission) used by admin-api.js.
   Staff = a users row with role_id set (or legacy role='admin').
   ============================================================ */
"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("./db");
const router = express.Router();

/* resolve a role's permission map (module -> bool) from the DB */
async function rolePermissions(roleId) {
  if (!roleId) return {};
  const [r] = await pool.query("SELECT permissions FROM roles WHERE id = ?", [roleId]);
  if (!r.length) return {};
  return typeof r[0].permissions === "string" ? JSON.parse(r[0].permissions) : r[0].permissions;
}

/* shape the session user for the client (incl. live permissions + role name) */
async function publicUser(s) {
  const perms = await rolePermissions(s.roleId);
  const [r] = await pool.query("SELECT name FROM roles WHERE id = ?", [s.roleId]);
  return { id: s.id, name: s.name, email: s.email, roleId: s.roleId, roleName: r.length ? r[0].name : s.roleId, permissions: perms };
}

/* POST /api/auth/login  { email, password } */
router.post("/login", async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim();
  const password = String(b.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  try {
    const [rows] = await pool.query("SELECT id, name, email, password, role, role_id, status FROM users WHERE email = ?", [email]);
    const u = rows[0];
    if (!u || !u.password) return res.status(401).json({ error: "Invalid email or password." });
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(401).json({ error: "Invalid email or password." });
    const roleId = u.role_id || (u.role === "admin" ? "admin" : null);
    if (!roleId) return res.status(403).json({ error: "This account is not a staff account." });
    if (u.status === 0) return res.status(403).json({ error: "This account is disabled." });
    req.session.user = { id: u.id, name: u.name, email: u.email, roleId: roleId };
    res.json({ user: await publicUser(req.session.user) });
  } catch (e) { console.error("[auth] login:", e.message); res.status(500).json({ error: "Login failed." }); }
});

/* POST /api/auth/logout */
router.post("/logout", (req, res) => {
  if (req.session) req.session.destroy(function () { res.clearCookie("connect.sid"); res.json({ ok: true }); });
  else res.json({ ok: true });
});

/* GET /api/auth/me — current staff user or 401 */
router.get("/me", async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: "Not signed in." });
  try { res.json({ user: await publicUser(req.session.user) }); }
  catch (e) { console.error("[auth] me:", e.message); res.status(500).json({ error: "Lookup failed." }); }
});

/* ---------- middleware for admin-api.js ---------- */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: "Authentication required." });
}
function requirePermission(module) {
  return async function (req, res, next) {
    if (!req.session || !req.session.user) return res.status(401).json({ error: "Authentication required." });
    try {
      const perms = await rolePermissions(req.session.user.roleId);
      if (perms && perms[module]) return next();
      res.status(403).json({ error: "You don't have access to the " + module + " module." });
    } catch (e) { console.error("[auth] perm:", e.message); res.status(500).json({ error: "Permission check failed." }); }
  };
}

module.exports = { router: router, requireAuth: requireAuth, requirePermission: requirePermission };
