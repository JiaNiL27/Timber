-- ============================================================
--  timber_db — sample seed data (run after schema.sql)
--  Mirrors a slice of the live demo (products.js / projects.js).
-- ============================================================
USE timber_db;

-- ---------- users ----------
INSERT INTO users (id, name, email, password, phone, role) VALUES
  (1, 'Site Admin', 'admin@timberpro.my', '$2y$10$REPLACE_WITH_HASH', '+60 3-2181 4400', 'admin'),
  (2, 'Jonny Tan',  'jonny@example.com',   '$2y$10$REPLACE_WITH_HASH', '+60 12-345 6789', 'customer');

-- ---------- categories ----------
INSERT INTO categories (id, name, slug) VALUES
  (1, 'Lumber & Boards',  'lumber'),
  (2, 'Flooring',         'flooring'),
  (3, 'Cladding & Decking','cladding'),
  (4, 'Beams & Posts',    'beams'),
  (5, 'Live-Edge Slabs',  'slabs');

-- ---------- products ----------
INSERT INTO products
  (id, category_id, sku, name, slug, species, grade, type, short_desc, description, price, unit, stock, rating, length_mm, width_mm, thickness_mm, image) VALUES
  (1, 1, 'TMB-OAK-001', 'European Oak Board', 'oak-board-001', 'Oak', 'A / Prime', 'buy-now',
     'Kiln-dried prime oak board, ready to cut.',
     'Premium kiln-dried European oak, planed all round. Ideal for furniture, joinery and shelving. Moisture content 8-10%.',
     89.00, 'board', 240, 4.7, 2400, 200, 27, 'assets/img/products/oak-board.jpg'),
  (2, 1, 'TMB-PIN-002', 'Construction Pine Stud', 'pine-stud-002', 'Pine', 'C16 Structural', 'buy-now',
     'Strong, lightweight C16 stud for framing.',
     'Kiln-dried C16 structural pine, eased edges. Perfect for stud walls and framing.',
     7.50, 'length', 1200, 4.4, 2400, 95, 45, 'assets/img/products/pine-stud.jpg'),
  (6, 4, 'TMB-GLU-006', 'Glulam Structural Beam', 'glulam-beam-006', 'Spruce', 'GL24h', 'quote-only',
     'Engineered glulam beam, made to span.',
     'Glued-laminated structural beam cut to your span and load. Priced per project.',
     NULL, 'beam', 0, 4.9, NULL, NULL, NULL, 'assets/img/products/glulam-beam.jpg');

-- ---------- bulk tiers (oak) ----------
INSERT INTO product_bulk_tiers (product_id, min_qty, price) VALUES
  (1, 10, 82.00), (1, 25, 76.00), (1, 50, 69.00);

-- ---------- finishes (oak) ----------
INSERT INTO product_finishes (product_id, finish) VALUES
  (1, 'Planed all round'), (1, 'Rough sawn');

-- ---------- tags ----------
INSERT INTO tags (id, name, slug) VALUES
  (1, 'oak', 'oak'), (2, 'pine', 'pine'), (3, 'interior', 'interior'), (4, 'structural', 'structural');
INSERT INTO product_tags (product_id, tag_id) VALUES
  (1, 1), (1, 3), (2, 2), (2, 4);

-- ---------- projects (services case studies) ----------
INSERT INTO projects (id, slug, title, client, year, location, category, image, summary, services, sort_order) VALUES
  (1, 'quality-logging', 'Quality Logging', 'Samwill', '2025', 'Sibu, Sarawak', 'Logging & harvesting',
     'img/service-image1-890x664.jpg', 'Selective harvesting of premium hardwood, milled and graded for furniture-quality stock.',
     'Selective harvesting, On-site milling, Moisture grading', 1),
  (2, 'home-construction', 'Home Construction', 'Samwill', '2024', 'Kuching, Sarawak', 'Structural supply',
     'img/service-image2-890x664.jpg', 'Structural timber and cladding supplied to spec for a low-impact residential build.',
     'Structural beams, Cladding & decking, Cut-to-length delivery', 2),
  (3, 'timber-purchase', 'Timber Purchase', 'Samwill', '2024', 'Bintulu, Sarawak', 'Bulk supply',
     'img/service-image3-890x664.jpg', 'Bulk timber sourcing at fair market rates, graded and ready for resale.',
     'Bulk sourcing, Quality grading, Logistics', 3);

-- ---------- a sample order (Jonny: 2 oak + 3 pine, paid by card) ----------
INSERT INTO orders
  (id, order_number, user_id, total, status, delivery_method, ship_name, ship_email, ship_phone, ship_address, ship_city, ship_postcode, ship_state, ship_country)
VALUES
  (1, 'ORD1782260152264', 2, 200.50, 'confirmed', 'delivery',
   'Jonny Tan', 'jonny@example.com', '+60 12-345 6789', '12 Mill Road', 'Sibu', '96000', 'Sarawak', 'Malaysia');

INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal) VALUES
  (1, 1, 'European Oak Board',    89.00, 2, 178.00),
  (1, 2, 'Construction Pine Stud', 7.50, 3,  22.50);

INSERT INTO payments (order_id, method, amount, transaction_id, status, paid_at) VALUES
  (1, 'card', 200.50, 'pi_demo_123456', 'success', CURRENT_TIMESTAMP);

-- keep stock in sync with the sample order
INSERT INTO inventory_logs (product_id, qty_change, reason, ref_id) VALUES
  (1, -2, 'order', 1), (2, -3, 'order', 1);

-- sample manual stock movements (restocks / adjustments) for the Inventory module
INSERT INTO inventory_logs (product_id, qty_change, reason, reference, supplier, note, created_by) VALUES
  (1, 120, 'restock',           'PO-2041', 'Baltic Timber Co.', 'Quarterly oak delivery',        'Sawmill Admin'),
  (2, 400, 'restock',           'PO-2042', 'Highland Forestry',  'Bulk pine intake',              'Sawmill Admin'),
  (3, -6,  'Damaged Goods',     'ADJ-118', NULL,                 'Water damage on 6 m²',          'Sawmill Admin'),
  (7, 25,  'restock',           'PO-2050', 'Greenheart Mills',   'Green oak posts',               'Sawmill Admin'),
  (9, -12, 'Stock Adjustment',  'ADJ-121', NULL,                 'Stock count correction',        'Sawmill Admin');

-- ---------- settings (company / email / system) ----------
-- INSERT IGNORE: never overwrites a section that already exists.
INSERT IGNORE INTO settings (section, data) VALUES
  ('company', '{"name":"TimberPro","legalName":"TimberPro Sawmill Co.","email":"hello@timberpro.example","phone":"1-800-458-5697","hours":"Mon–Fri, 8am–6pm","address":"120 Mill Road","city":"Portland","postcode":"97201","country":"United States","currency":"USD","taxId":"","taxRate":0}'),
  ('email',   '{"fromName":"TimberPro","fromEmail":"orders@timberpro.example","smtpHost":"","smtpPort":587,"smtpUser":"","smtpSecure":true,"notifyOrders":true,"notifyQuotes":true}'),
  ('system',  '{"dateFormat":"DD MMM YYYY","timezone":"America/Los_Angeles","currency":"USD","lowStockThreshold":50,"itemsPerPage":20,"theme":"light","maintenanceMode":false}');

-- ---------- roles (staff access control) ----------
INSERT IGNORE INTO roles (id, name, description, permissions, is_system) VALUES
  ('admin',   'Administrator', 'Full access to every module.',            '{"dashboard":true,"products":true,"inventory":true,"orders":true,"quotes":true,"customers":true,"analytics":true,"settings":true}',  1),
  ('manager', 'Manager',       'Operations, but no settings or users.',   '{"dashboard":true,"products":true,"inventory":true,"orders":true,"quotes":true,"customers":true,"analytics":true,"settings":false}', 0),
  ('staff',   'Staff',         'Day-to-day orders, products, inventory.', '{"dashboard":true,"products":true,"inventory":true,"orders":true,"quotes":true,"customers":false,"analytics":false,"settings":false}', 0);

-- link the seeded admin user to the admin role
UPDATE users SET role_id = 'admin' WHERE role = 'admin';

-- a working admin login (email: admin@timberpro.example, password: admin1234 — change after first login)
INSERT IGNORE INTO users (name, email, password, role, role_id, status) VALUES
  ('Sawmill Admin', 'admin@timberpro.example', '$2b$10$JcPG97wyoDlbHWcmfRt0YetYCvGKmtisIJegt2XQ00NfdCSjQxzwS', 'admin', 'admin', 1);
