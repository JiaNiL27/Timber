/* ============================================================
   reveal.js — TimberPro motion layer
   Scroll-triggered reveals, staggered grids, count-up stats,
   lazy images, sticky/shrink header, smooth-scroll & back-to-top.
   Pure JS + IntersectionObserver. Loaded by every page.
   ============================================================ */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. Scroll reveals (.reveal / .stagger) ---------- */
  var revealIO = null;

  // is the element within (or above) the current viewport?
  function inView(el) {
    var r = el.getBoundingClientRect();
    var h = window.innerHeight || document.documentElement.clientHeight;
    return r.top < h * 0.92 && r.bottom > 0;
  }

  function revealNow(el) {
    var delay = el.getAttribute("data-delay");
    if (delay) el.style.setProperty("--d", delay + "ms");
    el.classList.add("is-visible");
  }

  function observeReveal(el) {
    if (el.classList.contains("is-visible") || el.dataset.revealBound) return;
    el.dataset.revealBound = "1";
    if (!revealIO) { revealNow(el); return; }   // fallback / reduced motion
    // Above-the-fold elements reveal immediately so content is never left
    // hidden if the observer doesn't fire (no paint, bfcache, etc.).
    if (inView(el)) revealNow(el);
    else revealIO.observe(el);
  }

  function initReveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal, .stagger").forEach(revealNow);
      return;
    }
    revealIO = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          revealNow(entry.target);
          obs.unobserve(entry.target);   // reveal once
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

    refreshReveal();
  }

  // (re)scan the DOM for reveal elements not yet bound — used after
  // pages inject cards dynamically (e.g. home/shop product grids).
  function refreshReveal() {
    document.querySelectorAll(".reveal, .stagger").forEach(observeReveal);
  }

  /* ---------- 2. Count-up stats ([data-count]) ---------- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count")) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    var duration = 1500;
    var start = null;

    if (reduceMotion) { el.textContent = target + suffix; return; }

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initCounters() {
    var nums = document.querySelectorAll("[data-count]");
    if (!nums.length) return;

    if (!("IntersectionObserver" in window)) {
      nums.forEach(animateCount);
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    nums.forEach(function (n) {
      if (inView(n)) animateCount(n);   // visible at load -> run now
      else io.observe(n);
    });
  }

  /* ---------- 3. Lazy images (img.lazy[data-src]) ---------- */
  function initLazy() {
    var imgs = document.querySelectorAll("img.lazy[data-src]");
    if (!imgs.length) return;

    function load(img) {
      img.src = img.getAttribute("data-src");
      img.addEventListener("load", function () { img.classList.add("is-loaded"); });
      img.removeAttribute("data-src");
    }
    if (!("IntersectionObserver" in window)) { imgs.forEach(load); return; }

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { load(entry.target); obs.unobserve(entry.target); }
      });
    }, { rootMargin: "200px 0px" });
    imgs.forEach(function (img) {
      if (inView(img)) load(img);   // visible at load -> load now
      else io.observe(img);
    });
  }

  /* ---------- 4. Sticky / shrink header ---------- */
  function initStickyHeader() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- 5. Parallax ([data-parallax]) ---------- */
  function initParallax() {
    if (reduceMotion) return;
    var els = document.querySelectorAll("[data-parallax]");
    if (!els.length) return;
    var ticking = false;
    function update() {
      els.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var speed = parseFloat(el.getAttribute("data-parallax")) || 0.3;
        var offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * -speed;
        el.style.backgroundPosition = "center calc(50% + " + offset.toFixed(1) + "px)";
      });
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ---------- 6. Back-to-top ---------- */
  function initBackToTop() {
    var btn = document.querySelector(".to-top");
    if (!btn) return;
    window.addEventListener("scroll", function () {
      btn.classList.toggle("is-visible", window.scrollY > 600);
    }, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ---------- init ---------- */
  function init() {
    initReveal();
    initCounters();
    initLazy();
    initStickyHeader();
    initParallax();
    initBackToTop();
  }
  // exposed so pages that inject content can re-trigger reveals & lazy-load
  window.TimberReveal = { refresh: function () { refreshReveal(); initLazy(); } };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
