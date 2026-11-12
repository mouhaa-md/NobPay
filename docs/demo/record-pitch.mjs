// Records the short NARRATED pitch video: the screen part only. The voice (voice/synth-en.py) and the music (voice/music.py) are laid
// on it by voice/assemble-en.py, using the timings this script writes (info.json).
//
//   PLAYWRIGHT=/path/to/playwright-core/index.mjs NARR=<dir with durations.json> OUTDIR=<dir> RESET=1 \
//     node docs/demo/record-pitch.mjs https://nobpay.onrender.com
//
// The interface stays in French (its default language); the narration and the subtitle file are in English.
//
// How the timing works. Each sentence group of the narration (narration-en.json) is started by narrate(id) and the next one waits
// for it to finish, so the voice never overlaps itself. Waiting for the network (page loads, a payment being confirmed) shows
// nothing useful, so it is wrapped in idle(): those stretches are recorded but listed in info.json as "cuts", and the assembly
// removes them. All the times written for the voice are in the time of the FINAL video (cuts already taken out), so the
// voice follows the picture with no long silence. A silence longer than one second between two sentence groups is reported.
//
// Variables: PLAYWRIGHT, NARR (required), OUTDIR (required), ASSETS (proof files, default frontend/public/demo),
// SHOTS=1 (a screenshot at the start of each sentence group, in OUTDIR/shots), RESET=1 (put the demo data back at the end: use it
// on an online instance, because the journey creates a funding, a payment, a proof and an anchor).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright');
const BASE = process.argv[2];
const OUTDIR = process.env.OUTDIR;
const NARR = process.env.NARR;
const ASSETS = process.env.ASSETS || fileURLToPath(new URL('../../frontend/public/demo', import.meta.url));
const SHOTS = process.env.SHOTS === '1';
if (!BASE || !OUTDIR || !NARR) throw new Error('usage: OUTDIR=… NARR=… node record-pitch.mjs <url>');
mkdirSync(OUTDIR, { recursive: true });
if (SHOTS) mkdirSync(`${OUTDIR}/shots`, { recursive: true });
const dur = JSON.parse(readFileSync(`${NARR}/durations.json`, 'utf8'));
const GAP = 0.2; // seconds between two sentence groups

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Africa/Dakar',
  geolocation: { latitude: 14.7886, longitude: -16.9262, accuracy: 9 }, permissions: ['geolocation'],
  recordVideo: { dir: OUTDIR, size: { width: 1280, height: 720 } },
});
ctx.setDefaultTimeout(60000);
// a visible cursor with a ripple on each click (no caption box: the words are spoken)
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
const V0 = Date.now(); // the video starts when the page is created
const tv = () => (Date.now() - V0) / 1000; // time in the raw recording
const wait = (ms) => page.waitForTimeout(ms);

// ---- cuts: stretches of the raw recording that the assembly removes ----
const cuts = [];
let cutTotal = 0;
const fv = () => tv() - cutTotal; // time in the final video
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
  await after();
  const prevEnd = busyUntil - GAP;
  const silence = fv() - prevEnd;
  if (marks.length && silence > 1.0) console.log(`  ! ${silence.toFixed(1)} s without voice before "${id}"`);
  const start = fv() + 0.2;
  marks.push({ id, start: +start.toFixed(2) });
  busyUntil = start + dur[id] + GAP;
  console.log(`[${start.toFixed(0).padStart(3)}s] ${id} (${dur[id].toFixed(1)} s)` + (process.env.DEBUG_TIME ? `   raw ${tv().toFixed(1)}, cut so far ${cutTotal.toFixed(1)}` : ''));
  if (process.env.STOP_AFTER === id) throw new Error('stopped after ' + id);
  if (SHOTS) await page.screenshot({ path: `${OUTDIR}/shots/${String(++shotN).padStart(2, '0')}-${id}.png` });
};

const glide = async (x, y, steps = 12) => { await page.mouse.move(x, y, { steps }); };
// force: skip Playwright's wait for a "stable" element (the landing page's buttons float continuously, which made a click last seconds)
const click = async (loc, { pause = 220, force = false } = {}) => {
  const t0 = tv();
  await loc.first().scrollIntoViewIfNeeded(); await wait(150);
  const t1 = tv();
  const b = await loc.first().boundingBox(); if (!b) throw new Error('no box for ' + loc);
  const t2 = tv();
  await glide(b.x + b.width / 2, b.y + b.height / 2); await wait(pause);
  const t3 = tv();
  await idle(() => loc.first().click({ force }), 0.5); // a click that starts a slow request or page load: the waiting is cut
  if (tv() - t0 > 2) console.log(`  (a click took ${(tv() - t0).toFixed(1)} s: scroll ${(t1 - t0).toFixed(1)}, box ${(t2 - t1).toFixed(1)}, move ${(t3 - t2).toFixed(1)}, click ${(tv() - t3).toFixed(1)}; ${String(loc).slice(0, 70)})`);
};
const scrollBy = async (px, ms = 1000) => { await page.evaluate((p) => window.scrollBy({ top: p, behavior: 'smooth' }), px); await wait(ms); };
const go = async (path) => { await idle(() => page.goto(BASE + path, { waitUntil: 'networkidle' }), 0.3); await wait(350); };
const type = async (loc, text) => { await click(loc, { pause: 100 }); await loc.first().pressSequentially(text, { delay: 35 }); };

const INK = 'M0 100V46.5A48 48 0 0 1 28.408 2.68L34.783 18.459A31 31 0 0 0 17 46.5V100ZM61.217 18.459L67.592 2.68A48 48 0 0 1 96 46.5V100H79V46.5A31 31 0 0 0 61.217 18.459ZM109 50A51.5 51.5 0 1 1 212 50A51.5 51.5 0 1 1 109 50ZM126 50A34.5 34.5 0 1 0 195 50A34.5 34.5 0 1 0 126 50ZM224 -40H241V11.764A51.5 51.5 0 1 1 241 88.236V100H224ZM241 50A34.5 34.5 0 1 0 310 50A34.5 34.5 0 1 0 241 50ZM338 0H355V11.764A51.5 51.5 0 1 1 355 88.236V140H338ZM355 50A34.5 34.5 0 1 0 424 50A34.5 34.5 0 1 0 355 50ZM535 0H552V100H535V88.236A51.5 51.5 0 1 1 535 11.764ZM466 50A34.5 34.5 0 1 0 535 50A34.5 34.5 0 1 0 466 50ZM560 0H578.7L608.733 76.419L639.3 0H658L602 140H583.3L599.3 100Z';
const KEY = 'M38.028 17.148L31.653 1.369A48 48 0 0 1 64.347 1.369L57.972 17.148A31 31 0 0 0 38.028 17.148Z';
const END_CARD = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;background:#0B132B;color:#fff;font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center">
<svg viewBox="0 -40 658 180" style="height:96px"><path fill="#fff" fill-rule="evenodd" d="${INK}"/><path fill="#F7931A" d="${KEY}"/></svg>
<div style="font-size:92px;font-weight:700;line-height:1">Pay on <span style="color:#F7931A">proof.</span></div>
<div style="font-size:40px;font-weight:600">Live demo: nobpay.onrender.com</div>
<div style="font-size:30px;color:#9FB0D6">Open source (MIT): github.com/mouhaa-md/NobPay</div>
<div style="font-size:24px;color:#9FB0D6">Payments in this demo are simulated.</div></body>`;

try {
  // ---------- the problem and the idea (landing page) ----------
  // the landing page's floating animations make scrolling and clicks very slow on a modest recording machine (and unpredictable):
  // the whole journey is recorded with reduced motion, which keeps the page itself identical
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await wait(1100);
  const ready = tv() - 0.3; // everything before the page is ready is cut
  cuts.push([0, +ready.toFixed(2)]); cutTotal = ready;
  await narrate('problem');
  await narrate('idea');
  await scrollBy(700, 1100); await scrollBy(1100, 1500);
  await narrate('checkable');
  await scrollBy(900, 900); await scrollBy(-2700, 1200);

  // ---------- into the app with the demo account ----------
  await narrate('enter');
  await click(page.getByRole('link', { name: /Essayer l.application/ }), { force: true });
  await idle(async () => { await page.waitForURL('**/app/**'); await page.getByText('Essayer avec le compte démo').first().waitFor(); }, 0.3); await wait(1200);
  await narrate('dash'); // starts as she signs in: the page change itself is cut
  await click(page.getByText('Essayer avec le compte démo'));
  await idle(async () => { await page.waitForURL('**/app/accueil'); await page.getByText('Vos projets').first().waitFor(); }, 0.3); await wait(300);
  await glide(900, 260); await wait(500); await glide(420, 330);

  // ---------- funding: a Lightning invoice, credited by a simulated payment ----------
  await narrate('fund1');
  await go('/app/projets/p_champ/financer');
  for (const k of ['5', '0', '0']) await click(page.getByRole('button', { name: new RegExp('^' + k + '$') }), { pause: 120 });
  await click(page.getByRole('button', { name: /Continuer/ })); await wait(800);
  await narrate('fund2');
  await click(page.getByRole('button', { name: /Générer la facture/ })); await wait(1800);
  await wait(1200);
  await click(page.getByRole('button', { name: /Simuler le paiement/ }));
  await idle(() => page.getByText(/reçu|Reçu|crédité/).first().waitFor({ timeout: 25000 }).catch(() => {}));
  await wait(900);

  // ---------- the funder reviews the proof, sees the quote, pays ----------
  await narrate('review1');
  await go('/app/projets/p_villa');
  await scrollBy(450, 1000);
  await narrate('review2');
  await click(page.getByText('Élévation des murs').first());
  await idle(async () => { await page.waitForURL('**/etapes/**'); await page.getByRole('button', { name: /Valider et payer/ }).first().waitFor(); }, 0.3); await wait(700);
  await scrollBy(420, 1400);
  await click(page.getByRole('button', { name: /Valider et payer/ }));
  await wait(1100);
  await narrate('pay1');
  await narrate('pay2');
  await click(page.getByRole('button', { name: /Confirmer et payer/ }));
  await idle(() => page.getByText('Fournisseur payé').first().waitFor({ timeout: 45000 }).catch(() => console.log('payment not confirmed in time')));
  await wait(600);

  // ---------- the person on site: private link, no account ----------
  await narrate('field1');
  await go('/terrain/demo-villa-thies');
  // the next step opens once the payment is confirmed: reload until the proof form is there
  for (let i = 0; i < 12 && !(await page.locator('input[type=file][multiple]').count()); i++) { await wait(2500); await go('/terrain/demo-villa-thies'); }
  await narrate('field2');
  await page.locator('input[type=file][multiple]').setInputFiles(`${ASSETS}/proof-immobilier.jpg`); await wait(1500);
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles(`${ASSETS}/factures/p_villa_s3.png`).catch((e) => console.log('invoice not attached: ' + e.message.split('\n')[0])); await wait(900);
  await scrollBy(380, 1000);
  await narrate('field3');
  await type(page.getByPlaceholder('Ex. Quincaillerie Ndiaye'), 'Quincaillerie Ndiaye');
  await type(page.getByPlaceholder('77 123 45 67'), '77 654 32 10');
  await click(page.getByRole('button', { name: /Wave/i }));
  await scrollBy(500, 900);
  await click(page.getByRole('button', { name: /Envoyer la preuve/ }));
  await idle(() => page.getByText(/Merci\. Le financeur va la regarder/).first().waitFor({ timeout: 30000 }).catch(() => console.log('proof not confirmed in time')));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(900); // show the confirmation at the top

  // ---------- the ledger, the Bitcoin anchor, the public verification ----------
  await narrate('ledger1');
  await go('/app/certificat/p_villa');
  await scrollBy(500, 1000);
  await narrate('ledger2');
  await click(page.getByRole('button', { name: /Ancrer l.état actuel sur Bitcoin/ }));
  await idle(() => page.getByText(/En attente|en attente d.un bloc|ancrage/i).first().waitFor({ timeout: 25000 }).catch(() => {}));
  await wait(1200);
  await narrate('verify1');
  const link = page.getByRole('link', { name: /Page publique/ });
  if (await link.count()) { await click(link); await idle(async () => { await page.waitForLoadState('networkidle'); await page.getByText(/Vérification publique/i).first().waitFor(); }, 0.3); await wait(500); } else { await go('/verifier'); }
  await narrate('verify2');
  await scrollBy(400, 900);
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
  if (process.env.RESET === '1') { try { const r = await ctx.request.post(BASE + '/api/dev/reset'); console.log('demo data reset: HTTP ' + r.status()); } catch (e) { console.log('RESET FAILED: ' + e.message); } }
  const video = page.video();
  await ctx.close();
  if (video) console.log('VIDEO', await video.path());
  await browser.close();
}
