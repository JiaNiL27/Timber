// /* ============================================================
//    data/products.js — canonical catalog (embedded)
//    Single source of truth for Phase 1. Loaded via <script> so the
//    site runs from file:// (where fetch() is blocked) and from a
//    server alike. store.js reads window.__TIMBER_DATA__.
//    ============================================================ */
// window.__TIMBER_DATA__ = {
//   "currency": "USD",
//   "categories": [
//     { "id": "lumber",    "name": "Lumber & Boards" },
//     { "id": "flooring",  "name": "Flooring" },
//     { "id": "cladding",  "name": "Cladding & Decking" },
//     { "id": "beams",     "name": "Beams & Posts" },
//     { "id": "slabs",     "name": "Live-Edge Slabs" }
//   ],
//   "tags": [
//     "oak", "pine", "larch", "birch", "walnut", "cedar",
//     "structural", "interior", "exterior", "composite"
//   ],
//   "products": [
//     {
//       "id": "oak-board-001",
//       "name": "European Oak Board",
//       "sku": "TMB-OAK-001",
//       "category": "lumber",
//       "species": "Oak",
//       "grade": "A / Prime",
//       "type": "buy-now",
//       "unit": "board",
//       "price": 89.0,
//       "stock": 240,
//       "rating": 4.7,
//       "tags": ["oak", "interior"],
//       "finishes": ["Planed all round", "Rough sawn"],
//       "image": "assets/img/products/oak-board.jpg",
//       "short": "Kiln-dried prime oak board, ready to cut.",
//       "description": "Premium kiln-dried European oak, planed all round. Ideal for furniture, joinery and shelving. Moisture content 8-10%.",
//       "dimensions": { "length_mm": 2400, "width_mm": 200, "thickness_mm": 27 },
//       "bulkTiers": [
//         { "minQty": 10, "price": 82.0 },
//         { "minQty": 25, "price": 76.0 },
//         { "minQty": 50, "price": 69.0 }
//       ]
//     },
//     {
//       "id": "pine-stud-002",
//       "name": "Construction Pine Stud",
//       "sku": "TMB-PIN-002",
//       "category": "lumber",
//       "species": "Pine",
//       "grade": "C16 Structural",
//       "type": "buy-now",
//       "unit": "length",
//       "price": 7.5,
//       "stock": 1200,
//       "rating": 4.3,
//       "tags": ["pine", "structural"],
//       "finishes": ["Treated", "Untreated"],
//       "image": "assets/img/products/pine-stud.jpg",
//       "short": "C16 graded structural softwood.",
//       "description": "Strength-graded C16 pine for framing and studwork. Regularised and treated for indoor use.",
//       "dimensions": { "length_mm": 3000, "width_mm": 89, "thickness_mm": 38 },
//       "bulkTiers": [
//         { "minQty": 50, "price": 6.8 },
//         { "minQty": 100, "price": 6.2 },
//         { "minQty": 250, "price": 5.6 }
//       ]
//     },
//     {
//       "id": "oak-floor-003",
//       "name": "Engineered Oak Flooring",
//       "sku": "TMB-FLR-003",
//       "category": "flooring",
//       "species": "Oak",
//       "grade": "Rustic",
//       "type": "buy-now",
//       "unit": "m2",
//       "price": 42.0,
//       "stock": 860,
//       "rating": 4.8,
//       "tags": ["oak", "interior"],
//       "finishes": ["Brushed & oiled", "Lacquered"],
//       "image": "assets/img/products/oak-flooring.jpg",
//       "short": "Brushed & oiled engineered oak, per m².",
//       "description": "14mm engineered oak flooring with a 3mm wear layer, brushed and oiled finish. Suitable for underfloor heating.",
//       "dimensions": { "length_mm": 1900, "width_mm": 190, "thickness_mm": 14 },
//       "bulkTiers": [
//         { "minQty": 20, "price": 39.0 },
//         { "minQty": 60, "price": 35.5 }
//       ]
//     },
//     {
//       "id": "larch-clad-004",
//       "name": "Siberian Larch Cladding",
//       "sku": "TMB-LAR-004",
//       "category": "cladding",
//       "species": "Larch",
//       "grade": "A Grade",
//       "type": "buy-now",
//       "unit": "m2",
//       "price": 38.0,
//       "stock": 520,
//       "rating": 4.5,
//       "tags": ["larch", "exterior"],
//       "finishes": ["Natural", "Pre-weathered grey"],
//       "image": "assets/img/products/larch-cladding.jpg",
//       "short": "Durable external cladding, per m².",
//       "description": "Naturally durable Siberian larch cladding, profiled for external use. Ages to a silver-grey patina.",
//       "dimensions": { "length_mm": 4000, "width_mm": 145, "thickness_mm": 20 },
//       "bulkTiers": [
//         { "minQty": 30, "price": 35.0 },
//         { "minQty": 80, "price": 31.5 }
//       ]
//     },
//     {
//       "id": "composite-deck-005",
//       "name": "Composite Decking Board",
//       "sku": "TMB-CMP-005",
//       "category": "cladding",
//       "species": "WPC Composite",
//       "grade": "Premium",
//       "type": "buy-now",
//       "unit": "length",
//       "price": 28.0,
//       "stock": 430,
//       "rating": 4.2,
//       "tags": ["composite", "exterior"],
//       "finishes": ["Teak", "Charcoal", "Stone grey"],
//       "image": "assets/img/products/composite-deck.jpg",
//       "short": "Low-maintenance composite decking.",
//       "description": "Wood-plastic composite decking board, reversible grain/grooved faces. Slip-resistant and rot-proof.",
//       "dimensions": { "length_mm": 3600, "width_mm": 146, "thickness_mm": 25 },
//       "bulkTiers": [
//         { "minQty": 20, "price": 25.5 },
//         { "minQty": 50, "price": 23.0 }
//       ]
//     },
//     {
//       "id": "glulam-beam-006",
//       "name": "Glulam Structural Beam",
//       "sku": "TMB-GLM-006",
//       "category": "beams",
//       "species": "Spruce Glulam",
//       "grade": "GL24h",
//       "type": "quote-only",
//       "unit": "beam",
//       "price": null,
//       "stock": 0,
//       "rating": 4.9,
//       "tags": ["structural"],
//       "finishes": ["Planed", "Industrial"],
//       "image": "assets/img/products/glulam-beam.jpg",
//       "short": "Made-to-order engineered beam — request a quote.",
//       "description": "GL24h glued-laminated structural beam, cut to your span and load specification. Priced per project.",
//       "dimensions": { "length_mm": null, "width_mm": 90, "thickness_mm": 200 },
//       "bulkTiers": []
//     },
//     {
//       "id": "oak-post-007",
//       "name": "Green Oak Post",
//       "sku": "TMB-OKP-007",
//       "category": "beams",
//       "species": "Oak",
//       "grade": "Structural",
//       "type": "buy-now",
//       "unit": "post",
//       "price": 145.0,
//       "stock": 75,
//       "rating": 4.6,
//       "tags": ["oak", "structural", "exterior"],
//       "finishes": ["Sawn"],
//       "image": "assets/img/products/oak-post.jpg",
//       "short": "Solid green oak post for frames & pergolas.",
//       "description": "Fresh-sawn green oak post, characterful and structural. Air-dries on site. Popular for oak-framed buildings and pergolas.",
//       "dimensions": { "length_mm": 2400, "width_mm": 150, "thickness_mm": 150 },
//       "bulkTiers": [
//         { "minQty": 5, "price": 135.0 },
//         { "minQty": 15, "price": 122.0 }
//       ]
//     },
//     {
//       "id": "walnut-slab-008",
//       "name": "Live-Edge Walnut Slab",
//       "sku": "TMB-WAL-008",
//       "category": "slabs",
//       "species": "Walnut",
//       "grade": "Premium Character",
//       "type": "quote-only",
//       "unit": "slab",
//       "price": null,
//       "stock": 6,
//       "rating": 5.0,
//       "tags": ["walnut", "interior"],
//       "finishes": ["Sanded", "Oiled"],
//       "image": "assets/img/products/walnut-slab.jpg",
//       "short": "One-off character slab — request a quote.",
//       "description": "Kiln-dried live-edge American black walnut slab. Each piece is unique; dimensions and price quoted per slab.",
//       "dimensions": { "length_mm": 2600, "width_mm": 800, "thickness_mm": 52 },
//       "bulkTiers": []
//     },
//     {
//       "id": "birch-ply-009",
//       "name": "Birch Plywood Sheet",
//       "sku": "TMB-BIR-009",
//       "category": "lumber",
//       "species": "Birch",
//       "grade": "BB/BB",
//       "type": "buy-now",
//       "unit": "sheet",
//       "price": 64.0,
//       "stock": 310,
//       "rating": 4.4,
//       "tags": ["birch", "interior"],
//       "finishes": ["Sanded"],
//       "image": "assets/img/products/birch-ply.jpg",
//       "short": "Furniture-grade birch ply sheet.",
//       "description": "18mm Baltic birch plywood, multi-ply core, smooth sanded faces. Excellent for cabinetry and CNC work.",
//       "dimensions": { "length_mm": 2440, "width_mm": 1220, "thickness_mm": 18 },
//       "bulkTiers": [
//         { "minQty": 10, "price": 59.0 },
//         { "minQty": 30, "price": 53.0 }
//       ]
//     },
//     {
//       "id": "cedar-floor-010",
//       "name": "Western Red Cedar Decking",
//       "sku": "TMB-CDR-010",
//       "category": "flooring",
//       "species": "Cedar",
//       "grade": "Clear",
//       "type": "buy-now",
//       "unit": "m2",
//       "price": 56.0,
//       "stock": 280,
//       "rating": 4.6,
//       "tags": ["cedar", "exterior"],
//       "finishes": ["Smooth", "Grooved"],
//       "image": "assets/img/products/cedar-decking.jpg",
//       "short": "Aromatic, naturally durable cedar, per m².",
//       "description": "Clear-grade western red cedar decking, lightweight and naturally resistant to decay. Smooth one face, grooved reverse.",
//       "dimensions": { "length_mm": 3000, "width_mm": 140, "thickness_mm": 25 },
//       "bulkTiers": [
//         { "minQty": 20, "price": 52.0 },
//         { "minQty": 50, "price": 47.0 }
//       ]
//     }
//   ]
// };