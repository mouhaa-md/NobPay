// Enregistre la démonstration NobPay en vidéo (.webm) avec sous-titres et curseur visible.
//
// Usage (hors du dépôt, pour ne rien ajouter aux dépendances du projet) :
//   mkdir /tmp/rec && cd /tmp/rec && npm init -y && npm i playwright && npx playwright install chromium
//   # dans frontend/ : NEXT_DIST_DIR=.next-demo npm run build
//   # puis, base neuve : BITNOB_MODE=mock DATA_DIR=/tmp/demo-data NEXT_DIST_DIR=.next-demo npx next start -p 3120
//   RECORD=1 node /chemin/vers/docs/demo/record-demo.mjs http://localhost:3120
// La vidéo est écrite dans /tmp/nobpay-run/video (voir OUTDIR). Mode simulé : aucun argent réel, aucune clé.
// TAIL=1 ne rejoue que la seconde moitié (financement, certificat, vérification) pour la mettre au point.
// Les chemins ASSETS pointent vers frontend/public/demo : adaptez-les si le dépôt est ailleurs.
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
const BASE = process.argv[2];
const RECORD = process.env.RECORD === '1';
const OUTDIR = '/tmp/nobpay-run/video';
const ASSETS = '/workspaces/NobPay/frontend/public/demo';
mkdirSync(OUTDIR, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Africa/Dakar',
  geolocation: { latitude: 14.7886, longitude: -16.9262, accuracy: 9 }, permissions: ['geolocation'],
  ...(RECORD ? { recordVideo: { dir: OUTDIR, size: { width: 1280, height: 720 } } } : {}),
});
await ctx.addInitScript(() => {
  const css = `
  #demo-cap{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);max-width:64%;z-index:2147483647;pointer-events:none;
    background:rgba(8,14,34,.88);color:#fff;font:600 19px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:10px 22px;border-radius:14px;
    box-shadow:0 8px 30px rgba(0,0,0,.35);text-align:center;opacity:0;transition:opacity .35s}
  #demo-cap.on{opacity:1}
  #demo-cur{position:fixed;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.92);border:3px solid #1d4ed8;box-shadow:0 2px 10px rgba(0,0,0,.45);
    z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);transition:transform .08s}
  #demo-cur.down{transform:translate(-50%,-50%) scale(.7);background:#1d4ed8}
  .demo-ripple{position:fixed;width:20px;height:20px;border-radius:50%;border:3px solid #1d4ed8;z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);animation:demoRipple .6s ease-out forwards}
  @keyframes demoRipple{to{width:70px;height:70px;opacity:0}}`;
  const mount = () => {
    if (document.getElementById('demo-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const cap = document.createElement('div'); cap.id = 'demo-cap'; document.documentElement.appendChild(cap);
    const cur = document.createElement('div'); cur.id = 'demo-cur'; document.documentElement.appendChild(cur);
    const t = sessionStorage.getItem('demoCap'); if (t) { cap.textContent = t; cap.classList.add('on'); }
    const pos = JSON.parse(sessionStorage.getItem('demoPos') || '[40,40]'); cur.style.left = pos[0] + 'px'; cur.style.top = pos[1] + 'px';
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; sessionStorage.setItem('demoPos', JSON.stringify([e.clientX, e.clientY])); }, true);
    addEventListener('mousedown', (e) => { cur.classList.add('down'); const r = document.createElement('div'); r.className = 'demo-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
    addEventListener('mouseup', () => cur.classList.remove('down'), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
});
const page = await ctx.newPage();
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0).padStart(3)}s] ${m}`);
const T0 = Date.now();
const wait = (ms) => page.waitForTimeout(ms);
const say = async (text, ms = 3200) => { await page.evaluate((t) => { sessionStorage.setItem('demoCap', t || ''); const c = document.getElementById('demo-cap'); if (c) { c.textContent = t || ''; c.classList.toggle('on', !!t); } }, text); log(text ? `« ${text} »` : '(caption off)'); await wait(ms);
  // the caption lives only for its duration: the actions that follow are shown without a stale sentence
  if (text) await page.evaluate(() => { sessionStorage.setItem('demoCap', ''); document.getElementById('demo-cap')?.classList.remove('on'); }); };
const glide = async (x, y, steps = 28) => { await page.mouse.move(x, y, { steps }); };
const click = async (loc, { pause = 500 } = {}) => {
  await loc.first().scrollIntoViewIfNeeded(); await wait(250);
  const b = await loc.first().boundingBox(); if (!b) throw new Error('no box for ' + loc);
  await glide(b.x + b.width / 2, b.y + b.height / 2); await wait(pause); await loc.first().click(); 
};
const scrollBy = async (px, ms = 1400) => { await page.evaluate((p) => window.scrollBy({ top: p, behavior: 'smooth' }), px); await wait(ms); };
const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await wait(700); };
const type = async (loc, text) => { await click(loc, { pause: 300 }); await loc.first().pressSequentially(text, { delay: 85 }); };

const TAIL = process.env.TAIL === '1';
if (TAIL) await ctx.request.post(BASE + '/api/auth/demo');
if (!TAIL) {
// ---------- 1. Vitrine ----------
await go('/');
await say('NobPay : investir au pays, avec preuve.', 3200);
await say('La diaspora envoie des sommes énormes. Un transfert déplace l’argent, il n’en contrôle pas l’usage.', 4200);
await scrollBy(700, 1800);
await say('Chiffres de marché sourcés (IFAD, 2026) : ils décrivent le marché, pas des résultats de NobPay.', 3800);
await scrollBy(1500, 2000);
await say('Le principe : financer, prouver, libérer, vérifier.', 3200);
await scrollBy(-2200, 1500);
await say('C’est un prototype du hackathon Code & Chain Dakar. Voici le parcours, en mode démonstration.', 3600);

// ---------- 2. Entrée dans l'app ----------
await click(page.getByRole('link', { name: /Essayer la démo/ }));
await page.waitForURL('**/app/**'); await wait(900);
await say('On entre avec le compte de démonstration : aucun argent réel, Lightning et mobile money sont simulés.', 4200);
await click(page.getByText('Essayer avec le compte démo'));
await page.waitForURL('**/app/accueil'); await wait(1200);

// ---------- 3. Tableau de bord ----------
await say('Le tableau de bord : total en séquestre, projets, étapes payées.', 3500);
await glide(900, 260); await wait(600);
await say('Une preuve attend la décision du financeur : « Rien n’est payé sans votre accord ».', 4000);

// ---------- 4. Projet et étape ----------
await click(page.getByRole('link', { name: /Gérer le projet/ }).first());
await page.waitForURL('**/app/projets/p_villa'); await wait(1200);
await say('Résidence à Thiès : 24 000 $, six étapes. Chaque étape ne se paie que sur preuve.', 4200);
await scrollBy(450, 1600);
await click(page.getByText('Élévation des murs').first());
await page.waitForURL('**/etapes/**'); await wait(1400);
await say('La personne de confiance sur place a envoyé sa preuve : photos géolocalisées, facture, fournisseur à payer.', 4600);
await scrollBy(420, 1800);
await say('Le financeur regarde, puis décide. Il peut refuser la preuve, ou libérer le paiement.', 3800);

// ---------- 5. Paiement ----------
await click(page.getByRole('button', { name: /Valider et payer/ }));
await wait(1600);
await say('Avant de payer : le devis. Débit, taux, frais, et ce que reçoit le fournisseur. Le devis expire.', 4800);
await click(page.getByRole('button', { name: /Confirmer et payer/ }));
await say('Le paiement part directement au fournisseur, en mobile money.', 3600);
await page.getByText(/Paiement confirmé|Paiement effectué|libéré|payée/i).first().waitFor({ timeout: 25000 }).catch(() => {});
await wait(1800);
await say('Confirmation reçue par webhook signé : l’étape est payée, l’étape suivante s’ouvre.', 4200);

// ---------- 6. Côté terrain ----------
await go('/terrain/demo-villa-thies');
await say('Côté terrain : la personne de confiance ouvre un lien privé. Pas de compte, pas de mot de passe.', 4400);
await say('Étape 4 : Dalle. Elle envoie ses photos, la facture, et qui doit être payé.', 3800);
await page.locator('input[type=file][multiple]').setInputFiles(`${ASSETS}/proof-immobilier.jpg`); await wait(1500);
await say('La photo est datée et localisée par le téléphone.', 3200);
await page.locator('input[type=file][accept*="pdf"]').setInputFiles(`${ASSETS}/facture.svg`).catch(() => {}); await wait(1200);
await scrollBy(380, 1500);
await type(page.getByPlaceholder('Ex. Quincaillerie Ndiaye'), 'Quincaillerie Ndiaye');
await type(page.getByPlaceholder('77 123 45 67'), '77 654 32 10');
await click(page.getByRole('button', { name: /Wave/i }));
await say('Le fournisseur à payer : nom, numéro et opérateur mobile money.', 3400);
await scrollBy(500, 1500);
await click(page.getByRole('button', { name: /Envoyer la preuve/ }));
await page.getByText(/Preuve reçue|envoyée/i).first().waitFor({ timeout: 15000 }).catch(() => {});
await wait(1500);
await say('Preuve envoyée. Le financeur est prévenu, et décide.', 3200);

// ---------- 7. Nouveau projet ----------
await go('/app/projets/nouveau');
await say('Créer un projet : cinq écrans. Trois secteurs, des étapes proposées qu’on peut modifier.', 4200);
await click(page.getByText('Commerce').first());
await click(page.getByRole('button', { name: /Continuer/ }));
await wait(800);
await say('Un nom, une ville, un budget : ici 3 000 $.', 3000);
await type(page.locator('input').nth(0), 'Boutique de Sandaga');
await type(page.locator('input').nth(1), 'Dakar');
await type(page.locator('#budget'), '3000');
await wait(500);
await click(page.getByRole('button', { name: /Continuer/ })); await wait(900);
await say('Chaque étape : un nom, un montant, les preuves demandées. La somme doit égaler le budget.', 4200);
await click(page.getByRole('button', { name: /Continuer/ })); await wait(900);
await type(page.locator('input').first(), 'Mamadou Diop');
await say('La personne de confiance sur place recevra un lien privé.', 3200);
await click(page.getByRole('button', { name: /Continuer/ })); await wait(900);
await say('Récapitulatif, puis création du projet.', 2800);
await click(page.getByRole('button', { name: /Créer le projet|Créer/ }));
await page.waitForURL('**/app/projets/p_*'); await wait(1400);
await say('Le projet est créé avec son lien terrain, à envoyer par WhatsApp ou à copier.', 4200);

}
// ---------- 8. Financement ----------
let tailId = 'p_champ';
if (TAIL) { const r = await ctx.request.post(BASE + '/api/projects', { data: { name: 'Test fin', sector: 'commerce', city: 'Dakar', budgetCents: 300000, managerName: 'M', steps: [{ title: 'Un', amountCents: 100000, proofKinds: ['facture'] }, { title: 'Deux', amountCents: 200000, proofKinds: ['facture'] }] } }); tailId = (await r.json()).id; await go(`/app/projets/${tailId}/financer`); }
if (TAIL) {} else { await click(page.getByRole('link', { name: /Financer/ }).first());
await page.waitForURL('**/financer'); await wait(1200); }
await say('Financer : le versement se fait en Bitcoin Lightning. Les fonds restent en séquestre.', 4400);
for (const k of ['1', '0', '0', '0']) { await click(page.getByRole('button', { name: new RegExp('^' + k + '$') }), { pause: 180 }); }
await click(page.getByRole('button', { name: /Continuer/ })); await wait(1300);
await say('On choisit Bitcoin Lightning. Le dépôt en USDT ou USDC viendra plus tard.', 3600);
await click(page.getByRole('button', { name: /Générer la facture/ })); await wait(1800);
await say('Une facture Lightning et son code QR. En mode démonstration, elle n’est pas payable.', 4200);
await click(page.getByRole('button', { name: /Simuler le paiement/ }));
await page.getByText(/reçu|Reçu|crédité/).first().waitFor({ timeout: 15000 }).catch(() => {});
await wait(1800);
await say('Paiement reçu par un événement signé : le séquestre est crédité, la première étape s’ouvre.', 4400);

// ---------- 9. Certificat et vérification ----------
await go('/app/certificat/p_villa');
await say('Chaque événement s’ajoute à un registre enchaîné par hachage : changer une ligne casse toute la suite.', 4600);
await scrollBy(500, 1600);
await click(page.getByRole('button', { name: /Ancrer l.état actuel sur Bitcoin/ }));
await say('On ancre l’empreinte du registre sur Bitcoin avec OpenTimestamps. Seule l’empreinte quitte l’application.', 4600);
await page.getByText(/En attente|en attente d.un bloc|ancrage/i).first().waitFor({ timeout: 20000 }).catch(() => {});
await wait(2500);
const link = page.getByRole('link', { name: /Page publique/ });
if (await link.count()) { await click(link); await page.waitForLoadState('networkidle'); await wait(2500);
  await say('La page publique : n’importe qui vérifie le dossier, sans compte. Le navigateur refait les calculs.', 5000);
  await scrollBy(400, 1800);
} else { await go('/verifier'); await say('La page de vérification publique : sans compte, tout se calcule dans le navigateur.', 4600); }
await say('NobPay : l’argent de la diaspora, libéré étape par étape, sur preuve. Vérifiable par tous.', 5000);
await say('', 600);

log('done');
const video = page.video();
await ctx.close();
if (RECORD && video) { const p = await video.path(); console.log('VIDEO', p); }
await browser.close();
