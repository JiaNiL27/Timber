---
name: timber-database
description: 当用户要设计或讨论 timber 项目的数据库、表结构、SQL、数据关系时触发。包含完整的 MySQL 建表方案。
---

# Timber Ecommerce — 数据库设计

## 数据库名
`timber_db`

## 表结构总览
```
users           ← 客户账号
categories      ← 木材分类（原木/板材/加工木等）
products        ← 商品
product_images  ← 商品多张图片
inventory_logs  ← 库存变动记录
orders          ← 订单
order_items     ← 订单明细
payments        ← 付款记录
page_views      ← 访问量追踪（Admin Dashboard 用）
```

## 完整建表 SQL

```sql
CREATE DATABASE timber_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE timber_db;

-- 用户表
CREATE TABLE users (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  phone        VARCHAR(20),
  address      TEXT,
  role         ENUM('customer','admin') DEFAULT 'customer',
  status       TINYINT(1) DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 木材分类
CREATE TABLE categories (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  slug         VARCHAR(100) NOT NULL UNIQUE,
  description  TEXT,
  status       TINYINT(1) DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 商品表
CREATE TABLE products (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id  INT UNSIGNED,
  name         VARCHAR(255) NOT NULL,
  slug         VARCHAR(255) NOT NULL UNIQUE,
  description  TEXT,
  price        DECIMAL(10,2) NOT NULL,
  unit         VARCHAR(50) DEFAULT 'pcs',   -- pcs / m / m² / kg
  stock        INT UNSIGNED DEFAULT 0,
  min_stock    INT UNSIGNED DEFAULT 10,      -- 低库存警示线
  image        VARCHAR(500),                 -- 主图
  status       ENUM('active','inactive') DEFAULT 'active',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category_id),
  INDEX idx_status (status),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 商品多图
CREATE TABLE product_images (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id   INT UNSIGNED NOT NULL,
  image        VARCHAR(500) NOT NULL,
  sort_order   INT DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 库存变动记录
CREATE TABLE inventory_logs (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id   INT UNSIGNED NOT NULL,
  change       INT NOT NULL,               -- 正数=入库，负数=出库
  reason       VARCHAR(255),               -- 'order' / 'manual' / 'return'
  ref_id       INT UNSIGNED,               -- 关联 order_id（如有）
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 订单表
CREATE TABLE orders (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  total          DECIMAL(10,2) NOT NULL,
  status         ENUM('pending','confirmed','shipped','delivered','cancelled') DEFAULT 'pending',
  shipping_name  VARCHAR(100),
  shipping_phone VARCHAR(20),
  shipping_addr  TEXT,
  notes          TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 订单明细
CREATE TABLE order_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id     INT UNSIGNED NOT NULL,
  product_id   INT UNSIGNED NOT NULL,
  product_name VARCHAR(255) NOT NULL,      -- 下单时快照
  price        DECIMAL(10,2) NOT NULL,     -- 下单时价格快照
  quantity     INT UNSIGNED NOT NULL,
  subtotal     DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 付款记录
CREATE TABLE payments (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       INT UNSIGNED NOT NULL,
  method         ENUM('stripe','paypal','bank_transfer') NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  transaction_id VARCHAR(255),             -- 第三方交易 ID
  status         ENUM('pending','success','failed') DEFAULT 'pending',
  paid_at        DATETIME,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 页面访问量（Admin Dashboard 用）
CREATE TABLE page_views (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  page         VARCHAR(255) NOT NULL,
  user_id      INT UNSIGNED,               -- 可空（未登录访客）
  ip           VARCHAR(45),
  viewed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_page (page),
  INDEX idx_date (viewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 表关系图
```
users ──< orders ──< order_items >── products >── categories
                 └── payments       └── product_images
                                    └── inventory_logs
users ──< page_views
```

## 常用查询

### 销售趋势（按月）
```sql
SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
       COUNT(*) AS total_orders,
       SUM(total) AS revenue
FROM orders
WHERE status != 'cancelled'
GROUP BY month
ORDER BY month DESC
LIMIT 12;
```

### 热销商品
```sql
SELECT p.name, SUM(oi.quantity) AS sold
FROM order_items oi
JOIN products p ON oi.product_id = p.id
GROUP BY p.id
ORDER BY sold DESC
LIMIT 10;
```

### 低库存商品
```sql
SELECT id, name, stock, min_stock
FROM products
WHERE stock <= min_stock AND status = 'active'
ORDER BY stock ASC;
```
