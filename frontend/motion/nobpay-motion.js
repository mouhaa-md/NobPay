/*!
 * NobPay motion kit : behaviour
 *
 * Original implementation (vanilla JS, UMD, no dependency) of the motion
 * patterns observed on nexaris.com: smooth scroll, word/line text reveal,
 * scroll parallax and auto-playing tabs with a progress line. Values were
 * measured from the site's public CSS/JS. Nothing is copied from it.
 *
 * Optional dependency: a global `Lenis` (see vendor/lenis.min.js, MIT) for
 * smooth scrolling. Without it everything else still works.
 *
 *   NobPayMotion.init();              // browser only (safe to import on the server)
 *   const m = NobPayMotion.init(...); // m.lenis, m.destroy()
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.NobPayMotion = factory(root);
})(typeof window !== 'undefined' ? window : this, function (win) {
  'use strict';

  var hasDom = !!(win && win.document);
  var doc = hasDom ? win.document : null;
  var noop = function () {};
  var reduced = hasDom && !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  // Same easing as the reference site's smooth scroll (ease-out expo).
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  /* ------------------------------------------------------------------ *
   * Smooth scroll: duration 1 s, vertical, wheel smoothed, touch native,
   * touch multiplier 1.5, smooth in-page anchors.
   * ------------------------------------------------------------------ */
  function initSmoothScroll() {
    if (reduced || typeof win.Lenis !== 'function') return { lenis: null, destroy: noop };

    var lenis = new win.Lenis({
      duration: 1,
      easing: easeOutExpo,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      syncTouch: false,
      touchMultiplier: 1.5,
      infinite: false
    });

    var raf = 0;
    function loop(time) { lenis.raf(time); raf = win.requestAnimationFrame(loop); }
    raf = win.requestAnimationFrame(loop);

    function onClick(e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var hash = a.getAttribute('href');
      if (!hash || hash.length < 2) return;
      var target = null;
      try { target = doc.querySelector(hash); } catch (err) { /* invalid selector */ }
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.2 });
    }
    doc.addEventListener('click', onClick);

    return {
      lenis: lenis,
      destroy: function () {
        win.cancelAnimationFrame(raf);
        doc.removeEventListener('click', onClick);
        lenis.destroy();
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Text reveal
   *   data-nm-reveal="words" (default)  or  "lines"
   *   data-nm-margin   % of viewport height to wait above the bottom edge
   *                    (default 5 for words, 10 for lines)
   *   data-nm-delay    ms between two units (default 100)
   * ------------------------------------------------------------------ */
  function splitWords(el) {
    var walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);

    var words = [];
    nodes.forEach(function (node) {
      var parts = node.nodeValue.split(/(\s+)/);
      var frag = doc.createDocumentFragment();
      parts.forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) { frag.appendChild(doc.createTextNode(p)); return; }
        var s = doc.createElement('span');
        s.className = 'nm-word';
        s.textContent = p;
        frag.appendChild(s);
        words.push(s);
      });
      node.parentNode.replaceChild(frag, node);
    });
    return words;
  }

  function splitLines(el) {
    // Complex markup (links, <strong>...): animate the paragraph as one block.
    if (el.children.length) {
      var one = doc.createElement('span');
      one.className = 'nm-line';
      while (el.firstChild) one.appendChild(el.firstChild);
      el.appendChild(one);
      return [one];
    }

    var text = el.textContent.replace(/\s+/g, ' ').trim();
    el.textContent = '';
    var probes = text.split(' ').map(function (w, i) {
      var s = doc.createElement('span');
      s.textContent = w;
      s.style.display = 'inline-block';
      if (i) el.appendChild(doc.createTextNode(' '));
      el.appendChild(s);
      return s;
    });

    var lines = [];
    var current = [];
    var top = null;
    probes.forEach(function (s) {
      var t = s.offsetTop;
      if (top === null || Math.abs(t - top) > 2) {
        if (current.length) lines.push(current);
        current = [];
        top = t;
      }
      current.push(s.textContent);
    });
    if (current.length) lines.push(current);

    el.textContent = '';
    return lines.map(function (words) {
      var l = doc.createElement('span');
      l.className = 'nm-line';
      l.textContent = words.join(' ');
      el.appendChild(l);
      return l;
    });
  }

  function initReveal() {
    var els = qsa('[data-nm-reveal]');
    if (!els.length) return { destroy: noop };

    var timers = [];
    var observers = [];
    var resizeTimer = 0;
    var lastWidth = win.innerWidth;
    var cancelled = false;

    function setup(el) {
      var mode = el.getAttribute('data-nm-reveal') === 'lines' ? 'lines' : 'words';
      var margin = parseFloat(el.getAttribute('data-nm-margin'));
      if (isNaN(margin)) margin = mode === 'lines' ? 10 : 5;
      var delay = el.hasAttribute('data-nm-delay') ? parseInt(el.getAttribute('data-nm-delay'), 10) : 100;

      if (el.__nmIO) el.__nmIO.disconnect();
      if (el.__nmHTML === undefined) el.__nmHTML = el.innerHTML;

      var units = mode === 'lines' ? splitLines(el) : splitWords(el);
      el.setAttribute('data-nm-ready', '');

      if (reduced || el.__nmDone) {
        units.forEach(function (u) { u.classList.add('nm-in'); });
        return;
      }

      var io = new win.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          io.disconnect();
          el.__nmDone = true;
          units.forEach(function (u, i) {
            timers.push(win.setTimeout(function () { u.classList.add('nm-in'); }, i * delay));
          });
        });
      }, { root: null, rootMargin: '0px 0px -' + margin + '% 0px' });
      io.observe(el);
      el.__nmIO = io;
      observers.push(io);
    }

    function run() {
      if (cancelled) return;
      els.forEach(setup);
    }

    // Wait for web fonts so line breaks are measured with the final metrics.
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { win.setTimeout(run, 50); });
    else win.setTimeout(run, 100);

    function onResize() {
      win.clearTimeout(resizeTimer);
      resizeTimer = win.setTimeout(function () {
        if (win.innerWidth === lastWidth) return;
        lastWidth = win.innerWidth;
        els.forEach(function (el) {
          if (el.getAttribute('data-nm-reveal') !== 'lines' || el.__nmHTML === undefined) return;
          el.innerHTML = el.__nmHTML;
          setup(el);
        });
      }, 250);
    }
    win.addEventListener('resize', onResize);

    return {
      destroy: function () {
        cancelled = true;
        win.removeEventListener('resize', onResize);
        observers.forEach(function (o) { o.disconnect(); });
        timers.forEach(function (t) { win.clearTimeout(t); });
        els.forEach(function (el) {
          if (el.__nmHTML !== undefined) el.innerHTML = el.__nmHTML;
          el.removeAttribute('data-nm-ready');
        });
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Parallax
   *   <section data-nm-parallax-root [data-nm-parallax-mode="exit|through"]>
   *     <div data-nm-parallax="-40">   final translateY, % of own height
   *   exit    (default) 0 when the section top is at the viewport top, 1 when
   *           its bottom leaves the top (suits a hero at the top of the page)
   *   through 0 when it enters at the bottom, 1 when it has fully left
   *   Eased with a small lerp (about the reference site's "smoothing 50").
   * ------------------------------------------------------------------ */
  function initParallax(lenis) {
    var roots = qsa('[data-nm-parallax-root]');
    if (reduced || !roots.length) return { destroy: noop };

    var items = [];
    roots.forEach(function (rootEl) {
      qsa('[data-nm-parallax]', rootEl).forEach(function (el) {
        items.push({ root: rootEl, el: el, to: parseFloat(el.getAttribute('data-nm-parallax')) || 0, cur: 0, target: 0 });
      });
    });

    var running = false;
    var raf = 0;
    var LERP = 0.12;

    function measure() {
      var vh = win.innerHeight;
      items.forEach(function (it) {
        var r = it.root.getBoundingClientRect();
        var through = it.root.getAttribute('data-nm-parallax-mode') === 'through';
        var p = through ? (vh - r.top) / (vh + r.height) : -r.top / r.height;
        it.target = clamp(p, 0, 1);
      });
    }

    function tick() {
      var moving = false;
      items.forEach(function (it) {
        var d = it.target - it.cur;
        if (Math.abs(d) > 0.0005) { it.cur += d * LERP; moving = true; }
        else it.cur = it.target;
        it.el.style.setProperty('--nm-py', (it.to * it.cur).toFixed(3) + '%');
      });
      if (moving) raf = win.requestAnimationFrame(tick);
      else running = false;
    }

    function onScroll() {
      measure();
      if (!running) { running = true; raf = win.requestAnimationFrame(tick); }
    }

    measure();
    tick();
    var offLenis = null;
    if (lenis && typeof lenis.on === 'function') {
      lenis.on('scroll', onScroll);
      offLenis = function () { if (typeof lenis.off === 'function') lenis.off('scroll', onScroll); };
    } else {
      win.addEventListener('scroll', onScroll, { passive: true });
    }
    win.addEventListener('resize', onScroll);

    return {
      destroy: function () {
        win.cancelAnimationFrame(raf);
        if (offLenis) offLenis(); else win.removeEventListener('scroll', onScroll);
        win.removeEventListener('resize', onScroll);
        items.forEach(function (it) { it.el.style.removeProperty('--nm-py'); });
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Auto-playing tabs
   *   <div data-nm-tabs data-nm-delay="4000">
   *     <button data-nm-tab> ... <span class="nm-tab-progress"><i></i></span>
   *     <div data-nm-panels><div class="nm-panel" data-nm-panel>...
   *   Starts when 30 % visible, pauses when hidden, wraps around, keeps
   *   playing after a manual click, progress bar fills in exactly `delay`.
   * ------------------------------------------------------------------ */
  function initTabs() {
    var roots = qsa('[data-nm-tabs]');
    if (!roots.length) return { destroy: noop };
    var cleanups = [];

    roots.forEach(function (rootEl) {
      var tabs = qsa('[data-nm-tab]', rootEl);
      var panels = qsa('[data-nm-panel]', rootEl);
      if (!tabs.length || tabs.length !== panels.length) return;

      var delay = parseInt(rootEl.getAttribute('data-nm-delay'), 10) || 4000;
      var index = 0;
      var timer = 0;
      var visible = false;

      function restartProgress() {
        win.clearTimeout(timer);
        tabs.forEach(function (t) {
          var bar = t.querySelector('.nm-tab-progress > i');
          if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }
        });
        if (reduced || !visible) return;
        var active = tabs[index].querySelector('.nm-tab-progress > i');
        if (active) {
          void active.offsetWidth; // flush so the width transition restarts
          active.style.transition = 'width ' + delay + 'ms linear';
          active.style.width = '100%';
        }
        timer = win.setTimeout(function () { show(index + 1); }, delay);
      }

      function show(i) {
        var prev = index;
        index = (i + tabs.length) % tabs.length;
        tabs.forEach(function (t, k) {
          t.classList.toggle('is-active', k === index);
          t.setAttribute('aria-selected', k === index ? 'true' : 'false');
        });
        panels.forEach(function (p, k) {
          p.classList.toggle('is-active', k === index);
          p.classList.toggle('is-leaving', k === prev && k !== index);
          p.setAttribute('aria-hidden', k === index ? 'false' : 'true');
        });
        restartProgress();
      }

      function onKey(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(tabs.indexOf(e.currentTarget)); }
      }
      var clickHandlers = tabs.map(function (t, k) {
        var h = function () { show(k); };
        t.addEventListener('click', h);
        t.addEventListener('keydown', onKey);
        if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '0');
        return h;
      });

      var io = new win.IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        restartProgress();
      }, { threshold: 0.3 });
      io.observe(rootEl);

      show(0);

      cleanups.push(function () {
        win.clearTimeout(timer);
        io.disconnect();
        tabs.forEach(function (t, k) {
          t.removeEventListener('click', clickHandlers[k]);
          t.removeEventListener('keydown', onKey);
        });
      });
    });

    return { destroy: function () { cleanups.forEach(function (c) { c(); }); } };
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */
  function init(options) {
    if (!hasDom) return { lenis: null, destroy: noop };
    options = options || {};

    doc.documentElement.classList.add('nm-js');

    var smooth = options.smoothScroll === false ? { lenis: null, destroy: noop } : initSmoothScroll();
    var reveal = options.reveal === false ? { destroy: noop } : initReveal();
    var parallax = options.parallax === false ? { destroy: noop } : initParallax(smooth.lenis);
    var tabs = options.tabs === false ? { destroy: noop } : initTabs();

    win.__nmReady = true;

    return {
      lenis: smooth.lenis,
      destroy: function () {
        tabs.destroy();
        parallax.destroy();
        reveal.destroy();
        smooth.destroy();
        doc.documentElement.classList.remove('nm-js');
        win.__nmReady = false;
      }
    };
  }

  return { init: init, reducedMotion: reduced };
});
