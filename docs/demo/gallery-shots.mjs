// Takes clean, high-resolution screenshots of the demo for the Devpost gallery (desktop screens, French interface).
//   PLAYWRIGHT=/path/to/playwright-core/index.mjs OUTDIR=<dir> RESET=1 node docs/demo/gallery-shots.mjs https://nobpay.onrender.com
// Nothing is paid or confirmed: the quote window is closed with "Annuler", the invoice is not paid. The Bitcoin anchoring is requested once
// (to show the public verification page). RESET=1 puts the demo data back at the end (use it on an online instance).
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright');
const BASE = process.argv[2];
const OUT = process.env.OUTDIR;
if (!BASE || !OUT) throw new Error('usage: OUTDIR=… node gallery-shots.mjs <url>');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Africa/Dakar', reducedMotion: 'reduce' });
ctx.setDefaultTimeout(60000);
await ctx.request.post(BASE + '/api/auth/demo'); // the demo session, as the "Essayer avec le compte démo" button does
const page = await ctx.newPage();
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(600); };
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
try {
  await go('/app/accueil'); await page.getByText('Vos projets').first().waitFor(); await shot('dashboard');
  await go('/app/projets/p_villa'); await page.getByText('Élévation des murs').first().waitFor(); await shot('project');
  await page.getByText('Élévation des murs').first().click();
  await page.waitForURL('**/etapes/**'); await page.getByRole('button', { name: /Valider et payer/ }).first().waitFor(); await shot('step');
  await page.getByRole('button', { name: /Valider et payer/ }).first().click();
  await page.getByText('Confirmer le paiement').first().waitFor(); await shot('quote');
  await page.getByRole('button', { name: /Annuler/ }).first().click(); // nothing is paid
  await go('/app/projets/p_champ/financer');
  for (const k of ['5', '0', '0']) await page.getByRole('button', { name: new RegExp('^' + k + '$') }).first().click();
  await page.getByRole('button', { name: /Continuer/ }).first().click();
  await page.getByRole('button', { name: /Générer la facture/ }).first().click();
  await page.getByText(/non payable/i).first().waitFor(); await shot('invoice');
  await go('/app/certificat/p_villa'); await page.getByText('Registre intact').first().waitFor(); await shot('ledger');
  await page.getByRole('button', { name: /Ancrer l.état actuel sur Bitcoin/ }).first().click();
  await page.getByText(/En attente|en attente d.un bloc|ancrage/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByRole('link', { name: /Page publique/ }).first().click();
  await page.waitForLoadState('networkidle'); await page.getByText(/Vérification publique/i).first().waitFor(); await shot('verify');
} finally {
  if (process.env.RESET === '1') { const r = await ctx.request.post(BASE + '/api/dev/reset'); console.log('demo data reset: HTTP ' + r.status()); }
  await ctx.close(); await browser.close();
}
