/* Scenes 4-6: the funder's journey (account, project, funding), the person on site, the decision and payment */
(function () {
  const { W, H, INK, PAPER, BLUE, ORANGE, WHITE, SKY, E, clamp, lerp } = ENG;
  const A = window.ASSETS, TLs = window.TL.scenes;
  const tp = (text) => L.tapAt(text);
  const NEXT = { x: 195, y: 808 };

  /* ======================================================= 4. the funder: account, project, funding */
  {
    const sc = TLs.fin;
    const S = ENG.scene('fin', sc.start, sc.end);
    L.backdrop(S, 'light');
    L.chrome(S, 'light', 'Parcours 1 · Le financeur');
    const f0 = L.t('financeur', 0), f1 = L.t('financeur', 1), f2 = L.t('financeur', 2);
    // chapter card
    L.chapter(S, 'light', { num: 1, title: 'Le financeur', role: 'Moussa, installé en France', portrait: A.portraits.moussa, t0: sc.start + 0.7, t1: L.e('financeur', 0, 0.0), side: 'left' });
    const P = L.phone(S, { cx: 1190, cy: 556, k: 1, rot: 0, t0: f1 - 0.35, t1: sc.end - 0.9, from: 'bottom' });
    const sub = (id, k, f) => L.at(id, k, f);
    const T = (id, k) => ({ s: L.t(id, k), d: L.e(id, k) - L.t(id, k), e: L.e(id, k) });
    const ca = (o) => {
      const a = P.pt(o.px, o.py);
      return L.callout(S, { ax: a.x, ay: a.y, tx: 1470, ty: o.ty ?? a.y - 40, w: o.w, side: 'l', ...o });
    };
    const left = (o) => L.block(S, 'light', { x: 130, y: 330, w: 760, size: 82, ...o });

    // ---- signup
    const a = T('financeur', 1);
    left({ kick: 'Étape 1', lines: ['Un compte,', 'un code SMS.'], sub: 'Aucun mot de passe à retenir.', t0: a.s, t1: a.e + 0.05 });
    P.screen('a1-welcome', f1, { mode: 'up' });
    P.screen('a2-signup', a.s + 0.2 * a.d, { mode: 'right' });
    P.screen('a3-signup-filled', a.s + 0.4 * a.d, { mode: 'fade' });
    P.ring(a.s + 0.43 * a.d, a.s + 0.6 * a.d, { x: 14, y: 252, w: 362, h: 236 });
    ca({ text: 'Prénom, nom, téléphone', sub: 'pays de résidence', px: 195, py: 445, t0: a.s + 0.44 * a.d, t1: a.s + 0.66 * a.d, ty: 380 });
    const tc = tp('Recevoir le code');
    P.tap(a.s + 0.62 * a.d, tc.x, tc.y);
    P.screen('a4-otp', a.s + 0.68 * a.d, { mode: 'right' });
    ca({ text: 'Code de confirmation', sub: 'démo : aucun SMS réel', px: 195, py: 316, t0: a.s + 0.7 * a.d, t1: a.e - 0.1, ty: 250 });
    const tr = tp('Remplir');
    P.tap(a.s + 0.8 * a.d, tr.x, tr.y);
    P.screen('a5-otp-filled', a.s + 0.84 * a.d, { mode: 'fade' });
    const b = T('financeur', 2);
    const tcc = tp('Créer mon compte');
    P.tap(b.s + 0.06 * b.d, tcc.x, tcc.y);
    P.screen('a6-dashboard-empty', b.s + 0.2 * b.d, { mode: 'zoom' });
    left({ kick: 'Étape 1', lines: ['Son tableau', 'de bord.'], sub: 'Vide pour l’instant. Moussa va créer son premier projet.', t0: b.s, t1: b.e + 0.05 });
    ca({ text: 'Tableau de bord', sub: 'séquestre · projets · étapes payées', px: 195, py: 150, t0: b.s + 0.35 * b.d, t1: b.e - 0.1, ty: 120 });

    // ---- project
    const p0 = T('projet', 0), p1 = T('projet', 1), p2 = T('projet', 2), p3 = T('projet', 3), p4 = T('projet', 4);
    left({ kick: 'Étape 2', lines: ['Un projet :', 'la maison familiale.'], sub: 'Thiès · 24 000 $', t0: p0.s, t1: p0.e + 0.05, size: 74 });
    P.tap(p0.s + 0.25 * p0.d, 195, 569);
    P.screen('b1-sector', p0.s + 0.4 * p0.d, { mode: 'right' });
    left({ kick: 'Étape 2', lines: ['Un secteur,', 'un budget.'], sub: 'Immobilier, agricole ou commerce, puis un nom, une ville et le budget.', t0: p1.s, t1: p1.e + 0.05 });
    const ti = tp('Immobilier');
    P.tap(p1.s + 0.1 * p1.d, ti.x, ti.y);
    P.screen('b1b-sector-picked', p1.s + 0.18 * p1.d, { mode: 'fade' });
    ca({ text: '3 secteurs', sub: 'immobilier · agricole · commerce', px: 195, py: 215, t0: p0.s + 0.55 * p0.d, t1: p1.s + 0.35 * p1.d, ty: 140 });
    P.tap(p1.s + 0.4 * p1.d, NEXT.x, NEXT.y);
    P.screen('b2-details', p1.s + 0.48 * p1.d, { mode: 'right' });
    P.ring(p1.s + 0.52 * p1.d, p1.e - 0.1, { x: 14, y: 268, w: 362, h: 252 });
    ca({ text: 'Nom · ville · budget', sub: 'Maison familiale · Thiès · 24 000 $', px: 195, py: 420, t0: p1.s + 0.56 * p1.d, t1: p1.e - 0.05, ty: 360 });
    left({ kick: 'Étape 2', lines: ['Des étapes', 'sur mesure.'], sub: 'Modifiables : leur somme doit être égale au budget.', t0: p2.s, t1: p2.e + 0.05 });
    P.tap(p2.s + 0.05 * p2.d, NEXT.x, NEXT.y);
    P.screen('b3-steps-full', p2.s + 0.18 * p2.d, { mode: 'right', scroll: [0, 330, p2.s + 0.3 * p2.d, p2.e - 0.2, 'io'] });
    ca({ text: 'Budget réparti', sub: '24 000 $ sur 24 000 $', px: 195, py: 120, t0: p2.s + 0.3 * p2.d, t1: p2.e - 0.05, ty: 150 });
    left({ kick: 'Étape 2', lines: ['La personne', 'de confiance.'], sub: 'Sur place, elle enverra les preuves. Le financeur seul valide les paiements.', t0: p3.s, t1: p3.e + 0.05 });
    P.tap(p2.e - 0.15, NEXT.x, NEXT.y);
    P.screen('b4-manager', p3.s + 0.0, { mode: 'right' });
    ca({ text: 'Qui valide ?', sub: 'Moi seul · « 2 sur 3 » bientôt', px: 195, py: 490, t0: p3.s + 0.4 * p3.d, t1: p3.e - 0.1, ty: 430 });
    P.tap(p3.s + 0.62 * p3.d, NEXT.x, NEXT.y);
    P.screen('b5-recap', p3.s + 0.72 * p3.d, { mode: 'right' });
    left({ kick: 'Étape 2', lines: ['Rien n’est payé', 'sans preuve.'], sub: 'Le projet est prêt : 24 000 $, six étapes, aucune payée.', t0: p4.s, t1: p4.e + 0.05, size: 74 });
    const tcp = tp('Créer le projet');
    P.tap(p4.s + 0.08 * p4.d, tcp.x, tcp.y);
    P.screen('b6-created', p4.s + 0.2 * p4.d, { mode: 'zoom' });
    ca({ text: 'Projet créé', sub: '0 $ en séquestre · étapes verrouillées', px: 195, py: 330, t0: p4.s + 0.35 * p4.d, t1: p4.e - 0.1, ty: 270 });

    // ---- funding
    const q0 = T('financement', 0), q1 = T('financement', 1), q2 = T('financement', 2), q3 = T('financement', 3);
    left({ kick: 'Étape 3', lines: ['Alimenter', 'le séquestre.'], sub: 'Un montant : 6 000 $.', t0: q0.s, t1: q0.e + 0.05 });
    P.tap(q0.s + 0.12 * q0.d, 195, 372);
    P.screen('c1-fund-empty', q0.s + 0.24 * q0.d, { mode: 'right' });
    [['6', 317, 592], ['0', 195, 720], ['0', 195, 720], ['0', 195, 720]].forEach(([, x, y], i) => P.tap(q0.s + (0.4 + i * 0.13) * q0.d, x, y));
    P.screen('c2-keypad', q0.s + 0.5 * q0.d, { mode: 'fade' });
    left({ kick: 'Étape 3', lines: ['Bitcoin Lightning.'], sub: 'Une facture, payable depuis n’importe quel portefeuille.', t0: q1.s, t1: q1.e + 0.05, size: 84 });
    P.tap(q1.s + 0.05 * q1.d, 195, 788);
    P.screen('c3-method', q1.s + 0.16 * q1.d, { mode: 'right' });
    ca({ text: 'Bitcoin Lightning', sub: 'USDT · USDC : bientôt', px: 195, py: 215, t0: q1.s + 0.28 * q1.d, t1: q1.s + 0.7 * q1.d, ty: 150 });
    P.tap(q1.s + 0.74 * q1.d, 195, 788);
    P.screen('c4-invoice', q1.s + 0.84 * q1.d, { mode: 'right' });
    left({ kick: 'Étape 3', lines: ['Confirmé par un', 'événement signé.'], sub: 'En démo, le paiement est simulé : Bitnob confirme, le séquestre est crédité.', t0: q2.s, t1: q2.e + 0.05, size: 70 });
    ca({ text: 'Facture Lightning + QR', sub: 'valable 24 h', px: 195, py: 260, t0: q2.s + 0.05 * q2.d, t1: q2.s + 0.5 * q2.d, ty: 190 });
    P.tap(q2.s + 0.58 * q2.d, 195, 776);
    P.screen('c5-paid', q2.s + 0.72 * q2.d, { mode: 'zoom' });
    ca({ text: '6 000 $ reçus', sub: 'en séquestre, comptés projet par projet', px: 195, py: 290, t0: q2.s + 0.78 * q2.d, t1: q2.e + 0.2, ty: 230, tone: 'orange' });
    left({ kick: 'Étape 3', lines: ['La première étape', 's’ouvre.'], sub: 'Vérification du titre foncier : 1 200 $.', t0: q3.s, t1: sc.end - 1.0, size: 74 });
    P.screen('d1-project-funded', q3.s + 0.05 * q3.d, { mode: 'up' });
    P.ring(q3.s + 0.35 * q3.d, q3.e - 0.1, { x: 14, y: 536, w: 362, h: 74 });
    ca({ text: 'Étape 1 ouverte', sub: 'en attente de la preuve', px: 195, py: 572, t0: q3.s + 0.4 * q3.d, t1: q3.e + 0.2, ty: 640 });
  }

  /* ======================================================= 5. the person on site */
  {
    const sc = TLs.terrain;
    const S = ENG.scene('terrain', sc.start, sc.end);
    L.backdrop(S, 'dark');
    L.chrome(S, 'dark', 'Parcours 2 · La personne sur place');
    const T = (k) => ({ s: L.t('terrain', k), d: L.e('terrain', k) - L.t('terrain', k), e: L.e('terrain', k) });
    const t0 = T(0), t1 = T(1), t2 = T(2), t3 = T(3), t4 = T(4), t5 = T(5);
    L.chapter(S, 'dark', { num: 2, title: 'Sur place', role: 'Mamadou, à Thiès · sans compte', portrait: A.portraits.mamadou, t0: sc.start + 0.7, t1: t0.e + 0.055, side: 'right' });

    // Moussa's phone: copy the private link
    const P1 = L.phone(S, { cx: 520, cy: 560, k: 0.92, rot: -4, t0: t1.s - 0.3, t1: t1.s + 0.7 * t1.d, from: 'left' });
    P1.screen('d2-profile-links', t1.s - 0.2, { mode: 'up' });
    P1.ring(t1.s + 0.1 * t1.d, t1.s + 0.5 * t1.d, { x: 14, y: 410, w: 362, h: 100 });
    P1.tap(t1.s + 0.35 * t1.d, 306, 462);
    // WhatsApp-style message
    const wa = S.g(`left:960px;top:330px;width:760px;height:330px`);
    wa.set({ o: 0 }).k('o', [t1.s + 0.4 * t1.d, 0], [t1.s + 0.4 * t1.d + 0.35, 1]).k('x', [t1.s + 0.4 * t1.d, 300], [t1.s + 0.4 * t1.d + 0.8, 0, 'outx']).k('o', [t1.e - 0.3, 1], [t1.e + 0.05, 0, 'in']);
    S.text('Lien privé, valable 90 jours', `left:0;top:-92px;font:800 22px 'Figtree';letter-spacing:.18em;text-transform:uppercase;color:${SKY}`, wa.el);
    S.div(`left:0;top:0;width:760px;height:330px;border-radius:30px;background:#0F2E27;box-shadow:0 30px 70px rgba(0,0,0,.4)`, wa.el);
    S.div(`left:0;top:0;width:760px;height:78px;border-radius:30px 30px 0 0;background:#128C7E`, wa.el);
    S.text('Mamadou', `left:100px;top:14px;font:800 30px 'Figtree';color:#fff`, wa.el);
    S.text('en ligne', `left:100px;top:46px;font:500 20px 'Figtree';color:#CFF3EC`, wa.el);
    S.div(`left:26px;top:14px;width:52px;height:52px;border-radius:50%;background:#F1C58E`, wa.el);
    const bub = S.div(`left:70px;top:106px;width:640px;height:178px;border-radius:22px 22px 4px 22px;background:#DCF8C6`, wa.el);
    bub.el.innerHTML = `<div style="padding:20px 26px;font:500 28px/1.35 Figtree;color:#0B132B">Mamadou, voici ton lien pour envoyer les preuves du chantier :<br><span style="color:#1D4ED8;font-weight:700;text-decoration:underline">nobpay.app/terrain/p_3f9a…</span></div><div style="position:absolute;right:20px;bottom:10px;font:600 18px Figtree;color:#52806B">14:51 ✓✓</div>`;
    bub.set({ o: 0 }).k('o', [t1.s + 0.55 * t1.d, 0], [t1.s + 0.55 * t1.d + 0.3, 1]).k('s', [t1.s + 0.55 * t1.d, 0.8], [t1.s + 0.55 * t1.d + 0.6, 1, 'back']);
    L.block(S, 'dark', { x: 960, y: 720, w: 900, size: 64, lines: ['Un lien privé,'], sub: 'Pas de compte, pas d’application à installer.', t0: t1.s + 0.7 * t1.d, t1: t1.e - 0.3, subSize: 32 });

    // Mamadou's phone
    const P2 = L.phone(S, { cx: 600, cy: 556, k: 1, rot: 0, t0: t2.s - 0.45, t1: sc.end - 0.9, from: 'right' });
    P2.screen('e1-field-open-full', t2.s - 0.3, { mode: 'up', scroll: [0, 120, t2.s + 0.3 * t2.d, t2.e - 0.1, 'io'] });
    const rt = (o) => {
      const a = P2.pt(o.px, o.py);
      return L.callout(S, { ax: a.x, ay: a.y, tx: 960, ty: o.ty ?? a.y - 40, w: o.w, side: 'l', ...o });
    };
    L.block(S, 'dark', { x: 960, y: 190, w: 860, size: 70, kick: 'Étape 4', lines: ['Il voit l’étape', 'à faire.'], sub: 'Vérification du titre foncier · 1 200 $', t0: t2.s, t1: t2.e + 0.05 });
    rt({ text: 'L’étape à faire', sub: 'et les preuves attendues', px: 195, py: 160, t0: t2.s + 0.35 * t2.d, t1: t2.e - 0.05, ty: 560 });
    L.block(S, 'dark', { x: 960, y: 190, w: 860, size: 70, kick: 'Étape 4', lines: ['Une photo,', 'datée et localisée.'], sub: 'La position du téléphone est jointe à la photo.', t0: t3.s, t1: t3.e + 0.05 });
    P2.screen('e2-field-filled-full', t3.s + 0.12 * t3.d, { mode: 'fade', scroll: [180, 260, t3.s + 0.2 * t3.d, t3.e - 0.1, 'io'] });
    rt({ text: 'Photo du titre foncier', sub: 'Position ajoutée (±12 m)', px: 100, py: 200, t0: t3.s + 0.4 * t3.d, t1: t3.e - 0.05, ty: 560 });
    L.block(S, 'dark', { x: 960, y: 190, w: 860, size: 70, kick: 'Étape 4', lines: ['Qui doit être payé.'], sub: 'Son nom, son numéro mobile money et son opérateur.', t0: t4.s, t1: t4.e + 0.05 });
    P2.screen('e2-field-filled-full', t4.s, { mode: 'fade', scroll: [260, 700, t4.s + 0.2 * t4.d, t4.e - 0.1, 'io'] });
    rt({ text: 'Cabinet Fall, géomètre', sub: '+221 77 654 32 10 · Orange Money', px: 195, py: 330, t0: t4.s + 0.5 * t4.d, t1: t4.e - 0.05, ty: 560 });
    L.block(S, 'dark', { x: 960, y: 250, w: 860, size: 96, kick: 'Étape 4', lines: ['Envoyée.', 'C’est tout.'], t0: t5.s, t1: sc.end - 1.0 });
    P2.tap(t5.s + 0.12 * t5.d, 195, 800);
    P2.screen('e3-field-sent', t5.s + 0.3 * t5.d, { mode: 'zoom' });
    const burst = S.g(`left:0;top:0;width:${W}px;height:${H}px`);
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const dd = S.div(`left:${600 - 7}px;top:${470 - 7}px;width:14px;height:14px;border-radius:50%;background:${i % 2 ? ORANGE : SKY}`, burst.el);
      const tb = t5.s + 0.3 * t5.d + 0.25;
      dd.set({ o: 0 }).k('o', [tb - 0.001, 0], [tb, 1], [tb + 0.9, 0, 'out']).k('x', [tb, 0], [tb + 0.9, Math.cos(ang) * 320, 'out']).k('y', [tb, 0], [tb + 0.9, Math.sin(ang) * 320, 'out']);
    }
    const done = S.g(`left:960px;top:620px;width:760px;height:100px`);
    const tdn = t5.s + 0.55 * t5.d;
    done.set({ o: 0 }).k('o', [tdn, 0], [tdn + 0.4, 1]).k('y', [tdn, 40], [tdn + 0.7, 0, 'outx']).k('o', [sc.end - 1.0, 1], [sc.end - 0.7, 0, 'in']);
    S.div(`left:0;top:0;width:100px;height:100px;border-radius:50%;background:#2FA84F;box-shadow:0 0 0 12px rgba(47,168,79,.25)`, done.el);
    S.svg(ICON.check, `left:20px;top:20px;width:60px;height:60px;color:#fff`, done.el);
    S.text('Preuve envoyée au financeur', `left:130px;top:22px;font:800 46px 'Figtree';color:${PAPER}`, done.el);
  }

  /* ======================================================= 6. the decision and the payment */
  {
    const sc = TLs.decision;
    const S = ENG.scene('decision', sc.start, sc.end);
    L.backdrop(S, 'soft');
    L.chrome(S, 'soft', 'Parcours 1 · Le financeur décide');
    const T = (k) => ({ s: L.t('decision', k), d: L.e('decision', k) - L.t('decision', k), e: L.e('decision', k) });
    const d0 = T(0), d1 = T(1), d2 = T(2), d3 = T(3), d4 = T(4), d5 = T(5);
    const P = L.phone(S, { cx: 1190, cy: 556, k: 1, t0: d0.s - 0.95, t1: sc.end - 0.9, from: 'bottom' });
    const ca = (o) => {
      const a = P.pt(o.px, o.py);
      return L.callout(S, { ax: a.x, ay: a.y, tx: 1470, ty: o.ty ?? a.y - 40, w: o.w, side: 'l', ...o });
    };
    const left = (o) => L.block(S, 'soft', { x: 130, y: 330, w: 760, size: 78, ...o });
    left({ kick: 'Étape 5', lines: ['Une alerte :', 'preuve reçue.'], sub: 'Rien n’est payé sans l’accord du financeur.', t0: d0.s - 0.6, t1: d0.e + 0.05 });
    P.screen('f0-notifications', d0.s - 0.2, { mode: 'up' });
    // toast
    const toast = S.div(`left:${P.pt(0, 0).x + 22}px;top:${P.pt(0, 0).y + 54}px;width:346px;height:96px;border-radius:22px;background:${INK};box-shadow:0 20px 50px rgba(0,0,0,.4)`);
    toast.el.innerHTML = `<div style="padding:16px 22px;font:700 22px Figtree;color:#fff">Preuve en attente de décision<div style="font:500 19px Figtree;color:#A9BEFF;margin-top:6px">Maison familiale · Vérification du titre foncier</div></div>`;
    toast.set({ o: 0 }).k('o', [d0.s + 0.2, 0], [d0.s + 0.5, 1]).k('y', [d0.s + 0.2, -130], [d0.s + 0.9, 0, 'bounce']).k('y', [d0.s + 0.2 + 0.7 * d0.d, 0], [d0.s + 0.2 + 0.7 * d0.d + 0.4, -140, 'in']).k('o', [d0.s + 0.2 + 0.7 * d0.d + 0.3, 1], [d0.s + 0.2 + 0.7 * d0.d + 0.45, 0]);
    P.ring(d0.s + 0.2 * d0.d, d0.e - 0.1, { x: 14, y: 60, w: 362, h: 100 });
    P.tap(d0.s + 0.78 * d0.d, 195, 110);
    P.screen('f1-project-pending', d0.s + 0.88 * d0.d, { mode: 'right' });
    left({ kick: 'Étape 5', lines: ['La preuve,', 'sous les yeux.'], sub: 'Photo géolocalisée, fournisseur à payer, message de Mamadou.', t0: d1.s, t1: d1.e + 0.05 });
    P.tap(d1.s + 0.05 * d1.d, 195, 520);
    P.screen('f2-review-full', d1.s + 0.14 * d1.d, { mode: 'right', scroll: [0, 300, d1.s + 0.52 * d1.d, d1.s + 0.68 * d1.d, 'io'] });
    ca({ text: 'Photo géolocalisée', sub: '18 oct. · 14.7910, −16.9359 · ±12 m', px: 100, py: 385, t0: d1.s + 0.22 * d1.d, t1: d1.s + 0.5 * d1.d, ty: 270 });
    ca({ text: 'Sera payé directement', sub: 'Cabinet Fall · Orange Money', px: 195, py: 279, t0: d1.s + 0.72 * d1.d, t1: d1.e - 0.05, ty: 230 });
    left({ kick: 'Étape 5', lines: ['Refuser,', 'avec un motif.'], sub: 'Mamadou voit la raison et renvoie une nouvelle preuve.', t0: d2.s, t1: d2.e + 0.05 });
    P.screen('f2-review', d2.s - 0.1, { mode: 'fade' });
    P.tap(d2.s + 0.12 * d2.d, 195, 779);
    P.screen('f3-reject', d2.s + 0.22 * d2.d, { mode: 'up' });
    ca({ text: 'Refuser la preuve', sub: 'motifs prêts à l’emploi', px: 195, py: 330, t0: d2.s + 0.35 * d2.d, t1: d2.e - 0.05, ty: 270 });
    left({ kick: 'Étape 5', lines: ['Le devis,', 'avant de payer.'], sub: 'Débit du séquestre, taux, frais et montant reçu en francs CFA.', t0: d3.s, t1: d3.e + 0.05, size: 74 });
    P.tap(d3.s + 0.02 * d3.d, 195, 822);
    P.screen('f2-review', d3.s + 0.08 * d3.d, { mode: 'fade' });
    P.tap(d3.s + 0.2 * d3.d, 195, 779);
    P.screen('f4-quote', d3.s + 0.3 * d3.d, { mode: 'up' });
    ca({ text: 'Débit : 1 200 $', sub: 'depuis le séquestre du projet', px: 195, py: 375, t0: d3.s + 0.42 * d3.d, t1: d3.s + 0.6 * d3.d, ty: 320 });
    ca({ text: '1 $ = 760 FCFA', sub: 'aucun frais ajouté', px: 195, py: 440, t0: d3.s + 0.58 * d3.d, t1: d3.s + 0.78 * d3.d, ty: 440 });
    ca({ text: 'Le fournisseur reçoit', sub: '912 000 FCFA', px: 195, py: 520, t0: d3.s + 0.74 * d3.d, t1: d3.e + 0.1, ty: 560, tone: 'orange' });
    left({ kick: 'Étape 5', lines: ['Payé directement,', 'en mobile money.'], sub: 'Via Bitnob Payouts, vers le numéro du fournisseur.', t0: d4.s, t1: d4.e + 0.05, size: 74 });
    P.tap(d4.s + 0.12 * d4.d, 195, 746);
    P.screen('f5-releasing', d4.s + 0.3 * d4.d, { mode: 'zoom' });
    ca({ text: 'Paiement demandé à Bitnob', sub: 'reçu par le fournisseur : en cours', px: 195, py: 330, t0: d4.s + 0.55 * d4.d, t1: d4.e + 0.1, ty: 270 });
    left({ kick: 'Étape 5', lines: ['Confirmé,', 'puis étape suivante.'], sub: 'Notification signée de Bitnob : l’étape est payée.', t0: d5.s, t1: sc.end - 1.0, size: 74 });
    P.screen('f6-paid-full', d5.s + 0.05 * d5.d, { mode: 'fade', scroll: [0, 330, d5.s + 0.45 * d5.d, d5.e - 0.05, 'io'] });
    ca({ text: 'Fournisseur payé', sub: '912 000 FCFA · Orange Money', px: 195, py: 270, t0: d5.s + 0.12 * d5.d, t1: d5.s + 0.5 * d5.d, ty: 200, tone: 'orange' });
    ca({ text: 'Webhook signé', sub: 'HMAC-SHA512 · rejeu bloqué', px: 195, py: 420, t0: d5.s + 0.52 * d5.d, t1: d5.e + 0.2, ty: 470 });
  }
})();
