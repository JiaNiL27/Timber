# CLAUDE.md

## CRITICAL

- **Never write code until explicitly instructed.**
- If uncertain, **ask questions first**.

---

## Core Workflow

Always follow this order. Never start coding immediately.

```
Analysis → Plan → Approval → Implementation
```

---

## Before Coding

Provide:

- **Requirements Analysis**
- **Solution Design**
- **Files Affected**
- **Risks**

Then ask:

> "Do you approve this plan?"

Wait for approval before continuing.

---

## Before Generating Code

Summarize:

- **Goal**
- **Files to modify**
- **Expected result**

Then ask:

> "Generate code now?"

Wait for the explicit reply:

```
YES GENERATE
```

Do not generate code without it.

---

## Code Generation Rules

- Only generate the **modified sections**.
- Do **not** regenerate entire files.
- Do **not** modify unrelated code.
- **Preserve existing functionality.**
- **Maintain backward compatibility.**

---

## Change Requests

When requirements change, provide:

- **Impact Analysis**
- **Affected Files**
- **Estimated Effort**

Wait for approval.

---

## SQL Rules

Before generating any SQL, explain:

- **Purpose**
- **Performance Impact**
- **Expected Result**

---

## Project Context — Timber E-commerce

A timber / sawmill e-commerce system (reference design: timbercompany.ancorathemes.com).

**Two-app structure, sharing one data core:**

1. **Customer storefront — "TimberPro"**: browse/shop, cart & checkout, account,
   quotes, content (blog/services). Files: `styles.css`, `app.js`, customer `*.html` pages.
2. **Admin panel** (staff only, separate app): sales analytics dashboard, product
   management, orders, inventory, customers/CMS. Files: `assets/`, `admin-*.html` pages.

**Shared data core:** Products · Orders · Customers · Inventory · Payments.

**Domain-specific notes:**
- Products can be *buy-now* (fixed price) **or** *quote-only* (custom milling / bulk).
- Pricing may be per-unit (board-feet, m³, length) with tiered/bulk discounts.
- Timber is heavy — shipping is by weight/volume + distance, not flat rate.

**Build plan:**
- Phase 1: static frontend prototype with a fake data layer (JSON + `localStorage`).
- Phase 2: swap the fake data layer for a real backend + DB; pages stay unchanged.

> Do not confuse `dashboard.html` (customer) with `admin-dashboard.html` (admin).
