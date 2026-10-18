/* Mini keyframe engine: every frame is a pure function of time (deterministic), so it can be rendered frame by frame. */
(function () {
  const W = 1920, H = 1080;
  const INK = '#0B132B', PAPER = '#F6F1E7', BLUE = '#1D4ED8', ORANGE = '#F7931A', WHITE = '#FFFFFF', SKY = '#A9BEFF';
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const E = {
    lin: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outx: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inx: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    bounce: (t) => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; },
  };

  /** A node = one DOM element + keyframe tracks (x, y, s, sx, sy, r, o, cl/cr/ct/cb clip insets in %, blur, w, h) + optional per-frame function. */
  class N {
    constructor(el, scene) {
      this.el = el; this.scene = scene; this.tr = {}; this.fns = []; this.base = { x: 0, y: 0, s: 1, sx: 1, sy: 1, r: 0, o: 1, cl: 0, cr: 0, ct: 0, cb: 0, blur: 0 };
      this.dirty = true; this.last = '';
    }
    set(p) { Object.assign(this.base, p); return this; }
    k(prop, ...frames) { const a = (this.tr[prop] = (this.tr[prop] || []).concat(frames)); a.sort((m, n) => m[0] - n[0]); return this; }
    /** fade+slide in at t, optional out */
    show(t, d = 0.5, { from = { y: 30 }, ease = 'out', out = null } = {}) {
      this.k('o', [t, 0], [t + d, 1, E[ease] ? ease : 'out']);
      if (from.y !== undefined) this.k('y', [t, (this.base.y || 0) + from.y], [t + d, this.base.y || 0, ease]);
      if (from.x !== undefined) this.k('x', [t, (this.base.x || 0) + from.x], [t + d, this.base.x || 0, ease]);
      if (from.s !== undefined) this.k('s', [t, from.s], [t + d, this.base.s ?? 1, ease]);
      if (out) this.hide(out, 0.35);
      return this;
    }
    hide(t, d = 0.35) { this.k('o', [t, 1], [t + d, 0, 'in']); return this; }
    on(fn) { this.fns.push(fn); return this; }
    val(prop, t) {
      const a = this.tr[prop];
      if (!a || !a.length) return this.base[prop];
      if (t <= a[0][0]) return a[0][1];
      const l = a[a.length - 1];
      if (t >= l[0]) return l[1];
      for (let i = 0; i < a.length - 1; i++) {
        if (t >= a[i][0] && t < a[i + 1][0]) {
          const p = (t - a[i][0]) / (a[i + 1][0] - a[i][0]);
          const e = E[a[i + 1][2] || 'io'] || E.io;
          return lerp(a[i][1], a[i + 1][1], e(p));
        }
      }
      return l[1];
    }
    apply(t) {
      const v = {};
      for (const p of Object.keys(this.base)) v[p] = this.val(p, t);
      const el = this.el;
      for (const f of this.fns) f(t, this, v);
      const tf = `translate3d(${v.x.toFixed(2)}px,${v.y.toFixed(2)}px,0) rotate(${v.r.toFixed(3)}deg) scale(${(v.s * v.sx).toFixed(4)},${(v.s * v.sy).toFixed(4)})`;
      const op = v.o.toFixed(3);
      const clip = v.cl || v.cr || v.ct || v.cb ? `inset(${v.ct.toFixed(2)}% ${v.cr.toFixed(2)}% ${v.cb.toFixed(2)}% ${v.cl.toFixed(2)}%)` : '';
      const flt = v.blur ? `blur(${v.blur.toFixed(2)}px)` : '';
      const sig = tf + op + clip + flt;
      if (sig !== this.last) {
        el.style.transform = tf;
        el.style.opacity = op;
        el.style.clipPath = clip;
        el.style.webkitClipPath = clip;
        el.style.filter = flt;
        this.last = sig;
      }
    }
  }

  const css = (el, s) => { if (s) el.style.cssText += ';' + s; return el; };
  const mk = (tag, s, parent) => { const el = document.createElement(tag); css(el, 'position:absolute;' + (s || '')); if (parent) parent.appendChild(el); return el; };

  class Scene {
    constructor(id, start, end) {
      this.id = id; this.start = start; this.end = end; this.nodes = [];
      this.root = mk('div', `left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;display:none`, STAGE);
    }
    n(el, parent) { const nd = new N(el, this); this.nodes.push(nd); (parent || this.root).appendChild(el); return nd; }
    div(s, parent) { return this.n(mk('div', s), parent); }
    text(html, s, parent) { const el = mk('div', 'white-space:nowrap;' + (s || '')); el.innerHTML = html; return this.n(el, parent); }
    img(src, s, parent) { const el = mk('img', s); el.src = src; el.draggable = false; return this.n(el, parent); }
    svg(markup, s, parent) { const el = mk('div', s); el.innerHTML = markup; return this.n(el, parent); }
    /** group node (container for children) */
    g(s, parent) { return this.div(s, parent); }
    /** a text line revealed through a mask (rises from below) */
    line(html, s, t, { d = 0.7, ease = 'outx', parent = null, out = null } = {}) {
      const wrap = mk('div', 'overflow:hidden;' + (s || ''));
      const inner = mk('div', 'position:relative;white-space:nowrap;line-height:inherit;');
      inner.innerHTML = html; wrap.appendChild(inner);
      const wn = this.n(wrap, parent);
      const inn = new N(inner, this); this.nodes.push(inn);
      inn.k('y', [t, 110], [t + d, 0, ease]).k('o', [t, 0], [t + 0.01, 1]);
      if (out) inn.k('y', [out, 0], [out + 0.45, -110, 'in']);
      wn.inner = inn;
      return wn;
    }
    /** words reveal one by one */
    words(text, s, t, { gap = 0.09, d = 0.5, parent = null, out = null, cls = '' } = {}) {
      const box = this.g('white-space:nowrap;' + (s || ''), parent);
      const parts = text.split(' ');
      parts.forEach((w, i) => {
        const sp = mk('span', 'display:inline-block;margin-right:0.28em;will-change:transform');
        sp.innerHTML = w; if (cls) sp.className = cls;
        box.el.appendChild(sp);
        sp.style.position = 'relative';
        const nd = new N(sp, this); this.nodes.push(nd);
        nd.k('o', [t + i * gap, 0], [t + i * gap + d, 1, 'out']).k('y', [t + i * gap, 40], [t + i * gap + d, 0, 'outx']);
        if (out) nd.k('o', [out, 1], [out + 0.35, 0, 'in']);
      });
      return box;
    }
    update(t) {
      const on = t >= this.start - 0.02 && t < this.end + 0.02;
      this.root.style.display = on ? 'block' : 'none';
      if (!on) return;
      for (const nd of this.nodes) nd.apply(t);
    }
  }

  let STAGE;
  const scenes = [];
  const overlays = [];
  const api = {
    W, H, INK, PAPER, BLUE, ORANGE, WHITE, SKY, E, clamp, lerp, N, Scene, mk, css,
    init() { STAGE = document.getElementById('stage'); api.STAGE = STAGE; },
    scene(id, start, end) { const s = new Scene(id, start, end); scenes.push(s); return s; },
    overlay(fn) { overlays.push(fn); },
    renderAt(t) {
      for (const s of scenes) s.update(t);
      for (const f of overlays) f(t);
    },
    scenes,
  };
  window.ENG = api;
})();
