/* ============================================================
   assets/admin-charts.js — tiny hand-rolled SVG charts
   No external chart library: keeps the bespoke wood look and
   zero new dependencies. Colours come from admin.css classes.
   Public: AdminCharts.line / .bar / .donut  (return SVG strings)
           AdminCharts.render(el, svgString)
   ============================================================ */
(function (global) {
  "use strict";

  var W = 640, H = 260, pL = 46, pR = 18, pT = 18, pB = 36;
  var iw = W - pL - pR, ih = H - pT - pB;

  function niceMax(m) {
    if (m <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(m)));
    var f = m / p;
    var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * p;
  }
  function compact(v) {
    if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 ? 1 : 0) + "M";
    if (v >= 1000) return (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k";
    return "" + Math.round(v);
  }
  function axis(v, money) { return (money ? "$" : "") + compact(v); }

  function grid(max, money) {
    var s = "", steps = 4;
    for (var g = 0; g <= steps; g++) {
      var gy = pT + ih * g / steps;
      var val = max * (1 - g / steps);
      s += '<line class="ac-grid" x1="' + pL + '" y1="' + gy + '" x2="' + (W - pR) + '" y2="' + gy + '"/>';
      s += '<text class="ac-ylab" x="' + (pL - 8) + '" y="' + (gy + 4) + '">' + axis(val, money) + '</text>';
    }
    return s;
  }
  function svgWrap(inner) {
    return '<svg class="ac-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="acFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop class="ac-g0" offset="0"/><stop class="ac-g1" offset="1"/></linearGradient></defs>' +
      inner + '</svg>';
  }

  /* ---------- line chart ---------- */
  function line(data, opt) {
    opt = opt || {};
    var n = data.length || 1;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1])));
    function x(i) { return pL + (n <= 1 ? iw / 2 : iw * i / (n - 1)); }
    function y(v) { return pT + ih - (v / max) * ih; }

    var pts = data.map(function (d, i) { return x(i) + "," + y(d.value); });
    var area = '<polygon class="ac-area" points="' + (x(0) + "," + (pT + ih)) + " " + pts.join(" ") + " " + (x(n - 1) + "," + (pT + ih)) + '"/>';
    var path = '<polyline class="ac-line" points="' + pts.join(" ") + '"/>';
    var dots = data.map(function (d, i) { return '<circle class="ac-dot" cx="' + x(i) + '" cy="' + y(d.value) + '" r="3.5"/>'; }).join("");
    var xlabs = data.map(function (d, i) { return '<text class="ac-xlab" x="' + x(i) + '" y="' + (H - 12) + '">' + d.label + "</text>"; }).join("");
    return svgWrap(grid(max, opt.money) + area + path + dots + xlabs);
  }

  /* ---------- vertical bar chart ---------- */
  function bar(data, opt) {
    opt = opt || {};
    var n = data.length || 1;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1])));
    var slot = iw / n, bw = Math.min(46, slot * 0.5);
    function y(v) { return pT + ih - (v / max) * ih; }
    var hiIdx = data.reduce(function (best, d, i) { return d.value > data[best].value ? i : best; }, 0);

    var bars = data.map(function (d, i) {
      var cx = pL + slot * i + slot / 2;
      var by = y(d.value), bh = (pT + ih) - by;
      var cls = i === hiIdx ? "ac-bar ac-bar--hi" : "ac-bar";
      return '<rect class="' + cls + '" x="' + (cx - bw / 2) + '" y="' + by + '" width="' + bw + '" height="' + Math.max(0, bh) + '" rx="4"/>';
    }).join("");
    var xlabs = data.map(function (d, i) {
      var cx = pL + slot * i + slot / 2;
      return '<text class="ac-xlab" x="' + cx + '" y="' + (H - 12) + '">' + d.label + "</text>";
    }).join("");
    return svgWrap(grid(max, opt.money) + bars + xlabs);
  }

  /* ---------- donut chart (for analytics reuse) ---------- */
  function donut(segments, opt) {
    opt = opt || {};
    var cx = 110, cy = 110, r = 78, sw = 26;
    var total = segments.reduce(function (s, x) { return s + x.value; }, 0) || 1;
    var C = 2 * Math.PI * r, off = 0;
    var rings = segments.map(function (s) {
      var len = (s.value / total) * C;
      var seg = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (s.color || "var(--amber)") +
        '" stroke-width="' + sw + '" stroke-dasharray="' + len + " " + (C - len) + '" stroke-dashoffset="' + (-off) +
        '" transform="rotate(-90 ' + cx + " " + cy + ')"/>';
      off += len;
      return seg;
    }).join("");
    var center = '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" style="font-family:var(--font-head);font-size:30px;fill:var(--wood-dark)">' +
      (opt.centerTop || total) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" style="font-family:var(--font-body);font-size:11px;fill:var(--ink-soft)">' +
      (opt.centerSub || "Total") + '</text>';
    return '<svg class="ac-svg" viewBox="0 0 220 220" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' + rings + center + '</svg>';
  }

  function render(el, svg) { if (el) el.innerHTML = svg; }

  global.AdminCharts = { line: line, bar: bar, donut: donut, render: render };
})(window);
