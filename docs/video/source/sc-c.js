/* Scenes 7-11: supplier receipt, proof and verification, admin, Bitnob under the hood, outro. Then the transitions. */
(function () {
  const { W, H, INK, PAPER, BLUE, ORANGE, WHITE, SKY, E, clamp, lerp } = ENG;
  const A = window.ASSETS, TLs = window.TL.scenes, TL = window.TL;
  const ICON = window.ICON;
  const iconPane = (svg, color = '#fff') => `<div style="width:540px;height:608px;display:flex;align-items:center;justify-content:center;color:${color}"><div style="width:300px;height:300px">${svg}</div></div>`;
  const Tm = (id, k) => ({ s: L.t(id, k), d: L.e(id, k) - L.t(id, k), e: L.e(id, k) });

  /* ======================================================= 7. the supplier */
  {
    const sc = TLs.fournisseur;
    const S = ENG.scene('fournisseur', sc.start, sc.end);
    L.backdrop(S, 'dark');
    L.chrome(S, 'dark', 'Parcours 3 · Le fournisseur');
    const f0 = Tm('fournisseur', 0), f1 = Tm('fournisseur', 1), f2 = Tm('fournisseur', 2);
    L.chapter(S, 'dark', { num: 3, title: 'Le fournisseur', role: 'Cabinet Fall, géomètre · sans compte', portrait: A.portraits.fournisseur, t0: sc.start + 0.7, t1: f0.e + 0.0, side: 'left' });
    const P = L.phone(S, { cx: 1250, cy: 556, k: 1, t0: f1.s - 0.4, t1: sc.end - 0.9, from: 'bottom' });
    const ca = (o) => {
      const a = P.pt(o.px, o.py);
      return L.callout(S, { ax: a.x, ay: a.y, tx: 1500, ty: o.ty ?? a.y - 40, w: o.w ?? 400, side: 'l', ...o });
    };
    L.block(S, 'dark', { x: 130, y: 300, w: 860, size: 84, kick: 'Étape 6', lines: ['Un lien de reçu.'], sub: 'Envoyé par WhatsApp. Aucun compte à créer.', t0: f1.s, t1: sc.end - 1.0 });
    // WhatsApp bubble
    const wa = S.g(`left:130px;top:620px;width:700px;height:176px`);
    wa.set({ o: 0 }).k('o', [f1.s + 0.5, 0], [f1.s + 0.85, 1]).k('y', [f1.s + 0.5, 60], [f1.s + 1.2, 0, 'outx']);
    S.div(`left:0;top:0;width:700px;height:176px;border-radius:26px 26px 26px 6px;background:#DCF8C6;box-shadow:0 24px 60px rgba(0,0,0,.35)`, wa.el).el.innerHTML = `<div style="padding:24px 30px;font:500 28px/1.38 Figtree;color:#0B132B">Bonjour Cabinet Fall, voici le reçu de votre paiement NobPay :<br><span style="color:#1D4ED8;font-weight:700;text-decoration:underline">nobpay.app/recu/p_3f9a…</span></div>`;
    P.screen('g1-receipt', f1.s - 0.1, { mode: 'up' });
    P.tap(f1.s + 0.8 * f1.d, 195, 300);
    ca({ text: '912 000 FCFA', sub: 'montant reçu · paiement envoyé', px: 195, py: 255, t0: f2.s + 0.05 * f2.d, t1: f2.s + 0.33 * f2.d, ty: 190, tone: 'orange' });
    ca({ text: 'Numéro masqué', sub: '+221 77 ••• •• 10 · Orange Money', px: 195, py: 462, t0: f2.s + 0.36 * f2.d, t1: f2.s + 0.66 * f2.d, ty: 400 });
    ca({ text: 'Référence et date', sub: 'à donner en cas de souci', px: 195, py: 540, t0: f2.s + 0.68 * f2.d, t1: f2.e + 0.1, ty: 540 });
  }

  /* ======================================================= 8. proof and verification */
  {
    const sc = TLs.preuve;
    const S = ENG.scene('preuve', sc.start, sc.end);
    L.backdrop(S, 'light');
    L.chrome(S, 'light', 'Parcours 4 · La preuve');
    const q0 = Tm('preuve', 0), q1 = Tm('preuve', 1), q2 = Tm('preuve', 2), q3 = Tm('preuve', 3);
    L.chapter(S, 'light', { num: 4, title: 'La preuve', role: 'Registre, ancrage Bitcoin, vérification', portrait: iconPane(ICON.shield), t0: sc.start + 0.7, t1: q0.e + 0.0, side: 'right' });
    const P = L.phone(S, { cx: 1260, cy: 556, k: 1, t0: q1.s - 0.15, t1: q3.s - 0.1, from: 'bottom' });
    const ca = (o) => {
      const a = P.pt(o.px, o.py);
      return L.callout(S, { ax: a.x, ay: a.y, tx: 1500, ty: o.ty ?? a.y - 40, w: o.w ?? 400, side: 'l', ...o });
    };
    // hash chain, left
    const Gc = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    Gc.k('o', [q2.s - 0.3, 1], [q2.s + 0.1, 0, 'in']);
    S.text('REGISTRE ENCHAÎNÉ', `left:130px;top:200px;font:800 22px 'Figtree';letter-spacing:.2em;color:${BLUE}`, Gc.el).show(q1.s, 0.5);
    const ev = [['Projet créé', '3b4d9e…f0a1'], ['Fonds reçus en séquestre', '9ac207…44be'], ['Preuve envoyée', 'e41f3a…07c9'], ['Étape validée', '5d88b1…a3e2'], ['Paiement lancé', 'c0712f…9d15'], ['Paiement confirmé', '7be4a6…1c38']];
    ev.forEach(([nm, h], i) => {
      const y = 260 + i * 118;
      const ts = q1.s + 0.25 + i * Math.min(0.55, q1.d * 0.1);
      const b = S.div(`left:130px;top:${y}px;width:820px;height:92px;border-radius:20px;background:${WHITE};box-shadow:0 16px 40px rgba(11,19,43,.12);border-left:12px solid ${i === 5 ? ORANGE : BLUE}`, Gc.el);
      b.el.innerHTML = `<div style="position:absolute;left:34px;top:14px;font:800 30px 'Figtree';color:${INK}">${nm}</div><div style="position:absolute;left:34px;top:54px;font:600 20px Consolas,monospace;color:#5C6478">N° ${i + 1} · empreinte ${h}</div><div style="position:absolute;right:30px;top:24px;font:800 28px Consolas,monospace;color:${BLUE}">⛓</div>`;
      b.set({ o: 0 }).k('o', [ts, 0], [ts + 0.3, 1]).k('x', [ts, -140], [ts + 0.6, 0, 'outx']);
      if (i < ev.length - 1) {
        const lk = S.div(`left:${130 + 400}px;top:${y + 92}px;width:6px;height:26px;background:${ORANGE}`, Gc.el);
        lk.set({ o: 0, sy: 0 }).k('o', [ts + 0.25, 0], [ts + 0.3, 1]).k('sy', [ts + 0.25, 0], [ts + 0.5, 1, 'out']);
        lk.el.style.transformOrigin = '50% 0';
      }
    });
    P.screen('h3-certificate', q1.s - 0.1, { mode: 'up' });
    P.screen('h3-certificate-full', q1.s + 0.4 * q1.d, { mode: 'fade', scroll: [0, 330, q1.s + 0.45 * q1.d, q1.e - 0.1, 'io'] });
    ca({ text: 'Registre intact', sub: '6 événements enchaînés', px: 195, py: 190, t0: q1.s + 0.2 * q1.d, t1: q1.s + 0.45 * q1.d, ty: 130 });
    // anchoring, left
    const Ga = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    Ga.set({ o: 0 }).k('o', [q2.s - 0.05, 0], [q2.s + 0.4, 1]);
    S.line('On ancre l’empreinte,', `left:130px;top:210px;height:100px;width:1000px;font:800 80px/100px 'Bricolage Grotesque';letter-spacing:-.03em;color:${INK}`, q2.s + 0.1, { parent: Ga.el });
    S.line('pas le dossier.', `left:130px;top:300px;height:100px;width:1000px;font:800 80px/100px 'Bricolage Grotesque';letter-spacing:-.03em;color:${BLUE}`, q2.s + 0.25, { parent: Ga.el });
    const nodes = [['Registre du projet', 'six événements enchaînés', INK, WHITE], ['Empreinte SHA-256', 'une seule ligne de 64 caractères', BLUE, WHITE], ['OpenTimestamps', 'calendriers publics', WHITE, INK], ['Bloc Bitcoin', 'confirmation en quelques heures', ORANGE, INK]];
    nodes.forEach(([a, b2, bg, fg], i) => {
      const y = 450 + i * 124;
      const ts = q2.s + 0.5 + i * Math.min(0.9, q2.d * 0.17);
      const nd = S.div(`left:130px;top:${y}px;width:760px;height:92px;border-radius:22px;background:${bg};box-shadow:0 18px 44px rgba(11,19,43,.2)`, Ga.el);
      nd.el.innerHTML = `<div style="position:absolute;left:34px;top:0;height:92px;display:flex;align-items:center;font:800 36px 'Bricolage Grotesque';color:${fg}">${a}</div><div style="position:absolute;right:34px;top:0;height:92px;display:flex;align-items:center;font:500 22px Figtree;color:${fg};opacity:.75">${b2}</div>`;
      nd.set({ o: 0 }).k('o', [ts, 0], [ts + 0.3, 1]).k('s', [ts, 0.8], [ts + 0.6, 1, 'back']);
      if (i < 3) {
        const ar = S.text('↓', `left:490px;top:${y + 84}px;width:40px;text-align:center;font:800 40px/40px 'Bricolage Grotesque';color:${ORANGE}`, Ga.el);
        ar.show(ts + 0.45, 0.4, { from: { y: -10 } });
      }
    });
    Ga.k('o', [q3.s - 0.15, 1], [q3.s + 0.3, 0, 'in']);
    const tcA = L.tapAt('Ancrer');
    P.tap(q2.s + 0.12 * q2.d, 195, 554);
    P.screen('h4-anchored', q2.s + 0.25 * q2.d, { mode: 'zoom' });
    ca({ text: 'Ancrage envoyé', sub: 'en attente d’un bloc Bitcoin', px: 195, py: 530, t0: q2.s + 0.5 * q2.d, t1: q2.e + 0.1, ty: 470, tone: 'orange' });
    // public verification, laptop
    const LP = L.laptop(S, { cx: 830, cy: 650, w: 1080, t0: q3.s - 0.1, t1: sc.end - 0.9, from: 'bottom' });
    LP.screen('z6-verify-desktop', q3.s + 0.0, { mode: 'zoom' });
    L.block(S, 'light', { x: 130, y: 120, w: 1500, size: 70, kick: 'Sans compte', lines: ['Tout le monde peut vérifier.'], t0: q3.s + 0.1, t1: sc.end - 1.0 });
    const cl = (o) => {
      const a = LP.pt(o.px, o.py);
      return L.callout(S, { ax: a.x, ay: a.y, tx: 1500, ty: o.ty, w: 400, side: 'l', ...o });
    };
    cl({ text: 'Le dossier n’a pas changé', sub: 'empreinte recalculée', px: 700, py: 232, t0: q3.s + 0.25 * q3.d, t1: q3.s + 0.5 * q3.d, ty: 330 });
    cl({ text: 'Le registre est intact', sub: '6 événements enchaînés', px: 700, py: 308, t0: q3.s + 0.5 * q3.d, t1: q3.s + 0.76 * q3.d, ty: 330 });
    cl({ text: 'Empreinte ancrée', sub: 'dans la blockchain Bitcoin', px: 700, py: 388, t0: q3.s + 0.76 * q3.d, t1: q3.e + 0.1, ty: 330, tone: 'orange' });
  }

  /* ======================================================= 9. the administrator */
  {
    const sc = TLs.admin;
    const S = ENG.scene('admin', sc.start, sc.end);
    L.backdrop(S, 'dark');
    L.chrome(S, 'dark', 'Parcours 5 · L’administrateur');
    const a0 = Tm('admin', 0), a1 = Tm('admin', 1), a2 = Tm('admin', 2);
    L.chapter(S, 'dark', { num: 5, title: 'L’administrateur', role: 'Lecture seule · aucun mouvement d’argent', portrait: A.portraits.admin, t0: sc.start + 0.7, t1: a0.e + 0.0, side: 'left' });
    const LP = L.laptop(S, { cx: 900, cy: 640, w: 1100, t0: a1.s - 0.4, t1: sc.end - 0.9, from: 'bottom' });
    LP.screen('z5-admin-desktop', a1.s + 0.0, { mode: 'zoom' });
    LP.screen('z5-admin-desktop-full', a2.s + 0.0, { mode: 'fade', scroll: [0, 120, a2.s + 0.1, a2.s + 0.2], });
    const cl = (o) => {
      const a = LP.pt(o.px, o.py);
      return L.callout(S, { ax: a.x, ay: a.y, tx: 1500, ty: o.ty, w: 400, side: 'l', ...o });
    };
    L.block(S, 'dark', { x: 130, y: 120, w: 1500, size: 66, kick: 'Tableau de bord', lines: ['Tout voir, rien déplacer.'], t0: a1.s + 0.1, t1: a2.s + 0.4 });
    cl({ text: 'Chiffres clés', sub: 'comptes · projets · paiements', px: 700, py: 215, t0: a1.s + 0.25 * a1.d, t1: a1.s + 0.6 * a1.d, ty: 300 });
    cl({ text: 'Lecture seule', sub: 'jamais de mouvement d’argent', px: 345, py: 102, t0: a1.s + 0.62 * a1.d, t1: a1.e + 0.1, ty: 300 });
    L.block(S, 'dark', { x: 130, y: 120, w: 1500, size: 66, kick: 'Alertes', lines: ['Ce qui se bloque.'], t0: a2.s + 0.4, t1: sc.end - 1.0 });
    cl({ text: 'À surveiller', sub: 'paiement coincé, ancrage en retard', px: 850, py: 215, t0: a2.s + 0.2 * a2.d, t1: a2.s + 0.55 * a2.d, ty: 300, tone: 'orange' });
    cl({ text: 'Paiements fournisseurs', sub: 'statut, montant, référence', px: 877, py: 343, t0: a2.s + 0.58 * a2.d, t1: a2.e + 0.1, ty: 300 });
  }

  /* ======================================================= 10. Bitnob under the hood */
  {
    const sc = TLs.bitnob;
    const S = ENG.scene('bitnob', sc.start, sc.end);
    L.backdrop(S, 'dark');
    L.chrome(S, 'dark', 'Sous le capot');
    const b0 = Tm('bitnob', 0), b1 = Tm('bitnob', 1), b2 = Tm('bitnob', 2);
    L.block(S, 'dark', { x: 110, y: 120, w: 1700, size: 92, kick: 'L’API Bitnob', lines: ['Le moteur des paiements.'], t0: b0.s - 0.8, t1: sc.end - 1.0 });
    const box = (x, y, w, h, title, sub, bg, fg, ts, o = {}) => {
      const n = S.div(`left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:24px;background:${bg};box-shadow:0 20px 50px rgba(0,0,0,.35);${o.css || ''}`);
      n.el.innerHTML = `<div style="padding:0 28px;height:100%;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box"><div style="font:800 ${o.font || 36}px 'Bricolage Grotesque';color:${fg}">${title}</div><div style="font:500 21px/1.3 Figtree;color:${fg};opacity:.78;margin-top:6px">${sub}</div></div>`;
      n.set({ o: 0 }).k('o', [ts, 0], [ts + 0.3, 1]).k('s', [ts, 0.7], [ts + 0.7, 1, 'back']);
      return n;
    };
    const y0 = 434, yc = y0 + 95;
    box(80, y0, 300, 190, 'Navigateur', 'financeur · équipe · fournisseur', 'rgba(246,241,231,.1)', PAPER, b0.s + 0.2);
    box(490, y0, 360, 190, 'Serveur NobPay', 'règles · séquestre · registre', BLUE, WHITE, b0.s + 0.7);
    const api = box(1040, y0, 320, 190, '', 'une seule interface', '#0F1B3D', PAPER, b0.s + 1.2, { css: `border:3px solid ${ORANGE}` });
    api.el.firstChild.firstChild.innerHTML = `<img src="assets/logos/bitnob-logo-white.svg" style="height:46px;margin-bottom:4px">`;
    const arrow = (x1, x2, y, color, ts, label, labelDy = -34, rev = false) => {
      const ln = S.div(`left:${x1}px;top:${y - 2}px;width:${x2 - x1}px;height:5px;background:${color};transform-origin:${rev ? '100%' : '0'} 50%`);
      ln.set({ sx: 0 }).k('sx', [ts, 0], [ts + 0.5, 1, 'out']);
      const hd = S.div(`left:${rev ? x1 - 8 : x2 - 14}px;top:${y - 12}px;width:0;height:0;border:12px solid transparent;${rev ? `border-right:20px solid ${color};border-left:0` : `border-left:20px solid ${color};border-right:0`}`);
      hd.set({ o: 0 }).k('o', [ts + 0.4, 0], [ts + 0.5, 1]);
      if (label) S.text(label, `left:${x1}px;top:${y + labelDy}px;width:${x2 - x1}px;text-align:center;font:700 18px 'Figtree';color:${color === ORANGE ? ORANGE : '#C9D1E8'}`).show(ts + 0.3, 0.5);
      const dt = S.div(`left:-9px;top:${y - 9}px;width:18px;height:18px;border-radius:50%;background:${color}`);
      dt.on((t, n, v) => {
        const p = (((t - ts) * 0.55) % 1 + 1) % 1;
        v.o = t > ts + 0.6 ? 1 : 0;
        v.x = rev ? lerp(x2, x1, p) : lerp(x1, x2, p);
      });
    };
    arrow(380, 490, yc, PAPER, b0.s + 0.9);
    arrow(850, 1040, yc - 24, PAPER, b0.s + 1.4, 'appels signés', -36);
    arrow(850, 1040, yc + 30, ORANGE, b0.s + 1.6, 'webhooks signés', 18, true);
    const rails = [['Lightning', 'factures Bitcoin en entrée', 327], ['Conversion', 'bitcoin vers stablecoin', 467], ['Mobile money', 'Wave · Orange · Free · Expresso', 607]];
    // bus from the API to the three rails
    arrow(1360, 1410, yc, SKY, b1.s + 0.1);
    const bus = S.div(`left:1408px;top:${327 + 62}px;width:5px;height:${607 - 327}px;background:${SKY};transform-origin:50% 50%`);
    bus.set({ sy: 0 }).k('sy', [b1.s + 0.3, 0], [b1.s + 0.8, 1, 'out']);
    rails.forEach(([t, s2, y], i) => {
      const ts = b1.s + 0.5 + i * Math.min(1.3, b1.d * 0.2);
      const last = i === 2;
      box(1490, y, 360, 124, t, s2, last ? ORANGE : 'rgba(246,241,231,.12)', last ? INK : PAPER, ts, { font: 31 });
      arrow(1410, 1490, y + 62, last ? ORANGE : SKY, ts, '', 0);
    });
    const badges = ['Clés côté serveur uniquement', 'HMAC-SHA256 sur chaque appel', 'Webhooks HMAC-SHA512 · rejeu bloqué'];
    badges.forEach((b, i) => {
      const ts = b1.s + 0.9 + i * Math.min(1.6, b1.d * 0.24) + b1.d * 0.3;
      S.text(b, `left:${110 + i * 600}px;top:760px;width:560px;height:64px;border-radius:32px;border:2px solid rgba(246,241,231,.3);font:700 24px/60px 'Figtree';color:${PAPER};text-align:center`).show(ts, 0.5, { from: { y: 30, s: 0.9 } });
    });
    const fin = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    fin.set({ o: 0 }).k('o', [b2.s - 0.05, 0], [b2.s + 0.35, 1]);
    S.div(`left:0;top:880px;width:${W}px;height:200px;background:${ORANGE}`, fin.el).k('y', [b2.s - 0.05, 200], [b2.s + 0.6, 0, 'outx']);
    S.line('Bitnob déplace l’argent. <span style="font-family:\'Instrument Serif\';font-style:italic;font-weight:400;font-size:1.18em">NobPay décide quand.</span>', `left:0;top:920px;width:${W}px;height:120px;text-align:center;font:800 76px/120px 'Bricolage Grotesque';letter-spacing:-.03em;color:${INK}`, b2.s + 0.25, { parent: fin.el }).el.style.textAlign = 'center';
  }

  /* ======================================================= 11. outro */
  {
    const sc = TLs.outro;
    const S = ENG.scene('outro', sc.start, sc.end);
    L.backdrop(S, 'dark');
    const o0 = Tm('outro', 0), o1 = Tm('outro', 1);
    const part = (id) => A.logoParts.find((p) => p.id === id);
    const g = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    const k = 1.55, lw = A.logoW * k, lh = 180 * k, lx = (W - lw) / 2, ly = 250 - 40 * k + 40;
    const mk = (id) => S.svg(`<svg viewBox="0 -40 ${A.logoW} 180" width="${lw}" height="${lh}" style="overflow:visible"><path d="${part(id).d}" fill="${id === 'key' ? ORANGE : PAPER}" fill-rule="evenodd"/></svg>`, `left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px`, g.el);
    const t = sc.start + 0.9;
    mk('archL').k('x', [t, -900], [t + 0.8, 0, 'outx']).k('o', [t, 0], [t + 0.15, 1]);
    mk('archR').k('x', [t, 900], [t + 0.8, 0, 'outx']).k('o', [t, 0], [t + 0.15, 1]);
    mk('key').k('y', [t + 0.5, -700], [t + 1.1, 0, 'bounce']).k('o', [t + 0.5, 0], [t + 0.6, 1]);
    ['o', 'b', 'p', 'a', 'y'].forEach((id, i) => mk(id).k('y', [t + 1.2 + i * 0.08, 140], [t + 1.8 + i * 0.08, 0, 'outx']).k('o', [t + 1.2 + i * 0.08, 0], [t + 1.4 + i * 0.08, 1]));
    S.line(`Investir au pays. <span style="font-family:'Instrument Serif';font-style:italic;font-weight:400;font-size:1.16em;color:${ORANGE}">Avec preuve.</span>`, `left:0;top:${ly + lh + 60}px;width:${W}px;height:96px;text-align:center;font:700 62px/96px 'Bricolage Grotesque';letter-spacing:-.02em;color:${PAPER}`, o0.s + 0.2, { d: 0.9, parent: g.el }).el.style.textAlign = 'center';
    S.line('Merci.', `left:0;top:${ly + lh + 190}px;width:${W}px;height:150px;text-align:center;font:italic 400 140px/150px 'Instrument Serif',serif;color:${PAPER}`, o1.s + 0.05, { d: 1.0, parent: g.el }).el.style.textAlign = 'center';
    const row = S.g(`left:0;top:960px;width:${W}px;height:70px`);
    row.el.innerHTML = `<div style="position:absolute;left:0;right:0;top:0;height:70px;display:flex;align-items:center;justify-content:center;gap:34px;color:#9AA6C4;font:600 24px Figtree"><span>Hackathon Code &amp; Chain Dakar</span><img src="assets/logos/bitnob-logo-white.svg" style="height:30px"><b style="color:${PAPER};font-size:28px">×</b><img src="assets/logos/btrust-logo.svg" style="height:38px"></div>`;
    row.set({ o: 0 }).k('o', [o1.s + 0.6, 0], [o1.s + 1.2, 1]);
    g.k('o', [sc.end - 1.2, 1], [sc.end - 0.1, 0, 'in']);
    row.k('o', [sc.end - 1.2, 1], [sc.end - 0.1, 0, 'in']);
  }

  /* ======================================================= transitions between scenes */
  {
    const S = ENG.scene('tr', 0, TL.total);
    S.root.style.pointerEvents = 'none';
    S.root.style.display = 'block';
    const order = ['intro', 'probleme', 'principe', 'fin', 'terrain', 'decision', 'fournisseur', 'preuve', 'admin', 'bitnob', 'outro'];
    const kinds = ['bars', 'circle', 'slide', 'bars', 'slide', 'circle', 'bars', 'slide', 'circle', 'bars'];
    const cols = [ORANGE, BLUE, INK, PAPER];
    for (let i = 0; i < order.length - 1; i++) {
      const tb = TLs[order[i]].end;
      const kind = kinds[i];
      if (kind === 'bars') {
        const n = 6, bw = W / n;
        for (let j = 0; j < n; j++) {
          const c = [ORANGE, INK, BLUE, INK, ORANGE, BLUE][(j + i) % 6];
          const bar = S.div(`left:${j * bw - 1}px;top:0;width:${bw + 2}px;height:${H}px;background:${c}`);
          bar.set({ y: -H - 2 }).k('y', [tb - 0.55 + j * 0.05, -H - 2], [tb - 0.28 + j * 0.05, 0, 'io'], [tb + 0.03 + j * 0.05, 0], [tb + 0.34 + j * 0.05, H + 2, 'io']);
        }
      } else if (kind === 'circle') {
        const cx = [W * 0.72, W * 0.28, W * 0.5][i % 3], cy = [H * 0.35, H * 0.7, H * 0.5][i % 3];
        const cc = [ORANGE, BLUE][i % 2];
        const c1 = S.div(`left:${cx - 1700}px;top:${cy - 1700}px;width:3400px;height:3400px;border-radius:50%;background:${cc}`);
        c1.set({ s: 0 }).k('s', [tb - 0.5, 0], [tb - 0.02, 1, 'in'], [tb + 0.02, 1], [tb + 0.5, 0, 'out']);
        const c2 = S.div(`left:${cx - 1700}px;top:${cy - 1700}px;width:3400px;height:3400px;border-radius:50%;background:${INK}`);
        c2.set({ s: 0 }).k('s', [tb - 0.4, 0], [tb - 0.02, 0.97, 'in'], [tb + 0.02, 0.97], [tb + 0.34, 0, 'out']);
      } else {
        const p1 = S.div(`left:0;top:0;width:${W}px;height:${H}px;background:${ORANGE}`);
        p1.set({ x: W + 4 }).k('x', [tb - 0.55, W + 4], [tb - 0.05, 0, 'io'], [tb + 0.05, 0], [tb + 0.55, -W - 4, 'io']);
        const p2 = S.div(`left:0;top:0;width:${W}px;height:${H}px;background:${INK}`);
        p2.set({ x: W + 4 }).k('x', [tb - 0.42, W + 4], [tb - 0.0, 0, 'io'], [tb + 0.1, 0], [tb + 0.5, -W - 4, 'io']);
      }
    }
    // final fade to black
    const blk = S.div(`left:0;top:0;width:${W}px;height:${H}px;background:#000`);
    blk.set({ o: 0 }).k('o', [TL.total - 0.9, 0], [TL.total, 1, 'lin']);
  }
})();
