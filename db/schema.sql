-- ============================================================
--  timber_db — full schema (MySQL 8 / InnoDB / utf8mb4)
--  Run top-to-bottom. Parents created before children (FKs).
--  Backs the TimberPro storefront: accounts, catalog, ordering,
--  engagement (reviews/wishlist/quotes), CMS projects, analytics.
-- ============================================================

CREATE DATABASE IF NOT EXISTS timber_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE timber_db;

-- ---------- Accounts ----------
CREATE TABLE users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,          -- bcrypt/argon2 hash, never plaintext
  phone       VARCHAR(20),
  address     TEXT,
  role        ENUM('customer','admin') DEFAULT 'customer',
  role_id     VARCHAR(32) NULL,               -- staff role (FK roles.id); NULL for customers
  status      TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Catalog ----------
CREATE TABLE categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  status      TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id   INT UNSIGNED,
  sku           VARCHAR(50) UNIQUE,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) NOT NULL UNIQUE,     -- maps to the app's string id (e.g. oak-board-001)
  species       VARCHAR(100),
  grade         VARCHAR(100),
  type          ENUM('buy-now','quote-only') DEFAULT 'buy-now',
  short_desc    VARCHAR(500),
  description   TEXT,
  price         DECIMAL(10,2),                    -- nullable for quote-only
  unit          VARCHAR(50) DEFAULT 'pcs',        -- board / length / m2 ...
  stock         INT UNSIGNED DEFAULT 0,
  min_stock     INT UNSIGNED DEFAULT 10,          -- low-stock warning line
  rating        DECIMAL(2,1) DEFAULT 0,           -- cached average
  length_mm     INT UNSIGNED,
  width_mm      INT UNSIGNED,
  thickness_mm  INT UNSIGNED,
  image         VARCHAR(500),
  status        ENUM('active','inactive') DEFAULT 'active',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_category (category_id),
  INDEX idx_products_status (status),
  INDEX idx_products_type (type),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_images (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED NOT NULL,
  image       VARCHAR(500) NOT NULL,
  sort_order  INT DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_bulk_tiers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED NOT NULL,
  min_qty     INT UNSIGNED NOT NULL,
  price       DECIMAL(10,2) NOT NULL,
  UNIQUE KEY uq_tier (product_id, min_qty),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_finishes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED NOT NULL,
  finish      VARCHAR(120) NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tags (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(80) NOT NULL UNIQUE,
  slug  VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_tags (
  product_id  INT UNSIGNED NOT NULL,
  tag_id      INT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id, tag_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)     REFERENCES tags(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED NOT NULL,
  qty_change  INT NOT NULL,                  -- + = stock in, - = stock out
  reason      VARCHAR(255),                  -- 'order' / manual reason (e.g. 'Damaged Goods')
  ref_id      INT UNSIGNED,                  -- related order id (if any)
  reference   VARCHAR(120),                  -- free-text reference (PO no., order ref, etc.)
  supplier    VARCHAR(160),                  -- stock-in supplier (optional)
  note        VARCHAR(255),                  -- remarks
  created_by  VARCHAR(120) DEFAULT 'Admin',  -- who recorded it (no auth yet)
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inv_product (product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Migration for an EXISTING timber_db (additive, non-destructive — run once):
--   ALTER TABLE inventory_logs
--     ADD COLUMN reference VARCHAR(120) NULL,
--     ADD COLUMN supplier  VARCHAR(160) NULL,
--     ADD COLUMN note      VARCHAR(255) NULL,
--     ADD COLUMN created_by VARCHAR(120) NULL DEFAULT 'Admin';

-- ---------- Ordering ----------
CREATE TABLE orders (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number     VARCHAR(40) NOT NULL UNIQUE,   -- maps to the app's ORD… reference
  user_id          INT UNSIGNED,                  -- nullable: guest checkout
  total            DECIMAL(10,2) NOT NULL,
  status           ENUM('pending','confirmed','processing','ready','delivered','completed','cancelled','shipped') DEFAULT 'pending',
  delivery_method  ENUM('delivery','collect') DEFAULT 'delivery',
  delivery_status  ENUM('pending','preparing','shipped','delivered') DEFAULT 'pending',
  est_delivery     DATE,                          -- optional estimated delivery date
  ship_name        VARCHAR(120),
  ship_company     VARCHAR(150),
  ship_email       VARCHAR(255),
  ship_phone       VARCHAR(30),
  ship_address     TEXT,
  ship_city        VARCHAR(100),
  ship_postcode    VARCHAR(20),
  ship_state       VARCHAR(100),
  ship_country     VARCHAR(100),
  notes            TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_user (user_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id      INT UNSIGNED NOT NULL,
  product_id    INT UNSIGNED,                 -- SET NULL if product later deleted (snapshot kept)
  product_name  VARCHAR(255) NOT NULL,        -- snapshot at purchase time
  unit_price    DECIMAL(10,2) NOT NULL,       -- snapshot
  quantity      INT UNSIGNED NOT NULL,
  subtotal      DECIMAL(10,2) NOT NULL,
  INDEX idx_oi_order (order_id),
  INDEX idx_oi_product (product_id),
  FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payments (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       INT UNSIGNED NOT NULL,
  method         ENUM('stripe','card','cod','bank_transfer','paypal') NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  transaction_id VARCHAR(255),                -- gateway id (e.g. Stripe PaymentIntent)
  status         ENUM('pending','success','failed','refunded') DEFAULT 'pending',
  paid_at        DATETIME,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pay_order (order_id),
  INDEX idx_pay_status (status),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Order timeline: one row per status change (drives the progress timeline
-- on the admin Order Detail page and the public Track Order page).
CREATE TABLE order_status_history (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  status      VARCHAR(40) NOT NULL,           -- pending/confirmed/processing/ready/delivered/completed/cancelled
  note        VARCHAR(500),                   -- optional admin note for this step
  notified    TINYINT(1) NOT NULL DEFAULT 0,  -- 1 once a customer email was sent for this step
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_osh_order (order_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Engagement ----------
CREATE TABLE reviews (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id   INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED,                  -- nullable: guest review
  author_name  VARCHAR(120),
  rating       TINYINT UNSIGNED NOT NULL,     -- 1..5
  comment      TEXT,
  status       ENUM('published','pending','hidden') DEFAULT 'published',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reviews_product (product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE wishlists (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wish (user_id, product_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE quotes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED,                   -- nullable: general quote
  user_id     INT UNSIGNED,                   -- nullable: guest
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  phone       VARCHAR(30),
  company     VARCHAR(150),
  quantity    INT UNSIGNED,
  dimensions  VARCHAR(255),
  message     TEXT,
  status      ENUM('new','quoted','closed') DEFAULT 'new',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_quotes_status (status),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Content (CMS) ----------
CREATE TABLE projects (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(150) NOT NULL UNIQUE,
  title       VARCHAR(200) NOT NULL,
  client      VARCHAR(150),
  year        VARCHAR(10),
  location    VARCHAR(150),
  category    VARCHAR(120),
  image       VARCHAR(500),
  summary     VARCHAR(500),
  body        TEXT,
  services    TEXT,                           -- comma-separated / JSON list
  status      ENUM('published','draft') DEFAULT 'published',
  sort_order  INT DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE project_images (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  INT UNSIGNED NOT NULL,
  image       VARCHAR(500) NOT NULL,
  sort_order  INT DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Analytics / Misc ----------
CREATE TABLE page_views (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  page       VARCHAR(255) NOT NULL,
  user_id    INT UNSIGNED,                    -- nullable: anonymous visitor
  ip         VARCHAR(45),
  viewed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pv_page (page),
  INDEX idx_pv_date (viewed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE contact_messages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  company     VARCHAR(150),
  phone       VARCHAR(30),
  email       VARCHAR(255) NOT NULL,
  topic       VARCHAR(120),
  message     TEXT NOT NULL,
  status      ENUM('new','read','replied') DEFAULT 'new',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Settings (admin-managed: company / email / system) ----------
-- One JSON document per section. Seeded by db/seed.sql or db/migrate-settings.js.
CREATE TABLE IF NOT EXISTS settings (
  section     VARCHAR(32) PRIMARY KEY,        -- 'company' | 'email' | 'system'
  data        JSON NOT NULL,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Roles (staff access control) ----------
-- permissions = JSON map of module -> bool. Seeded by db/seed.sql or db/migrate-auth.js.
CREATE TABLE IF NOT EXISTS roles (
  id           VARCHAR(32) PRIMARY KEY,        -- 'admin' | 'manager' | 'staff' | custom slug
  name         VARCHAR(80) NOT NULL,
  description  VARCHAR(255),
  permissions  JSON NOT NULL,
  is_system    TINYINT(1) DEFAULT 0,           -- system roles can't be deleted
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- link staff users to a role (added after both tables exist)
ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
