/* Scenes 1-3: logo sting, the problem, the principle */
(function () {
  const { W, H, INK, PAPER, BLUE, ORANGE, WHITE, SKY, E, clamp, lerp } = ENG;
  const A = window.ASSETS, TLs = window.TL.scenes;
  const part = (id) => A.logoParts.find((p) => p.id === id);

  const ICON = {
    coins: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="32" cy="16" rx="20" ry="8"/><path d="M12 16v14c0 4.4 9 8 20 8s20-3.6 20-8V16"/><path d="M12 30v14c0 4.4 9 8 20 8s20-3.6 20-8V30"/></svg>`,
    camera: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="16" width="52" height="38" rx="8"/><path d="M22 16l4-7h12l4 7"/><circle cx="32" cy="35" r="10"/></svg>`,
    check: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="25"/><path d="M20 33l9 9 16-19"/></svg>`,
    send: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="5" width="32" height="54" rx="7"/><path d="M26 49h12"/><path d="M24 28h16M34 21l7 7-7 7"/></svg>`,
    shield: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 6l22 8v16c0 14-9 24-22 28C19 54 10 44 10 30V14z"/><path d="M22 32l8 8 13-15"/></svg>`,
    lens: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="18"/><path d="M42 42l16 16"/><path d="M20 28l6 6 11-12"/></svg>`,
  };
  window.ICON = ICON;

  /* ======================================================= 1. logo sting */
  {
    const sc = TLs.intro;
    const S = ENG.scene('intro', sc.start, sc.end);
    L.backdrop(S, 'dark');
    // floating dots
    let sd = 7;
    const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = rnd() * H, r = 3 + rnd() * 5, ph = rnd() * 6;
      const d = S.div(`left:${x}px;top:${y}px;width:${r}px;height:${r}px;border-radius:50%;background:${i % 5 === 0 ? ORANGE : 'rgba(169,190,255,.7)'}`);
      d.on((t, n, v) => {
        v.y = Math.sin(t * 0.6 + ph) * 26;
        v.o = 0.55 * clamp((t - 0.2) / 1.2);
      });
    }
    const g = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    const k = 1.78, lw = A.logoW * k, lh = 180 * k, lx = (W - lw) / 2, ly = 330 - 40 * k + 40;
    const mk = (id) => S.svg(`<svg viewBox="0 -40 ${A.logoW} 180" width="${lw}" height="${lh}" style="overflow:visible"><path d="${part(id).d}" fill="${id === 'key' ? ORANGE : PAPER}" fill-rule="evenodd"/></svg>`, `left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px`, g.el);
    const L1 = mk('archL'), R1 = mk('archR'), K = mk('key');
    L1.k('x', [0.3, -1100], [1.25, 0, 'outx']).k('o', [0.3, 0], [0.45, 1]);
    R1.k('x', [0.3, 1100], [1.25, 0, 'outx']).k('o', [0.3, 0], [0.45, 1]);
    K.k('y', [0.9, -900], [1.6, 0, 'bounce']).k('o', [0.9, 0], [1.0, 1]);
    // flash ring on the keystone
    const kc = { x: lx + 48 * k, y: ly + 52 * k };
    const fl = S.div(`left:${kc.x - 90}px;top:${kc.y - 90}px;width:180px;height:180px;border-radius:50%;border:6px solid ${ORANGE}`, g.el);
    fl.set({ o: 0 }).k('o', [1.5, 0.9], [2.3, 0, 'out']).k('s', [1.5, 0.2], [2.3, 3.2, 'out']);
    ['o', 'b', 'p', 'a', 'y'].forEach((id, i) => {
      const n = mk(id);
      n.k('y', [1.7 + i * 0.1, 160], [2.4 + i * 0.1, 0, 'outx']).k('o', [1.7 + i * 0.1, 0], [1.95 + i * 0.1, 1]);
    });
    S.line(`Investir au pays. <span style="font-family:'Instrument Serif';font-style:italic;font-weight:400;font-size:1.16em;color:${ORANGE}">Avec preuve.</span>`, `left:0;top:${ly + lh + 70}px;width:${W}px;height:96px;text-align:center;font:700 62px/96px 'Bricolage Grotesque';letter-spacing:-.02em;color:${PAPER}`, 3.0, { d: 0.9, parent: g.el }).el.style.textAlign = 'center';
    const chips = ['Étape par étape', 'Sur preuve', 'Payé directement'];
    const t1 = L.t('intro', 1);
    chips.forEach((c, i) => {
      const cx = W / 2 + (i - 1) * 440;
      const ch = S.text(c, `left:${cx - 190}px;top:${ly + lh + 215}px;width:380px;height:70px;border-radius:35px;background:rgba(246,241,231,.1);border:2px solid rgba(246,241,231,.28);color:${PAPER};font:700 30px/66px 'Figtree';text-align:center`, g.el);
      ch.show(t1 + 0.1 + i * 1.15, 0.6, { from: { y: 30, s: 0.85 } });
    });
    g.k('o', [sc.end - 0.5, 1], [sc.end, 0, 'in']).k('s', [sc.end - 0.5, 1], [sc.end, 1.08, 'in']);
  }

  /* ======================================================= 2. the problem */
  {
    const sc = TLs.probleme;
    const S = ENG.scene('probleme', sc.start, sc.end);
    L.backdrop(S, 'dark');
    L.chrome(S, 'dark', 'Le constat');
    const t0 = L.t('probleme', 0), t1 = L.t('probleme', 1), t2 = L.t('probleme', 2), t3 = L.t('probleme', 3), te = sc.end;
    const A0 = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    const e0 = t0 - 0.8;
    S.text('2025 · AFRIQUE', `left:130px;top:240px;font:800 24px 'Figtree';letter-spacing:.2em;color:${SKY}`, A0.el).show(e0, 0.6);
    const cnt = L.counter(S, { x: 124, y: 270, to: 124.2, t0: t0 + 0.2, t1: t0 + 2.6, d: 1, size: 300, color: PAPER, parent: A0.el });
    cnt.show(e0 + 0.2, 0.3, { from: { y: 0 } });
    S.text('Md$', `left:836px;top:436px;font:800 110px 'Bricolage Grotesque';color:${ORANGE}`, A0.el).show(e0 + 0.9, 0.6, { from: { x: -30, y: 0 } });
    S.text('envoyés vers l’Afrique par les migrants', `left:130px;top:610px;font:500 44px 'Figtree';color:${PAPER}`, A0.el).show(e0 + 1.1, 0.7);
    S.text('IFAD · Sending Money Home 2026', `left:130px;top:690px;font:600 24px 'Figtree';color:#9AA6C4;border:2px solid rgba(246,241,231,.25);border-radius:30px;padding:8px 20px`, A0.el).show(e0 + 1.4, 0.6);
    // dotted arc with coins, France -> Sénégal
    const ax = 1020, ay = 700, bx = 1740, by = 700, cx = 1380, cy = 160;
    S.svg(`<svg width="${W}" height="${H}"><path d="M${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}" fill="none" stroke="rgba(246,241,231,.55)" stroke-width="5" stroke-dasharray="2 18" stroke-linecap="round"/></svg>`, `left:0;top:0;width:${W}px;height:${H}px`, A0.el).show(e0 + 0.3, 0.8, { from: { y: 0 } });
    [['FRANCE', ax], ['SÉNÉGAL', bx]].forEach(([nm, x], i) => {
      S.div(`left:${x - 16}px;top:${ay - 16}px;width:32px;height:32px;border-radius:50%;background:${i ? ORANGE : SKY};border:5px solid ${INK}`, A0.el).show(e0 + 0.4, 0.5, { from: { y: 0, s: 0.2 } });
      S.text(nm, `left:${x - 80}px;top:${ay + 34}px;width:160px;text-align:center;font:800 24px 'Figtree';letter-spacing:.14em;color:${PAPER}`, A0.el).show(e0 + 0.6, 0.5);
    });
    for (let i = 0; i < 7; i++) {
      const c = S.div(`left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;background:${ORANGE};border:6px solid #FFC37A;box-shadow:0 6px 18px rgba(0,0,0,.35)`, A0.el);
      c.on((t, n, v) => {
        const p = (((t - t0) * 0.28 + i / 7) % 1 + 1) % 1;
        const u = 1 - p;
        v.x = u * u * ax + 2 * u * p * cx + p * p * bx;
        v.y = u * u * ay + 2 * u * p * cy + p * p * by;
        v.o = clamp((t - e0 - 0.9) / 0.5) * Math.sin(Math.PI * p) ** 0.4;
        v.s = 0.7 + 0.5 * Math.sin(Math.PI * p);
      });
    }
    A0.k('o', [t1 - 0.2, 1], [t1 + 0.3, 0, 'in']).k('x', [t1 - 0.2, 0], [t1 + 0.3, -160, 'in']);

    // 25 % ring
    const B1 = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    B1.set({ o: 0 }).k('o', [t1 + 0.3, 0], [t1 + 0.75, 1]);
    const rx = 430, ry = 560, rr = 205, circ = 2 * Math.PI * rr;
    const ring = S.svg(`<svg width="640" height="640" viewBox="0 0 640 640" style="overflow:visible"><circle cx="320" cy="320" r="${rr}" fill="none" stroke="#26335C" stroke-width="58"/><circle id="rg" cx="320" cy="320" r="${rr}" fill="none" stroke="${ORANGE}" stroke-width="58" stroke-linecap="butt" stroke-dasharray="0 ${circ}" transform="rotate(-90 320 320)"/></svg>`, `left:${rx - 320}px;top:${ry - 320}px;width:640px;height:640px`, B1.el);
    ring.on((t) => {
      const p = E.out(clamp((t - (t1 + 0.4)) / 1.6));
      ring.el.querySelector('#rg').setAttribute('stroke-dasharray', `${circ * 0.25 * p} ${circ}`);
    });
    const pc = L.counter(S, { x: rx - 128, y: ry - 94, to: 25, t0: t1 + 0.4, t1: t1 + 2.0, size: 150, color: PAPER, suffix: '<span style="font-size:.5em;color:' + ORANGE + '"> %</span>', parent: B1.el });
    pc.set({ o: 1 });
    const qs = (html, top, t) => S.line(html, `left:800px;top:${top}px;height:92px;width:1100px;font:800 74px/92px 'Bricolage Grotesque';letter-spacing:-.03em;color:${PAPER}`, t, { parent: B1.el });
    qs('Seul un quart', 340, t1 + 0.3);
    qs('des transferts finance', 432, t1 + 0.4);
    qs(`<span style="color:${ORANGE}">un logement, la santé,</span>`, 524, t1 + 0.5);
    qs('l’éducation ou un commerce.', 616, t1 + 0.6);
    S.text('Le reste couvre le quotidien · IFAD 2026 via ONU Info', `left:804px;top:752px;font:600 26px 'Figtree';color:#9AA6C4`, B1.el).show(t1 + 1.6, 0.7);
    S.text('≈ 75 %', `left:${rx - 66}px;top:${ry + rr + 56}px;font:800 42px 'Figtree';color:#9AA6C4`, B1.el).show(t1 + 1.8, 0.6);
    B1.k('o', [t2 - 0.2, 1], [t2 + 0.3, 0, 'in']).k('s', [t2 - 0.2, 1], [t2 + 0.3, 0.94, 'in']);

    // the sentence
    const C2 = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    const l1 = S.line(`Un virement <span class="pv" style="background:linear-gradient(${ORANGE},${ORANGE}) no-repeat 0 100%/0% 16px">prouve</span>`, `left:150px;top:350px;height:170px;width:1700px;font:800 146px/170px 'Bricolage Grotesque';letter-spacing:-.04em;color:${PAPER}`, t2 + 0.05, { d: 0.8, parent: C2.el });
    S.line('que l’argent est parti.', `left:150px;top:530px;height:170px;width:1700px;font:800 146px/170px 'Bricolage Grotesque';letter-spacing:-.04em;color:${PAPER}`, t2 + 0.2, { d: 0.8, parent: C2.el });
    l1.inner.on((t, n) => {
      n.el.querySelector('.pv').style.backgroundSize = `${E.outx(clamp((t - (t2 + 1.1)) / 0.7)) * 100}% 16px`;
    });
    C2.set({ o: 0 }).k('o', [t2 + 0.0, 0], [t2 + 0.05, 1]).k('o', [t3 - 0.15, 1], [t3 + 0.3, 0, 'in']).k('y', [t3 - 0.15, 0], [t3 + 0.3, -70, 'in']);

    // the keystone missing
    const D3 = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    D3.set({ o: 0 }).k('o', [t3, 0], [t3 + 0.25, 1]);
    S.line('Pas que la maison', `left:130px;top:350px;height:180px;width:1240px;font:italic 400 156px/180px 'Instrument Serif',serif;letter-spacing:-.01em;color:${PAPER}`, t3 + 0.05, { d: 0.9, parent: D3.el });
    S.line('existe.', `left:130px;top:520px;height:180px;width:1240px;font:italic 400 156px/180px 'Instrument Serif',serif;letter-spacing:-.01em;color:${PAPER}`, t3 + 0.25, { d: 0.9, parent: D3.el });
    const ak = 3.4, aw = 96 * ak;
    const mkp = (id, fill) => S.svg(`<svg viewBox="0 -2 96 102" width="${aw}" height="${102 * ak}" style="overflow:visible"><path d="${part(id).d}" fill="${fill}"/></svg>`, `left:1400px;top:300px;width:${aw}px;height:${102 * ak}px`, D3.el);
    const aL = mkp('archL', PAPER), aR = mkp('archR', PAPER), aK = mkp('key', ORANGE);
    aL.k('x', [t3 + 0.1, 300], [t3 + 0.9, 0, 'outx']).k('o', [t3 + 0.1, 0], [t3 + 0.3, 1]);
    aR.k('x', [t3 + 0.1, 300], [t3 + 0.9, 0, 'outx']).k('o', [t3 + 0.1, 0], [t3 + 0.3, 1]);
    aK.k('o', [t3 + 0.6, 0], [t3 + 0.9, 1]).on((t, n, v) => {
      v.y = -150 + Math.sin(t * 2.2) * 16;
      v.x = 60 + Math.cos(t * 1.4) * 14;
      v.r = 18 + Math.sin(t * 1.6) * 7;
    });
    S.text('?', `left:1524px;top:470px;font:800 150px 'Bricolage Grotesque';color:rgba(246,241,231,.18)`, D3.el).show(t3 + 1.2, 0.8);
  }

  /* ======================================================= 3. the principle */
  {
    const sc = TLs.principe;
    const S = ENG.scene('principe', sc.start, sc.end);
    L.backdrop(S, 'light');
    L.chrome(S, 'light', 'Le principe');
    const t0 = L.t('principe', 0), t1 = L.t('principe', 1), t2 = L.t('principe', 2), t3 = L.t('principe', 3);
    L.block(S, 'light', { x: 130, y: 290, w: 1300, kick: 'Le principe', lines: ['Un séquestre qui se', 'libère sur preuve.'], size: 120, t0: t0 - 0.9, t1: t1 - 0.1 });
    // vault -> steps -> supplier
    const D = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    D.set({ o: 0 }).k('o', [t1 - 0.1, 0], [t1 + 0.4, 1]).k('o', [t2 - 0.2, 1], [t2 + 0.3, 0, 'in']);
    const lineY = 560, x0 = 330, x1 = 1590;
    S.div(`left:${x0}px;top:${lineY - 3}px;width:${x1 - x0}px;height:6px;border-radius:3px;background:rgba(11,19,43,.18)`, D.el);
    const fill = S.div(`left:${x0}px;top:${lineY - 3}px;width:${x1 - x0}px;height:6px;border-radius:3px;background:${BLUE};transform-origin:0 50%`, D.el);
    const dur1 = TLs.principe.first && L.e('principe', 1) - t1;
    fill.set({ sx: 0 }).k('sx', [t1 + 0.3, 0], [t1 + 0.3 + dur1 * 0.8, 1, 'lin']);
    S.div(`left:150px;top:${lineY - 100}px;width:200px;height:200px;border-radius:36px;background:${INK};box-shadow:0 20px 50px rgba(11,19,43,.3)`, D.el);
    S.svg(ICON.coins, `left:190px;top:${lineY - 62}px;width:120px;height:120px;color:${ORANGE}`, D.el);
    S.text('SÉQUESTRE', `left:150px;top:${lineY + 116}px;width:200px;text-align:center;font:800 26px 'Figtree';letter-spacing:.14em;color:${INK}`, D.el);
    S.div(`left:1570px;top:${lineY - 100}px;width:200px;height:200px;border-radius:36px;background:${WHITE};box-shadow:0 20px 50px rgba(11,19,43,.18)`, D.el);
    S.svg(ICON.send, `left:1610px;top:${lineY - 62}px;width:120px;height:120px;color:${BLUE}`, D.el);
    S.text('FOURNISSEUR', `left:1570px;top:${lineY + 116}px;width:200px;text-align:center;font:800 26px 'Figtree';letter-spacing:.14em;color:${INK}`, D.el);
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const sx = lerp(x0 + 150, x1 - 150, i / (steps - 1));
      const tp = t1 + 0.5 + dur1 * (0.12 + i * 0.3);
      const dot = S.div(`left:${sx - 46}px;top:${lineY - 46}px;width:92px;height:92px;border-radius:50%;background:${WHITE};border:6px solid ${INK};box-shadow:0 12px 30px rgba(11,19,43,.2)`, D.el);
      dot.set({ o: 0 }).k('o', [t1 + 0.4 + i * 0.1, 0], [t1 + 0.7 + i * 0.1, 1]).k('s', [t1 + 0.4 + i * 0.1, 0.4], [t1 + 0.9 + i * 0.1, 1, 'back']);
      S.text(`Étape ${i + 1}`, `left:${sx - 80}px;top:${lineY - 150}px;width:160px;text-align:center;font:800 30px 'Figtree';color:${INK}`, D.el).show(t1 + 0.5 + i * 0.1, 0.5);
      const bg = S.div(`left:${sx - 46}px;top:${lineY - 46}px;width:92px;height:92px;border-radius:50%;background:#2FA84F`, D.el);
      const ck = S.svg(ICON.check, `left:${sx - 36}px;top:${lineY - 36}px;width:72px;height:72px;color:#fff`, D.el);
      bg.set({ o: 0 }).k('o', [tp, 0], [tp + 0.25, 1]).k('s', [tp, 0.3], [tp + 0.5, 1, 'back']);
      ck.set({ o: 0 }).k('o', [tp + 0.1, 0], [tp + 0.3, 1]);
      const coin = S.div(`left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;background:${ORANGE};border:7px solid #FFC37A;box-shadow:0 8px 20px rgba(0,0,0,.3)`, D.el);
      coin.on((t, n, v) => {
        const p = clamp((t - tp - 0.2) / 1.4);
        v.o = p > 0 && p < 1 ? 1 : 0;
        const e = E.io(p);
        v.x = lerp(250, 1670, e);
        v.y = lineY - Math.sin(Math.PI * e) * 190;
        v.s = 0.8 + 0.4 * Math.sin(Math.PI * e);
      });
    }
    // five gestures
    const F = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    F.set({ o: 0 }).k('o', [t2 - 0.1, 0], [t2 + 0.35, 1]).k('o', [t3 - 0.2, 1], [t3 + 0.3, 0, 'in']);
    S.line('Cinq gestes, un seul parcours.', `left:130px;top:230px;height:110px;width:1700px;font:800 92px/110px 'Bricolage Grotesque';letter-spacing:-.03em;color:${INK}`, t2 + 0.05, { parent: F.el });
    const gestes = [['Financer', 'coins'], ['Prouver', 'camera'], ['Valider', 'check'], ['Payer', 'send'], ['Vérifier', 'shield']];
    const d2 = L.e('principe', 2) - t2;
    S.div(`left:260px;top:612px;width:1400px;height:5px;background:rgba(11,19,43,.16)`, F.el);
    const bar = S.div(`left:260px;top:612px;width:1400px;height:5px;background:${ORANGE};transform-origin:0 50%`, F.el);
    bar.set({ sx: 0 }).k('sx', [t2 + 0.2, 0], [t2 + d2 * 0.92, 1, 'lin']);
    gestes.forEach(([nm, ic], i) => {
      const cx = 260 + i * 350;
      const ts = t2 + 0.15 + (i * d2 * 0.9) / 5;
      const c = S.div(`left:${cx - 100}px;top:${512}px;width:200px;height:200px;border-radius:50%;background:${i === 4 ? INK : WHITE};box-shadow:0 22px 50px rgba(11,19,43,.2)`, F.el);
      c.set({ o: 0 }).k('o', [ts, 0], [ts + 0.25, 1]).k('s', [ts, 0.3], [ts + 0.7, 1, 'back']);
      const ico = S.svg(ICON[ic], `left:${cx - 54}px;top:${566}px;width:108px;height:108px;color:${i === 4 ? ORANGE : BLUE}`, F.el);
      ico.set({ o: 0 }).k('o', [ts + 0.1, 0], [ts + 0.4, 1]).k('s', [ts + 0.1, 0.4], [ts + 0.7, 1, 'back']);
      S.text(nm, `left:${cx - 140}px;top:${742}px;width:280px;text-align:center;font:800 44px 'Bricolage Grotesque';color:${INK}`, F.el).show(ts + 0.15, 0.5);
      S.text(String(i + 1), `left:${cx - 20}px;top:${440}px;width:40px;text-align:center;font:800 26px 'Figtree';color:${BLUE}`, F.el).show(ts + 0.1, 0.5);
    });
    // actors
    const Ac = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    Ac.set({ o: 0 }).k('o', [t3 - 0.05, 0], [t3 + 0.4, 1]);
    S.line('Cinq personnes, cinq parcours.', `left:130px;top:210px;height:110px;width:1700px;font:800 92px/110px 'Bricolage Grotesque';letter-spacing:-.03em;color:${INK}`, t3 + 0.05, { parent: Ac.el });
    const actors = [['Le financeur', 'moussa'], ['La personne sur place', 'mamadou'], ['Le fournisseur', 'fournisseur'], ['Le vérificateur', null], ['L’administrateur', 'admin']];
    const d3 = L.e('principe', 3) - t3;
    actors.forEach(([nm, pk], i) => {
      const cx = 260 + i * 350;
      const ts = t3 + 0.25 + i * Math.min(0.5, d3 * 0.12);
      const disc = S.div(`left:${cx - 125}px;top:420px;width:250px;height:250px;border-radius:50%;background:${i % 2 ? ORANGE : BLUE};overflow:hidden`, Ac.el);
      disc.set({ o: 0 }).k('o', [ts, 0], [ts + 0.25, 1]).k('s', [ts, 0.3], [ts + 0.7, 1, 'back']);
      if (pk) {
        const p = S.svg(A.portraits[pk], `left:0;top:50px;width:250px;height:282px`, disc.el);
        p.set({ o: 0 }).k('o', [ts + 0.15, 0], [ts + 0.4, 1]).k('y', [ts + 0.15, 90], [ts + 0.7, 0, 'outx']);
      } else {
        const ic = S.svg(ICON.lens, `left:45px;top:45px;width:160px;height:160px;color:#fff`, disc.el);
        ic.set({ o: 0 }).k('o', [ts + 0.15, 0], [ts + 0.4, 1]).k('s', [ts + 0.15, 0.4], [ts + 0.7, 1, 'back']);
      }
      S.text(nm, `left:${cx - 170}px;top:700px;width:340px;text-align:center;font:800 33px/1.2 'Figtree';color:${INK}`, Ac.el).show(ts + 0.2, 0.5);
    });
  }
})();
