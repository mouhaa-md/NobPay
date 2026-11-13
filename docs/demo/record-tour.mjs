// Records the TOUR video (screen part): one project for each of the five business models, from the creation wizard to the last paid
// step, then the ledger, the Bitcoin anchor and the public verification. The voice (voice/synth-en.py on narration-tour-en.json) and the
// music are laid on it by voice/assemble-en.py, using the timings this script writes (info.json). Same mechanics as record-pitch.mjs.
//
//   PLAYWRIGHT=/path/to/playwright-core/index.mjs NARR=<dir with durations.json> OUTDIR=<dir> RESET=1 \
//     node docs/demo/record-tour.mjs https://nobpay.onrender.com
//
// What is done on screen and what is done behind it. The first step of each model is played on screen (wizard, field page, funder's
// decision, payment). The following steps run through the same HTTP routes as the screens, inside idle(), so that the waiting is cut and
// the project is shown again once complete. The proof files are made on the fly (tour-assets.mjs): no two steps share a file.
// The instance rate-limits quotes (20 per 10 minutes): quoteGate() spaces them out, and the waiting is cut too.
//
// Variables: PLAYWRIGHT, NARR, OUTDIR (required); RESET=1 puts the demo data back at the start and at the end (use it on the online
// instance: the tour creates five projects); ONLY=immobilier,agricole plays only some models (no narration, for trying a flow);
// SHOTS=1 saves a screenshot at the start of each sentence group.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright');
const { invoicePng, photoJpg, titlePng } = await import('./tour-assets.mjs');
const BASE = process.argv[2];
const OUTDIR = process.env.OUTDIR;
const NARR = process.env.NARR;
const SHOTS = process.env.SHOTS === '1';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
if (!BASE || !OUTDIR || !NARR) throw new Error('usage: OUTDIR=… NARR=… node record-tour.mjs <url>');
mkdirSync(OUTDIR, { recursive: true });
if (SHOTS) mkdirSync(`${OUTDIR}/shots`, { recursive: true });
const dur = new Proxy(JSON.parse(readFileSync(`${NARR}/durations.json`, 'utf8')), { get: (o, k) => o[k] ?? 3 });
const GAP = 0.2;
const RATE = 593; // FCFA per dollar, the instance's rate

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Africa/Dakar',
  geolocation: { latitude: 14.7886, longitude: -16.9262, accuracy: 9 }, permissions: ['geolocation'],
  recordVideo: { dir: OUTDIR, size: { width: 1280, height: 720 } },
});
ctx.setDefaultTimeout(60000);
await ctx.addInitScript(() => {
  const css = `
  #demo-cur{position:fixed;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.92);border:3px solid #1d4ed8;box-shadow:0 2px 10px rgba(0,0,0,.45);
    z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);transition:transform .08s}
  #demo-cur.down{transform:translate(-50%,-50%) scale(.7);background:#1d4ed8}
  .demo-ripple{position:fixed;width:20px;height:20px;border-radius:50%;border:3px solid #1d4ed8;z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);animation:demoRipple .6s ease-out forwards}
  @keyframes demoRipple{to{width:70px;height:70px;opacity:0}}`;
  const mount = () => {
    if (document.getElementById('demo-cur')) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const cur = document.createElement('div'); cur.id = 'demo-cur'; document.documentElement.appendChild(cur);
    const pos = JSON.parse(sessionStorage.getItem('demoPos') || '[40,40]'); cur.style.left = pos[0] + 'px'; cur.style.top = pos[1] + 'px';
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; sessionStorage.setItem('demoPos', JSON.stringify([e.clientX, e.clientY])); }, true);
    addEventListener('mousedown', (e) => { cur.classList.add('down'); const r = document.createElement('div'); r.className = 'demo-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
    addEventListener('mouseup', () => cur.classList.remove('down'), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
});
const page = await ctx.newPage();
const V0 = Date.now();
const tv = () => (Date.now() - V0) / 1000;
const wait = (ms) => page.waitForTimeout(ms);

// ---- cuts: stretches of the raw recording that the assembly removes ----
const cuts = [];
let cutTotal = 0;
const fv = () => tv() - cutTotal;
const idle = async (fn, keep = 0.5) => {
  const a = tv();
  const r = await fn();
  const b = tv();
  if (b - a > keep + 0.5) { cuts.push([+(a + 0.12).toFixed(2), +(b - (keep - 0.12)).toFixed(2)]); cutTotal += b - a - keep; }
  return r;
};

// ---- narration timing, in final-video time ----
const marks = [];
let busyUntil = 0;
let shotN = 0;
const after = async () => { const w = busyUntil - fv(); if (w > 0) await wait(w * 1000); };
const narrate = async (id) => {
  if (ONLY) return;
  await after();
  const prevEnd = busyUntil - GAP;
  const silence = fv() - prevEnd;
  if (marks.length && silence > 1.2) console.log(`  ! ${silence.toFixed(1)} s without voice before "${id}"`);
  const start = fv() + 0.2;
  marks.push({ id, start: +start.toFixed(2) });
  busyUntil = start + dur[id] + GAP;
  console.log(`[${start.toFixed(0).padStart(3)}s] ${id} (${dur[id].toFixed(1)} s)`);
  if (SHOTS) await page.screenshot({ path: `${OUTDIR}/shots/${String(++shotN).padStart(2, '0')}-${id}.png` });
};

const glide = async (x, y, steps = 12) => { await page.mouse.move(x, y, { steps }); };
const click = async (loc, { pause = 220, force = false } = {}) => {
  await loc.first().scrollIntoViewIfNeeded(); await wait(150);
  const b = await loc.first().boundingBox(); if (!b) throw new Error('no box for ' + loc);
  await glide(b.x + b.width / 2, b.y + b.height / 2); await wait(pause);
  await idle(() => loc.first().click({ force }), 0.5);
};
const scrollBy = async (px, ms = 1000) => { await page.evaluate((p) => window.scrollBy({ top: p, behavior: 'smooth' }), px); await wait(ms); };
// the network of the recording machine blinks now and then (DNS, resets): a call is retried before the run is given up
const retrying = async (fn, what) => {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= 5 || !/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|ERR_CONNECTION|net::|Timeout/i.test(String(e.message))) throw e;
      console.log(`  (retry ${i} of ${what}: ${String(e.message).split('|')[0].slice(0, 90)})`);
      await new Promise((r) => setTimeout(r, 6000));
    }
  }
};
const go = async (path) => { await idle(() => retrying(() => page.goto(BASE + path, { waitUntil: 'networkidle' }), 'goto ' + path), 0.3); await wait(350); };
const type = async (loc, text, delay = 35) => { await click(loc, { pause: 100 }); await loc.first().pressSequentially(text, { delay }); };

// ---- HTTP calls through the same routes as the screens (same session cookie as the page) ----
const api = async (method, path, data, opts = {}) => {
  const r = await retrying(() => ctx.request.fetch(BASE + path, { method, ...(data !== undefined ? { data } : {}), ...opts }), `${method} ${path}`);
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = {}; }
  if (!r.ok() && !opts.allow) throw new Error(`${method} ${path} -> ${r.status()} ${text.slice(0, 200)}`);
  return json;
};
const stateOf = async (id) => (await api('GET', `/api/projects/${id}/state`)).steps;
const waitStep = async (p, idx, statuses, ms = 120000) => {
  const end = Date.now() + ms;
  for (;;) {
    const s = (await stateOf(p.id))[idx];
    if (statuses.includes(s.status)) return s.status;
    if (Date.now() > end) throw new Error(`step ${idx + 1} of ${p.id} is "${s.status}", expected ${statuses}`);
    await wait(1500);
  }
};
// the instance allows 20 quotes per 10 minutes per user: never more than 17 in any window of 10 minutes
const quotes = [];
const quoteGate = async () => {
  for (;;) {
    const now = Date.now();
    while (quotes.length && now - quotes[0] > 600_000) quotes.shift();
    if (quotes.length < 17) { quotes.push(now); return; }
    await wait(Math.max(1000, 600_000 - (now - quotes[0]) + 500));
  }
};

const SUPPLIERS = {
  immobilier: [['Cabinet du géomètre Faye', '+221773210011'], ['Quincaillerie Ndiaye', '+221776543210'], ['Matériaux Sow & Fils', '+221775551122'], ['Dalles et Bétons de Thiès', '+221779990033'], ['Charpente Mbaye', '+221778884455'], ['Peinture Diouf', '+221772223344']],
  agricole: [['Coopérative Sine-Saloum', '+221779998877'], ['Semences du Saloum', '+221774445566'], ['Engrais Kaolack', '+221776667788'], ['Séchoir et stockage Gueye', '+221773331122'], ['Marché de gros de Kaolack', '+221775559900']],
  commerce: [['Grossiste Dakar Import', '+221777001122'], ['Transports Fall', '+221778002233'], ['Rayonnages Diallo', '+221779003344'], ['Grossiste Dakar Import', '+221777001122']],
  scolarite: [['Collège Sainte-Marie', '+221771112233'], ['Librairie Papyrus', '+221772223355'], ['Collège Sainte-Marie', '+221771112233'], ['Collège Sainte-Marie', '+221771112233'], ['Collège Sainte-Marie', '+221771112233']],
  approvisionnement: [['Grossiste Touba Commerce', '+221774567890'], ['Transport Touba Express', '+221776781234'], ['Aménagement boutique Cissé', '+221779876543']],
};
const KIND = { 'Titre foncier': 'titre', 'Photos géolocalisées': 'photos', Facture: 'facture' };

/** the files and fields of a proof for step `idx` of project `p` */
async function proofParts(p, idx) {
  const s = p.steps[idx];
  const [supplier, phone] = SUPPLIERS[p.key][idx];
  const photos = [];
  if (s.kinds.includes('titre')) photos.push(await titlePng());
  else if (s.kinds.includes('photos')) photos.push(await photoJpg(p.key === 'immobilier' || p.key === 'agricole' ? p.key : 'commerce', idx + 1));
  const invoice = s.kinds.includes('facture')
    ? await invoicePng({ supplier, place: p.city, phone: phone.replace('+221', '').replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4'), title: s.title, totalFcfa: Math.round(s.usd * RATE), number: `${p.key.slice(0, 3).toUpperCase()}-2026-${100 + idx}` })
    : undefined;
  return { s, supplier, phone, photos, invoice, fcfa: Math.round(s.usd * RATE) };
}

/** a proof and a payment for step `idx`, without the screens (same routes) */
async function completeViaApi(p, idx) {
  await waitStep(p, idx, ['active', 'rejected']);
  const stepId = (await stateOf(p.id))[idx].id;
  const { s, supplier, phone, photos, invoice, fcfa } = await proofParts(p, idx);
  const multipart = {
    photoMeta: JSON.stringify(photos.map(() => ({ takenAt: new Date().toISOString(), lat: 14.7886, lng: -16.9262, accuracy: 9 }))),
    supplierName: supplier, supplierPhone: phone, supplierNetwork: 'wave', note: '',
    ...(invoice ? { invoiceAmountFcfa: String(fcfa) } : {}),
    ...(photos[0] ? { photos: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photos[0] } } : {}),
    ...(invoice ? { invoice: { name: 'facture.png', mimeType: 'image/png', buffer: invoice } } : {}),
  };
  await api('POST', `/api/projects/${p.id}/steps/${stepId}/proof`, undefined, { headers: { 'x-manager-token': p.token }, multipart });
  await quoteGate();
  await api('POST', `/api/projects/${p.id}/steps/${stepId}/quote`, {});
  await api('POST', `/api/projects/${p.id}/steps/${stepId}/release`, {});
  await waitStep(p, idx, ['paid']);
}

// ---- the wizard, on screen ----
const SECTORS = [
  { key: 'immobilier', card: /^Immobilier/, name: 'Villa familiale à Thiès', city: 'Thiès', preset: 0, manager: 'Mamadou Diop' },
  { key: 'agricole', card: /^Agricole/, name: "Champ d'arachide à Kaolack", city: 'Kaolack', preset: 0, manager: 'Ousmane Ndiaye' },
  { key: 'commerce', card: /^Commerce/, name: 'Boutique de quartier à Dakar', city: 'Dakar', preset: 1, manager: 'Awa Fall' },
  { key: 'scolarite', card: /^Scolarité/, name: 'Scolarité de Fatou', city: 'Dakar', preset: 1, manager: 'Cheikh Sarr' },
  { key: 'approvisionnement', card: /^Réapprovisionnement/, name: 'Stock de la boutique à Touba', city: 'Touba', preset: 1, manager: 'Modou Cissé' },
].filter((s) => !ONLY || ONLY.includes(s.key));

async function wizard(sec, { slow }) {
  await go('/app/projets/nouveau');
  const pick = `${sec.key === 'immobilier' ? 's1' : sec.key === 'agricole' ? 's2' : sec.key === 'commerce' ? 's3' : sec.key === 'scolarite' ? 's4' : 's5'}`;
  await narrate(`${pick}_pick`);
  await click(page.getByRole('button', { name: sec.card }), { pause: slow ? 500 : 250 });
  await click(page.getByRole('button', { name: /Continuer/ }));
  await page.getByText('Parlez-nous du projet').waitFor();
  await type(page.locator('main input').nth(0), sec.name, slow ? 45 : 22);
  await type(page.locator('main input').nth(1), sec.city, slow ? 60 : 30);
  await click(page.locator('main button', { hasText: /\$/ }).nth(sec.preset));
  await wait(slow ? 800 : 300);
  await click(page.getByRole('button', { name: /Continuer/ }));
  await page.getByText('Découpez en étapes').waitFor(); await wait(500);
  const steps = await page.evaluate(() => {
    const val = (e) => e.value;
    const names = [...document.querySelectorAll('main input[aria-label^="Nom de l"]')].map(val);
    const usd = [...document.querySelectorAll('main input[aria-label^="Montant de l"]')].map((e) => Number(e.value.replace(/\D/g, '')));
    const tog = [...document.querySelectorAll('main button[aria-pressed]')].map((e) => [e.getAttribute('aria-label'), e.getAttribute('aria-pressed') === 'true']);
    return names.map((title, i) => ({ title, usd: usd[i], toggles: tog.slice(i * 3, i * 3 + 3) }));
  });
  for (const s of steps) s.kinds = s.toggles.filter(([, on]) => on).map(([l]) => KIND[l]);
  if (slow) { await narrate('s1_steps'); await scrollBy(300, 1800); await scrollBy(300, 1800); await scrollBy(-600, 1200); }
  else { await narrate(`${pick}_steps`); await wait(1800); await scrollBy(250, 1500); }
  await click(page.getByRole('button', { name: /Continuer/ }));
  await page.getByText('Qui est vos yeux sur place').waitFor();
  if (slow) await narrate('s1_team');
  await type(page.locator('main input').nth(0), sec.manager, slow ? 60 : 30);
  await wait(slow ? 900 : 300);
  await click(page.getByRole('button', { name: /Continuer/ }));
  await page.getByText('Tout est bon ?').waitFor(); await wait(slow ? 1800 : 900);
  await click(page.getByRole('button', { name: /Créer le projet/ }));
  await idle(() => page.waitForURL(/\/app\/projets\/(?!nouveau)[^/?]+/, { timeout: 60000 }), 0.3);
  await idle(() => page.waitForLoadState('networkidle'), 0.3);
  const id = page.url().match(/\/app\/projets\/([^/?]+)/)[1];
  const link = (await page.locator('a[href*="/terrain/"]').first().getAttribute('href').catch(() => '')) || '';
  const token = link.split('/terrain/')[1];
  if (!token) throw new Error('no field link on the new project page');
  await wait(700);
  const budget = steps.reduce((n, s) => n + s.usd, 0);
  return { ...sec, id, token, steps, budget };
}

// ---- the field page, on screen ----
async function fieldProof(p, idx, attempt = 1) {
  const { s, supplier, phone, photos, invoice, fcfa } = await proofParts(p, idx);
  await go(`/terrain/${p.token}`);
  // invoice-only steps have no photo input: wait for any file input of the form (a step that is not open yet shows none: reload then)
  for (let i = 0; i < 6 && !(await page.locator('input[type=file]').count()); i++) { await wait(2500); await go(`/terrain/${p.token}`); }
  if (photos[0]) { await page.locator('input[type=file][multiple]').setInputFiles({ name: s.kinds.includes('titre') ? 'titre.png' : 'photo.jpg', mimeType: s.kinds.includes('titre') ? 'image/png' : 'image/jpeg', buffer: photos[0] }); await wait(1600); }
  if (invoice) {
    await page.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'facture.png', mimeType: 'image/png', buffer: invoice }); await wait(900);
    const amount = page.getByPlaceholder('1 500 000');
    if (await amount.count()) await type(amount, String(fcfa), 25);
  }
  await scrollBy(380, 900);
  await type(page.getByPlaceholder('Ex. Quincaillerie Ndiaye'), supplier, 28);
  await type(page.getByPlaceholder('77 123 45 67'), phone.replace('+221', ''), 30);
  await click(page.getByRole('button', { name: /Wave/i }));
  await scrollBy(500, 700);
  await click(page.getByRole('button', { name: /Envoyer la preuve/ }));
  const sent = await idle(() => page.getByText(/Merci\. Le financeur va la regarder/).first().waitFor({ timeout: 40000 }).then(() => true, () => false));
  if (!sent) {
    // a request that hangs (the network of the recording machine blinks): look at what the server really has before doing it again
    const status = (await stateOf(p.id))[idx].status;
    console.log(`  (proof of step ${idx + 1}: no confirmation on screen, the server says "${status}")`);
    if (status !== 'proof_submitted') { if (attempt >= 3) throw new Error('proof not accepted'); return fieldProof(p, idx, attempt + 1); }
    await go(`/terrain/${p.token}`);
    return;
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(900);
}

// ---- the funder's decision and the payment, on screen ----
async function funderPays(p, idx, { showChecks = false, between } = {}) {
  const s = p.steps[idx];
  await go(`/app/projets/${p.id}/etapes/${(await stateOf(p.id))[idx].id}`);
  await page.getByRole('button', { name: /Valider et payer/ }).first().waitFor();
  if (showChecks) { await scrollBy(380, 1500); await scrollBy(320, 1500); }
  if (between) await between();
  await idle(quoteGate, 0.1);
  await click(page.getByRole('button', { name: /Valider et payer/ }));
  await page.getByRole('button', { name: /Confirmer et payer/ }).waitFor(); await wait(1500);
}
async function confirmPayment(p, idx) {
  await click(page.getByRole('button', { name: /Confirmer et payer/ }));
  const paid = await idle(() => page.getByText('Fournisseur payé').first().waitFor({ timeout: 60000 }).then(() => true, () => false), 0.4);
  if (!paid) {
    await idle(() => waitStep(p, idx, ['paid']), 0.2);
    await go(`/app/projets/${p.id}/etapes/${(await stateOf(p.id))[idx].id}`);
  }
  await wait(900);
}

const fundViaApi = async (p, cents) => {
  const f = await api('POST', `/api/projects/${p.id}/fundings`, { amountCents: cents, method: 'lightning' });
  await api('POST', `/api/fundings/${f.funding.id}/simulate`);
};

const INK = 'M0 100V46.5A48 48 0 0 1 28.408 2.68L34.783 18.459A31 31 0 0 0 17 46.5V100ZM61.217 18.459L67.592 2.68A48 48 0 0 1 96 46.5V100H79V46.5A31 31 0 0 0 61.217 18.459ZM109 50A51.5 51.5 0 1 1 212 50A51.5 51.5 0 1 1 109 50ZM126 50A34.5 34.5 0 1 0 195 50A34.5 34.5 0 1 0 126 50ZM224 -40H241V11.764A51.5 51.5 0 1 1 241 88.236V100H224ZM241 50A34.5 34.5 0 1 0 310 50A34.5 34.5 0 1 0 241 50ZM338 0H355V11.764A51.5 51.5 0 1 1 355 88.236V140H338ZM355 50A34.5 34.5 0 1 0 424 50A34.5 34.5 0 1 0 355 50ZM535 0H552V100H535V88.236A51.5 51.5 0 1 1 535 11.764ZM466 50A34.5 34.5 0 1 0 535 50A34.5 34.5 0 1 0 466 50ZM560 0H578.7L608.733 76.419L639.3 0H658L602 140H583.3L599.3 100Z';
const KEY = 'M38.028 17.148L31.653 1.369A48 48 0 0 1 64.347 1.369L57.972 17.148A31 31 0 0 0 38.028 17.148Z';
const END_CARD = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;background:#0B132B;color:#fff;font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center">
<svg viewBox="0 -40 658 180" style="height:96px"><path fill="#fff" fill-rule="evenodd" d="${INK}"/><path fill="#F7931A" d="${KEY}"/></svg>
<div style="font-size:92px;font-weight:700;line-height:1">Pay on <span style="color:#F7931A">proof.</span></div>
<div style="font-size:36px;font-weight:600;color:#D5DCEE">Real estate · Farming · Commerce · School fees · Restocking</div>
<div style="font-size:40px;font-weight:600">Live demo: nobpay.onrender.com</div>
<div style="font-size:30px;color:#9FB0D6">Open source (MIT): github.com/mouhaa-md/NobPay</div>
<div style="font-size:24px;color:#9FB0D6">Payments in this demo are simulated.</div></body>`;

const projects = {};
try {
  if (process.env.RESET === '1') {
    await api('POST', '/api/auth/demo'); // a reset needs the demo session
    const r = await ctx.request.post(BASE + '/api/dev/reset'); console.log('demo data reset (start): HTTP ' + r.status());
    await ctx.clearCookies();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (ONLY) {
    await api('POST', '/api/auth/demo');
    await page.goto(BASE + '/app/accueil', { waitUntil: 'networkidle' });
    cuts.push([0, +(tv() - 0.3).toFixed(2)]); cutTotal = tv() - 0.3;
  } else {
    // ---------- the problem and the idea (landing page) ----------
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await wait(1100);
    const ready = tv() - 0.3;
    cuts.push([0, +ready.toFixed(2)]); cutTotal = ready;
    await narrate('problem');
    await narrate('idea');
    await scrollBy(700, 1100); await scrollBy(1100, 1500);
    await narrate('tour');
    await scrollBy(900, 900); await scrollBy(-2700, 1200);

    // ---------- into the app with the demo account ----------
    await narrate('enter');
    await click(page.getByRole('link', { name: /Essayer l.application/ }), { force: true });
    await idle(async () => { await page.waitForURL('**/app/**'); await page.getByText('Essayer avec le compte démo').first().waitFor(); }, 0.3); await wait(1200);
    await narrate('dash');
    await click(page.getByText('Essayer avec le compte démo'));
    await idle(async () => { await page.waitForURL('**/app/accueil'); await page.getByText('Vos projets').first().waitFor(); }, 0.3); await wait(300);
    await glide(900, 260); await wait(700);
  }

  // ---------- 1. real estate: the whole diaspora corridor ----------
  for (const sec of SECTORS) {
    if (sec.key === 'immobilier') {
      const p = projects.immobilier = await wizard(sec, { slow: true });
      // relatives abroad add to the escrow with the family link
      await narrate('s1_family');
      const fam = await api('POST', `/api/projects/${p.id}/contribution`, {});
      await go(fam.path);
      await type(page.getByPlaceholder('Ex. Awa'), 'Awa', 70);
      await click(page.getByRole('button', { name: /^25 \$/ }));
      await click(page.getByRole('button', { name: /Générer la facture/ })); await wait(1500);
      await click(page.getByRole('button', { name: /Simuler le paiement/ }));
      await idle(() => page.getByText(/reçus, merci/).first().waitFor({ timeout: 40000 }), 0.4); await wait(1200);
      // the funder adds the rest
      await narrate('s1_fund');
      await go(`/app/projets/${p.id}/financer`);
      const rest = String(p.budget - 25);
      for (const k of rest) await click(page.getByRole('button', { name: new RegExp('^' + k + '$') }), { pause: 100 });
      await click(page.getByRole('button', { name: /Continuer/ })); await wait(800);
      await click(page.getByRole('button', { name: /Générer la facture/ })); await wait(2200);
      await click(page.getByRole('button', { name: /Simuler le paiement/ }));
      await idle(() => page.getByText(/reçu|Reçu|crédité/).first().waitFor({ timeout: 40000 }).catch(() => {}));
      await wait(900);
      // an independent witness
      await narrate('s1_witness');
      const wit = await api('POST', `/api/projects/${p.id}/witness`, { name: 'Ibrahima, voisin du terrain', required: false });
      await go(`/app/projets/${p.id}`);
      await scrollBy(900, 1500); await scrollBy(700, 1500);
      // the first proof: the land title
      await narrate('s1_field');
      await fieldProof(p, 0);
      await narrate('s1_wit2');
      await go(wit.path);
      await page.getByRole('button', { name: /Je confirme/ }).waitFor(); await wait(2200);
      await click(page.getByRole('button', { name: /Je confirme/ }));
      await idle(() => page.waitForTimeout(2500), 0.5);
      await narrate('s1_review');
      await funderPays(p, 0, { showChecks: true });
      await narrate('s1_pay');
      await confirmPayment(p, 0);
      await idle(async () => { for (let i = 1; i < p.steps.length; i++) await completeViaApi(p, i); }, 0.3);
      await narrate('s1_done');
      await go(`/app/projets/${p.id}`);
      await scrollBy(300, 1500); await scrollBy(300, 1500);
      continue;
    }

    const n = { agricole: 's2', commerce: 's3', scolarite: 's4', approvisionnement: 's5' }[sec.key];
    const p = projects[sec.key] = await wizard(sec, { slow: false });
    await idle(() => fundViaApi(p, p.budget * 100), 0.3);
    let first = 0;
    if (sec.key === 'approvisionnement') { await idle(() => completeViaApi(p, 0), 0.3); first = 1; } // the order is confirmed behind the scenes: the delivery is shown
    await go(`/app/projets/${p.id}`); await wait(900);
    await narrate(`${n}_field`);
    await fieldProof(p, first);
    await narrate(`${n}_pay`);
    await funderPays(p, first, { showChecks: sec.key === 'agricole' });
    await confirmPayment(p, first);
    if (sec.key === 'scolarite') {
      await narrate('s4_receipt');
      const rec = page.getByRole('link', { name: /Voir le reçu/ });
      if (await rec.count()) { await click(rec); await idle(() => page.waitForLoadState('networkidle'), 0.3); await wait(1800); await scrollBy(400, 1500); }
    }
    await idle(async () => { for (let i = first + 1; i < p.steps.length; i++) await completeViaApi(p, i); }, 0.3);
    await narrate(`${n}_done`);
    await go(`/app/projets/${p.id}`);
    await scrollBy(300, 1400);
  }

  // ---------- the ledger, the Bitcoin anchor, the public verification (on the first project) ----------
  if (ONLY) { console.log('done (ONLY)'); throw new Error('stop'); }
  const main = projects.immobilier ?? Object.values(projects)[0];
  await narrate('ledger1');
  await go(`/app/certificat/${main.id}`);
  await scrollBy(500, 1000);
  await narrate('ledger2');
  await click(page.getByRole('button', { name: /Ancrer l.état actuel sur Bitcoin/ }));
  await idle(() => page.getByText(/En attente|en attente d.un bloc|ancrage/i).first().waitFor({ timeout: 25000 }).catch(() => {}));
  await wait(1200);
  await narrate('verify1');
  const link = page.getByRole('link', { name: /Page publique/ });
  if (await link.count()) { await click(link); await idle(async () => { await page.waitForLoadState('networkidle'); await page.getByText(/Vérification publique/i).first().waitFor(); }, 0.3); await wait(500); } else { await go('/verifier'); }
  await narrate('verify2');
  await scrollBy(500, 1500); await scrollBy(500, 1500);
  await narrate('real');
  await scrollBy(450, 2400); await scrollBy(450, 2400);

  // ---------- end card ----------
  await narrate('end');
  await page.setContent(END_CARD); await wait(300);
  await after(); await wait(900);
  console.log('done');
} finally {
  const total = fv();
  writeFileSync(`${OUTDIR}/info.json`, JSON.stringify({ total: +total.toFixed(2), cuts, marks }, null, 2));
  if (process.env.RESET === '1') { try { const r = await ctx.request.post(BASE + '/api/dev/reset'); console.log('demo data reset (end): HTTP ' + r.status()); } catch (e) { console.log('RESET FAILED: ' + e.message); } }
  const video = page.video();
  await ctx.close();
  if (video) console.log('VIDEO', await video.path());
  await browser.close();
}
