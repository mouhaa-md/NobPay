// Enregistre la démonstration NobPay en vidéo AVEC VOIX (pas de sous-titres), prête à être assemblée avec la narration.
// Chaque scène dure au moins le temps de sa phrase (durées lues dans narr/durations.json, voir docs/demo/voice/).
// Un éclair rouge de calibration permet de recaler exactement le son sur l'image (voir voice/assemble.py).
// Chaîne complète : 1) voice/synth.py (voix) 2) ce script (vidéo + timeline.json) 3) voice/assemble.py (piste son)
// 4) ffmpeg : -ss <trim> -i video.webm -i narration_full.wav -c:v libx264 -crf 23 -pix_fmt yuv420p -c:a aac -b:a 80k out.mp4
// Mêmes prérequis que record-demo.mjs (Playwright hors du dépôt, serveur en mode simulé sur base neuve).
// Les chemins /tmp/nobpay-run/... sont ceux utilisés lors de l'enregistrement : adaptez-les.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2];
const OUTDIR = '/tmp/nobpay-run/video2';
const ASSETS = '/workspaces/NobPay/frontend/public/demo';
const DUR = JSON.parse(readFileSync('/tmp/nobpay-run/narr/durations.json', 'utf8'));
mkdirSync(OUTDIR, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Africa/Dakar',
  geolocation: { latitude: 14.7886, longitude: -16.9262, accuracy: 9 }, permissions: ['geolocation'],
  recordVideo: { dir: OUTDIR, size: { width: 1280, height: 720 } },
});
// visible cursor and click ripple only: NO captions in this version
await ctx.addInitScript(() => {
  const css = `#demo-cur{position:fixed;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.92);border:3px solid #1d4ed8;box-shadow:0 2px 10px rgba(0,0,0,.45);z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);transition:transform .08s}
  #demo-cur.down{transform:translate(-50%,-50%) scale(.7);background:#1d4ed8}
  .demo-ripple{position:fixed;width:20px;height:20px;border-radius:50%;border:3px solid #1d4ed8;z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);animation:demoRipple .6s ease-out forwards}
  @keyframes demoRipple{to{width:70px;height:70px;opacity:0}}`;
  const mount = () => {
    if (document.getElementById('demo-cur')) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const cur = document.createElement('div'); cur.id = 'demo-cur'; document.documentElement.appendChild(cur);
    const pos = JSON.parse(sessionStorage.getItem('demoPos') || '[640,360]'); cur.style.left = pos[0] + 'px'; cur.style.top = pos[1] + 'px';
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; sessionStorage.setItem('demoPos', JSON.stringify([e.clientX, e.clientY])); }, true);
    addEventListener('mousedown', (e) => { cur.classList.add('down'); const r = document.createElement('div'); r.className = 'demo-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
    addEventListener('mouseup', () => cur.classList.remove('down'), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
});
const page = await ctx.newPage();
const T0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const wait = (ms) => page.waitForTimeout(Math.max(0, ms));
const glide = async (x, y, steps = 30) => { await page.mouse.move(x, y, { steps }); };
const center = async (loc) => { await loc.first().waitFor({ state: 'visible', timeout: 4000 }); await loc.first().scrollIntoViewIfNeeded({ timeout: 4000 }); const b = await loc.first().boundingBox(); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const point = async (loc, pause = 700) => { const c = await center(loc).catch(() => null); if (c) { await glide(c.x, c.y); await wait(pause); } };
const click = async (loc, pause = 450) => { await point(loc, pause); await loc.first().click(); };
const scrollBy = async (px, ms = 1400) => { await page.evaluate((p) => window.scrollBy({ top: p, behavior: 'smooth' }), px); await wait(ms); };
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await wait(800); };
const type = async (loc, text) => { await click(loc, 250); await loc.first().pressSequentially(text, { delay: 65 }); };

// --- calibration flash: a red full-screen frame at a known time, to align audio and video exactly ---
await wait(1000);
const flashAt = Date.now() - T0;
await page.evaluate(() => { const d = document.createElement('div'); d.id = 'flash'; d.style.cssText = 'position:fixed;inset:0;background:#e00000;z-index:2147483647'; document.documentElement.appendChild(d); });
await wait(500);
await page.evaluate(() => document.getElementById('flash')?.remove());
const flashEnd = Date.now() - T0;
await wait(900);

const timeline = [];
const LEAD = 450, TAIL = 900;
/** setup: not narrated (navigation, clicks). body: runs while the sentence plays. The scene lasts at least the sentence. */
async function scene(id, setup, body) {
  if (setup) await setup();
  await wait(LEAD);
  const narrStart = Date.now();
  timeline.push({ id, at: narrStart - T0 });
  log(`▶ ${id} (${DUR[id].seconds.toFixed(1)} s)`);
  const end = narrStart + DUR[id].seconds * 1000 + TAIL;
  const remaining = () => end - Date.now();
  if (body) await body(remaining);
  await wait(remaining());
}

await scene('intro', () => go('/'), async (rem) => { await glide(300, 260); await wait(3500); await glide(520, 330); await wait(5000); await glide(900, 200); await wait(4000); await scrollBy(250, 1500); });
await scene('chiffres', () => scrollBy(650, 1800), async () => { await glide(300, 300); await wait(3500); await glide(640, 420); await wait(3500); await scrollBy(300, 1500); });
await scene('principe', () => scrollBy(1100, 1800), async (rem) => { for (let i = 0; i < 3; i++) { await glide(420 + i * 60, 330); await scrollBy(300, 1700); } });
await scene('entree', async () => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(1600); await click(page.getByRole('link', { name: /Essayer la démo/ })); await page.waitForURL('**/app/**'); await wait(900); },
  async (rem) => { await point(page.getByText('Essayer avec le compte démo'), 600); await wait(rem() - 1800); await page.getByText('Essayer avec le compte démo').first().click(); await page.waitForURL('**/app/accueil'); });
await scene('accueil', () => wait(1200), async () => { await glide(1000, 190); await wait(2800); await glide(640, 420); await wait(2800); await glide(900, 830 > 720 ? 600 : 830); await wait(2000); });
await scene('projet', async () => { await click(page.getByRole('link', { name: /Gérer le projet/ }).first()); await page.waitForURL('**/app/projets/p_villa'); await wait(1000); },
  async (rem) => { await wait(4500); await scrollBy(400, 1500); await click(page.getByText('Élévation des murs').first()); await page.waitForURL('**/etapes/**'); await wait(1200); await glide(430, 260); await wait(2500); });
await scene('decision', null, async () => { await scrollBy(300, 1400); await glide(420, 330); await wait(2000); await scrollBy(300, 1400); await glide(1000, 200); await wait(1500); });
await scene('devis', async () => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(900); await click(page.getByRole('button', { name: /Valider et payer/ })); await wait(1300); },
  async (rem) => { for (const t of ['Débité de votre séquestre', 'Taux appliqué', 'Frais', 'Le fournisseur reçoit']) { await point(page.getByText(t).first(), 1100); } await point(page.getByRole('button', { name: /Confirmer et payer/ }), 300); await wait(rem() - 900); await page.getByRole('button', { name: /Confirmer et payer/ }).click(); });
await scene('paye', null, async () => { await page.getByText(/Paiement confirmé|Paiement effectué|libéré|payée/i).first().waitFor({ timeout: 20000 }).catch(() => {}); await glide(640, 360); await wait(1500); });
await scene('terrain', () => go('/terrain/demo-villa-thies'), async () => { await glide(300, 150); await wait(3000); await scrollBy(300, 1500); await glide(640, 400); await wait(2500); });
await scene('formulaire', null, async () => {
  await page.locator('input[type=file][multiple]').setInputFiles(`${ASSETS}/proof-immobilier.jpg`); await wait(1800);
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles(`${ASSETS}/facture.svg`).catch(() => {}); await wait(1200);
  await scrollBy(380, 1300);
  await type(page.getByPlaceholder('Ex. Quincaillerie Ndiaye'), 'Quincaillerie Ndiaye');
  await type(page.getByPlaceholder('77 123 45 67'), '77 654 32 10');
  await click(page.getByRole('button', { name: /Wave/i }));
});
await scene('envoi', async () => { await scrollBy(500, 1200); }, async () => { await click(page.getByRole('button', { name: /Envoyer la preuve/ })); await page.getByText(/Preuve reçue|envoyée/i).first().waitFor({ timeout: 15000 }).catch(() => {}); await wait(1000); });
await scene('nouveau', () => go('/app/projets/nouveau'), async () => {
  await click(page.getByText('Commerce').first()); await click(page.getByRole('button', { name: /Continuer/ })); await wait(700);
  await type(page.locator('input').nth(0), 'Boutique de Sandaga'); await type(page.locator('input').nth(1), 'Dakar'); await type(page.locator('#budget'), '3000'); });
await scene('nouveau2', null, async (rem) => {
  await click(page.getByRole('button', { name: /Continuer/ })); await wait(2500);
  await click(page.getByRole('button', { name: /Continuer/ })); await wait(700);
  await type(page.locator('input').first(), 'Mamadou Diop'); await click(page.getByRole('button', { name: /Continuer/ })); await wait(1000); });
await scene('cree', async () => { await click(page.getByRole('button', { name: /Créer le projet/ })); await page.waitForURL('**/app/projets/p_*'); await wait(1200); }, async () => { await glide(640, 360); await wait(2000); });
await scene('financer', async () => { await click(page.getByRole('link', { name: /Financer/ }).first()); await page.waitForURL('**/financer'); await wait(1000); },
  async (rem) => {
    for (const k of ['1', '0', '0', '0']) await click(page.getByRole('button', { name: new RegExp('^' + k + '$') }), 160);
    await click(page.getByRole('button', { name: /Continuer/ })); await wait(1200);
    await click(page.getByRole('button', { name: /Générer la facture/ })); await wait(1800);
    await point(page.getByRole('button', { name: /Simuler le paiement/ }), 300);
    await wait(rem() - 1800);
    await page.getByRole('button', { name: /Simuler le paiement/ }).first().click();
    await page.getByText(/reçu|Reçu|crédité/).first().waitFor({ timeout: 15000 }).catch(() => {}); });
await scene('certificat', () => go('/app/certificat/p_villa'), async (rem) => {
  await glide(500, 300); await wait(2500); await scrollBy(450, 1500); await wait(2000);
  await point(page.getByRole('button', { name: /Ancrer l.état actuel sur Bitcoin/ }), 600);
  await wait(Math.max(0, rem() - 4500)); await page.getByRole('button', { name: /Ancrer l.état actuel sur Bitcoin/ }).click();
  await page.getByText(/En attente|attente d.un bloc/i).first().waitFor({ timeout: 20000 }).catch(() => {}); });
await scene('public', async () => { const link = page.getByRole('link', { name: /Page publique/ }); if (await link.count()) { await click(link); await page.waitForLoadState('networkidle'); } else await go('/verifier'); await wait(1200); },
  async () => { await glide(640, 300); await wait(4000); await scrollBy(300, 1700); await glide(640, 420); await wait(4000); await scrollBy(250, 1500); });
await scene('fin', null, async () => { await scrollBy(-1200, 1800); await glide(640, 300); });
await wait(600);
const video = page.video();
const total = Date.now() - T0;
writeFileSync('/tmp/nobpay-run/narr/timeline.json', JSON.stringify({ flashAt, flashEnd, total, scenes: timeline }, null, 1));
await ctx.close();
console.log('VIDEO', await video.path(), 'total', (total / 1000).toFixed(1) + 's');
await browser.close();
