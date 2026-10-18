/* Shared motion-design helpers: backdrops, chrome, text blocks, phone / laptop mockups, callouts, taps, chapter cards. */
(function () {
  const { W, H, INK, PAPER, BLUE, ORANGE, WHITE, SKY, E, clamp, lerp } = ENG;
  const TL = window.TL, A = window.ASSETS;
  const L = (window.L = {});
  ENG.init();
  /** sound-design events collected while the scenes are built: { t, k } */
  const SFX = (window.SFX = []);

  L.t = (id, k, off = 0) => TL.s[id + '-' + k].t + off;
  L.e = (id, k, off = 0) => TL.s[id + '-' + k].t + TL.s[id + '-' + k].d + off;
  L.at = (id, k, f) => TL.s[id + '-' + k].t + f * TL.s[id + '-' + k].d;
  L.sh = (n) => 'assets/shots/' + n + '.png';
  L.tapAt = (text, shot) => A.taps.find((x) => x.text.includes(text) && (!shot || x.shot === shot));
  L.THEMES = {
    dark: { bg: INK, fg: PAPER, mute: '#9AA6C4', acc: SKY, line: 'rgba(246,241,231,.22)', pill: 'rgba(246,241,231,.1)' },
    light: { bg: PAPER, fg: INK, mute: '#5C6478', acc: BLUE, line: 'rgba(11,19,43,.16)', pill: 'rgba(11,19,43,.07)' },
    blue: { bg: BLUE, fg: WHITE, mute: '#D2DDFF', acc: '#FFD9A8', line: 'rgba(255,255,255,.32)', pill: 'rgba(255,255,255,.14)' },
    soft: { bg: '#E9EFFF', fg: INK, mute: '#4B5568', acc: BLUE, line: 'rgba(11,19,43,.14)', pill: 'rgba(11,19,43,.07)' },
  };
  const TH = (th) => L.THEMES[th];

  L.logo = (w, color, keyColor = ORANGE) =>
    `<svg viewBox="0 -40 ${A.logoW} 180" width="${w}" height="${(w * 180) / A.logoW}" style="display:block;overflow:visible">${A.logoParts.map((p) => `<path d="${p.d}" fill="${p.id === 'key' ? keyColor : color}" fill-rule="evenodd"/>`).join('')}</svg>`;
  L.fmt = (n, d = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, ' ');

  /** flat colour + two drifting colour blobs */
  L.backdrop = (S, th) => {
    const c = TH(th);
    S.div(`left:0;top:0;width:${W}px;height:${H}px;background:${c.bg}`);
    const blobs =
      th === 'dark'
        ? [[260, 160, 1000, 'rgba(29,78,216,.42)'], [1650, 960, 900, 'rgba(247,147,26,.13)']]
        : th === 'blue'
          ? [[1500, 120, 1000, 'rgba(255,255,255,.16)'], [200, 980, 900, 'rgba(11,19,43,.28)']]
          : [[1600, 140, 900, 'rgba(29,78,216,.10)'], [160, 960, 800, 'rgba(247,147,26,.13)']];
    blobs.forEach(([x, y, r, col], i) => {
      const n = S.div(`left:${x - r / 2}px;top:${y - r / 2}px;width:${r}px;height:${r}px;border-radius:50%;background:radial-gradient(circle,${col},transparent 66%)`);
      n.on((t, nd, v) => {
        v.x = Math.sin(t * 0.22 + i * 2.1) * 110;
        v.y = Math.cos(t * 0.17 + i) * 80;
      });
    });
  };

  /** logo top-left, label top-right, global progress bar */
  L.chrome = (S, th, label) => {
    const c = TH(th);
    const lg = S.svg(L.logo(150, c.fg), 'left:96px;top:50px;width:150px;height:42px');
    lg.show(S.start + 0.5, 0.6, { from: { y: -20 } });
    const lb = S.text(label, `right:96px;top:64px;font:700 19px 'Figtree';letter-spacing:.16em;text-transform:uppercase;color:${c.mute}`);
    lb.show(S.start + 0.6, 0.6, { from: { y: -20 } });
    const bar = S.div(`left:0;bottom:0;height:7px;width:${W}px;background:${ORANGE};transform-origin:0 50%`);
    bar.on((t, n, v) => {
      v.sx = clamp(t / TL.total);
    });
  };

  /** kicker + big headline lines (masked rise) + sub line. Everything fades together at t1. */
  L.block = (S, th, { x, y, w = 780, kick, lines, size = 76, sub, t0, t1, subSize = 34 }) => {
    const c = TH(th);
    const g = S.g(`left:${x}px;top:${y}px;width:${w}px;height:10px`);
    let yy = 0;
    if (kick) {
      S.text(kick.toUpperCase(), `left:0;top:0;font:800 22px 'Figtree';letter-spacing:.18em;color:${c.acc}`, g.el).show(t0, 0.5, { from: { y: 18 } });
      yy = 50;
    }
    lines.forEach((ln, i) => {
      S.line(ln, `left:0;top:${yy + i * size * 1.06}px;height:${size * 1.1}px;width:${w + 400}px;font:800 ${size}px/${size * 1.08}px 'Bricolage Grotesque';letter-spacing:-.028em;color:${c.fg}`, t0 + 0.07 * i, { parent: g.el });
    });
    yy += lines.length * size * 1.06 + 12;
    if (sub) S.text(sub, `left:0;top:${yy}px;font:500 ${subSize}px/1.36 'Figtree';color:${c.mute};white-space:normal;width:${w}px`, g.el).show(t0 + 0.3, 0.6, { from: { y: 22 } });
    g.k('o', [t1, 1], [t1 + 0.32, 0, 'in']).k('y', [t1, 0], [t1 + 0.32, -24, 'in']);
    return g;
  };

  /** phone mockup with screens, taps and highlight rings, in stage coordinates (cx, cy, scale k) */
  L.phone = (S, { cx, cy, k = 1, rot = 0, t0, t1 = null, from = 'bottom' }) => {
    SFX.push({ t: t0 + 0.05, k: 'swish' });
    const SW = 390 * k, SH = 844 * k, B = 15 * k;
    const grp = S.g(`left:${cx - SW / 2 - B}px;top:${cy - SH / 2 - B}px;width:${SW + 2 * B}px;height:${SH + 2 * B}px;transform-origin:50% 50%`);
    grp.set({ r: rot });
    const d = 0.9;
    const dy = from === 'bottom' ? 420 : from === 'top' ? -420 : 0;
    const dx = from === 'right' ? 520 : from === 'left' ? -520 : 0;
    grp.k('o', [t0, 0], [t0 + 0.35, 1, 'out']).k('y', [t0, dy], [t0 + d, 0, 'outx']).k('x', [t0, dx], [t0 + d, 0, 'outx']).k('r', [t0, rot + 8], [t0 + d, rot, 'outx']);
    if (t1 !== null) grp.k('o', [t1, 1], [t1 + 0.4, 0, 'in']).k('y', [t1, 0], [t1 + 0.5, 300, 'in']);
    grp.on((t, n, v) => {
      v.y += Math.sin(t * 1.1) * 5;
    });
    S.div(`left:0;top:0;width:${SW + 2 * B}px;height:${SH + 2 * B}px;border-radius:${62 * k}px;background:#15122B;box-shadow:0 ${46 * k}px ${96 * k}px rgba(0,0,0,.42),inset 0 0 0 ${2.5 * k}px #4A4680,0 0 0 ${1.5 * k}px rgba(255,255,255,.16)`, grp.el);
    const scr = S.div(`left:${B}px;top:${B}px;width:${SW}px;height:${SH}px;border-radius:${48 * k}px;overflow:hidden;background:#fff`, grp.el);
    S.div(`left:${B + SW / 2 - 6 * k}px;top:${B + 6 * k}px;width:${12 * k}px;height:${12 * k}px;border-radius:50%;background:#0A0A12;box-shadow:0 0 0 ${2 * k}px #1B1838;z-index:5`, grp.el);
    const P = {
      grp, scr, k, SW, SH, B, cx, cy,
      /** local (390x844) -> stage coordinates */
      pt: (px, py) => ({ x: cx - SW / 2 + px * k, y: cy - SH / 2 + py * k }),
      screen(name, t, { mode = 'fade', scroll = null, until = null } = {}) {
        const im = S.img(L.sh(name), `left:0;top:0;width:${SW}px;display:block;will-change:transform`, scr.el);
        im.set({ o: 0 });
        const dd = 0.3;
        im.k('o', [t - 0.001, 0], [t + dd, 1, 'out']);
        if (!scroll) {
          if (mode === 'up') im.k('y', [t, 70 * k], [t + dd + 0.15, 0, 'outx']);
          if (mode === 'right') im.k('x', [t, SW * 0.45], [t + dd + 0.15, 0, 'outx']);
          if (mode === 'zoom') im.k('s', [t, 1.07], [t + 0.7, 1, 'out']);
        } else {
          const [f, to, ts, te, ez] = scroll;
          im.k('y', [Math.min(t, ts), -f * k], [ts, -f * k], [te, -to * k, ez || 'io']);
        }
        if (until !== null) im.k('o', [until, 1], [until + 0.3, 0]);
        return im;
      },
      tap(t, px, py) {
        SFX.push({ t, k: 'tap' });
        const r = S.div(`left:${px * k - 42 * k}px;top:${py * k - 42 * k}px;width:${84 * k}px;height:${84 * k}px;border-radius:50%;background:rgba(29,78,216,.26);border:${3 * k}px solid rgba(29,78,216,.75)`, scr.el);
        r.set({ o: 0 }).k('o', [t - 0.001, 0], [t, 0.95], [t + 0.6, 0, 'out']).k('s', [t, 0.25], [t + 0.6, 1.55, 'out']);
        const f = S.div(`left:${px * k - 30 * k}px;top:${py * k - 30 * k}px;width:${60 * k}px;height:${60 * k}px;border-radius:50%;background:rgba(255,255,255,.88);border:${3 * k}px solid rgba(11,19,43,.55);box-shadow:0 ${8 * k}px ${22 * k}px rgba(0,0,0,.28)`, scr.el);
        f.set({ o: 0 }).k('o', [t - 0.55, 0], [t - 0.38, 1], [t + 0.35, 1], [t + 0.6, 0]).k('x', [t - 0.55, 90 * k], [t - 0.08, 0, 'out']).k('y', [t - 0.55, 150 * k], [t - 0.08, 0, 'out']).k('s', [t - 0.08, 1], [t, 0.8], [t + 0.16, 1, 'out']);
      },
      ring(ta, tb, { x, y, w, h, r = 16 }) {
        const rg = S.div(`left:${x * k}px;top:${y * k}px;width:${w * k}px;height:${h * k}px;border-radius:${r * k}px;border:${4 * k}px solid ${ORANGE};box-shadow:0 0 0 ${6 * k}px rgba(247,147,26,.22)`, scr.el);
        rg.set({ o: 0 }).k('o', [ta, 0], [ta + 0.3, 1], [tb, 1], [tb + 0.3, 0]).k('s', [ta, 1.08], [ta + 0.4, 1, 'out']);
        rg.on((t, n, v) => {
          v.s *= 1 + 0.015 * Math.sin((t - ta) * 7);
        });
      },
    };
    return P;
  };

  /** laptop mockup (screen 1440x900 css px) */
  L.laptop = (S, { cx, cy, w = 1100, t0, t1 = null, from = 'bottom' }) => {
    const sw = w, sh = (w * 900) / 1440, B = 16;
    const grp = S.g(`left:${cx - sw / 2 - B}px;top:${cy - sh / 2 - B}px;width:${sw + 2 * B}px;height:${sh + 2 * B + 26}px`);
    const dy = from === 'bottom' ? 380 : 0;
    const dx = from === 'right' ? 700 : 0;
    grp.k('o', [t0, 0], [t0 + 0.35, 1, 'out']).k('y', [t0, dy], [t0 + 0.9, 0, 'outx']).k('x', [t0, dx], [t0 + 0.9, 0, 'outx']);
    if (t1 !== null) grp.k('o', [t1, 1], [t1 + 0.4, 0, 'in']).k('y', [t1, 0], [t1 + 0.5, 260, 'in']);
    grp.on((t, n, v) => {
      v.y += Math.sin(t * 0.9) * 4;
    });
    S.div(`left:0;top:0;width:${sw + 2 * B}px;height:${sh + 2 * B}px;border-radius:26px 26px 8px 8px;background:#1A1F33;box-shadow:0 50px 100px rgba(0,0,0,.4)`, grp.el);
    const scr = S.div(`left:${B}px;top:${B}px;width:${sw}px;height:${sh}px;border-radius:8px;overflow:hidden;background:#fff`, grp.el);
    S.div(`left:${-sw * 0.05}px;top:${sh + 2 * B}px;width:${sw * 1.1 + 2 * B}px;height:24px;border-radius:0 0 30px 30px;background:linear-gradient(#CBD0DC,#9CA3B6)`, grp.el);
    const k = sw / 1440;
    return {
      grp, scr, k, sw, sh, B, cx, cy,
      pt: (px, py) => ({ x: cx - sw / 2 + px * k, y: cy - sh / 2 + py * k }),
      screen(name, t, { scroll = null, until = null, mode = 'fade' } = {}) {
        const im = S.img(L.sh(name), `left:0;top:0;width:${sw}px;display:block`, scr.el);
        im.set({ o: 0 }).k('o', [t - 0.001, 0], [t + 0.45, 1, 'out']);
        if (mode === 'zoom') im.k('s', [t, 1.06], [t + 0.8, 1, 'out']);
        if (scroll) {
          const [f, to, ts, te, ez] = scroll;
          im.k('y', [Math.min(t, ts), -f * k], [ts, -f * k], [te, -to * k, ez || 'io']);
        }
        if (until !== null) im.k('o', [until, 1], [until + 0.3, 0]);
        return im;
      },
    };
  };

  /** label + leader line + pulsing dot (stage coordinates) */
  L.callout = (S, { text, sub = '', ax, ay, tx, ty, t0, t1, w = 0, side = 'l', tone = 'dark' }) => {
    SFX.push({ t: t0 + 0.2, k: 'pop' });
    const bw = w || Math.max(text.length * 15.2, sub.length * 10.8) + 52;
    const bh = sub ? 92 : 60;
    const bg = tone === 'orange' ? ORANGE : tone === 'light' ? WHITE : 'rgba(11,19,43,.94)';
    const fg = tone === 'orange' ? INK : tone === 'light' ? INK : WHITE;
    const lx = side === 'l' ? tx : tx + bw;
    const ly = ty + bh / 2;
    const dx = ax - lx, dy = ay - ly;
    const len = Math.hypot(dx, dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const line = S.div(`left:${lx}px;top:${ly - 1.5}px;width:${len}px;height:3px;background:${ORANGE};transform-origin:0 50%`);
    line.set({ r: ang, sx: 0 }).k('sx', [t0 + 0.1, 0], [t0 + 0.55, 1, 'out']).k('o', [t1, 1], [t1 + 0.3, 0]);
    const dot = S.div(`left:${ax - 10}px;top:${ay - 10}px;width:20px;height:20px;border-radius:50%;background:${ORANGE};border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.35)`);
    dot.set({ o: 0 }).k('o', [t0, 0], [t0 + 0.2, 1], [t1, 1], [t1 + 0.3, 0]).k('s', [t0, 0.2], [t0 + 0.5, 1, 'back']);
    const pulse = S.div(`left:${ax - 22}px;top:${ay - 22}px;width:44px;height:44px;border-radius:50%;border:3px solid ${ORANGE}`);
    pulse.set({ o: 0 }).on((t, n, v) => {
      if (t < t0 + 0.4 || t > t1) { v.o = 0; return; }
      const p = ((t - t0) % 1.4) / 1.4;
      v.o = 0.7 * (1 - p);
      v.s = 0.5 + p * 1.1;
    });
    const box = S.div(`left:${tx}px;top:${ty}px;width:${bw}px;height:${bh}px;border-radius:16px;background:${bg};box-shadow:0 14px 34px rgba(0,0,0,.28);display:flex;flex-direction:column;justify-content:center;padding:0 24px;box-sizing:border-box;transform-origin:${side === 'l' ? '0 50%' : '100% 50%'}`);
    box.el.innerHTML = `<div style="font:800 25px 'Figtree';color:${fg};white-space:nowrap">${text}</div>${sub ? `<div style="font:500 19px 'Figtree';color:${tone === 'dark' ? SKY : '#4B5568'};white-space:nowrap;margin-top:4px">${sub}</div>` : ''}`;
    box.set({ o: 0 }).k('o', [t0 + 0.15, 0], [t0 + 0.4, 1, 'out'], [t1, 1], [t1 + 0.3, 0]).k('s', [t0 + 0.15, 0.6], [t0 + 0.65, 1, 'back']);
    return { box, line, dot, bw, bh };
  };

  /** big chapter title card: huge number, title, portrait in a circle */
  L.chapter = (S, th, { num, title, role, portrait, t0, t1, side = 'left' }) => {
    const c = TH(th);
    SFX.push({ t: t0 + 0.2, k: 'hit' });
    const g = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    const numN = S.text(String(num).padStart(2, '0'), `left:${side === 'left' ? 90 : 700}px;top:150px;font:800 520px/1 'Bricolage Grotesque';letter-spacing:-.06em;color:transparent;-webkit-text-stroke:3px ${th === 'dark' ? 'rgba(246,241,231,.18)' : 'rgba(11,19,43,.14)'}`, g.el);
    numN.show(t0, 0.9, { from: { x: -120 }, ease: 'outx' });
    S.text('PARCOURS ' + num, `left:${side === 'left' ? 140 : 760}px;top:400px;font:800 28px 'Figtree';letter-spacing:.26em;color:${c.acc}`, g.el).show(t0 + 0.15, 0.6, { from: { y: 20 } });
    const fs = Math.max(100, Math.min(160, Math.floor(1010 / (title.length * 0.575))));
    S.line(title, `left:${side === 'left' ? 140 : 760}px;top:${440 + Math.round((160 - fs) * 0.4)}px;height:${Math.round(fs * 1.2)}px;width:1100px;font:800 ${fs}px/1.1 'Bricolage Grotesque';letter-spacing:-.035em;color:${c.fg}`, t0 + 0.3, { d: 0.9, parent: g.el });
    S.text(role, `left:${side === 'left' ? 146 : 766}px;top:650px;font:500 44px 'Figtree';color:${c.mute}`, g.el).show(t0 + 0.7, 0.7, { from: { y: 24 } });
    const px = side === 'left' ? 1180 : 120;
    const circ = S.div(`left:${px}px;top:200px;width:620px;height:620px;border-radius:50%;background:${th === 'dark' ? BLUE : ORANGE};overflow:hidden`, g.el);
    circ.set({ o: 0 }).k('o', [t0 + 0.1, 0], [t0 + 0.3, 1]).k('s', [t0 + 0.1, 0.3], [t0 + 1.0, 1, 'back']);
    // the portrait lives inside the circle, which clips it
    const ps = S.svg(portrait, `left:40px;top:100px;width:540px;height:608px;overflow:visible`, circ.el);
    ps.set({ o: 0 }).k('o', [t0 + 0.5, 0], [t0 + 0.8, 1]).k('y', [t0 + 0.5, 140], [t0 + 1.2, 0, 'outx']);
    const ring = S.div(`left:${px - 22}px;top:178px;width:664px;height:664px;border-radius:50%;border:5px solid ${ORANGE};border-top-color:transparent;border-left-color:transparent`, g.el);
    ring.set({ o: 0 }).k('o', [t0 + 0.6, 0], [t0 + 0.9, 1]).on((t, n, v) => {
      v.r = (t - t0) * 90;
    });
    g.k('y', [t1, 0], [t1 + 0.55, -H, 'in']).k('o', [t1 + 0.45, 1], [t1 + 0.56, 0]);
    return g;
  };

  /** four-digit 'tape' style counter helper */
  L.counter = (S, { x, y, from = 0, to, t0, t1, d = 0, size = 260, color, suffix = '', font = "800 {s}px 'Bricolage Grotesque'", parent = null }) => {
    const n = S.text('0', `left:${x}px;top:${y}px;font:${font.replace('{s}', size)};letter-spacing:-.045em;color:${color}`, parent);
    n.on((t) => {
      const p = clamp((t - t0) / (t1 - t0));
      n.el.innerHTML = L.fmt(lerp(from, to, E.out(p)), d) + suffix;
    });
    return n;
  };
  window.W_ = W;
})();
