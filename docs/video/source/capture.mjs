// Drives the real app (mock mode, port 3002, fresh data) through every customer path and saves screenshots for the video.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { Tab, sleep } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:3002';
const FE = path.resolve(here, '..', '..', '..', 'frontend');
const OUT = path.join(here, 'assets', 'shots');
const S = (n) => path.join(OUT, n + '.png');
const log = (...a) => console.log(...a);
const only = process.argv[2]; // optional: run a single block

// ------------------------------------------------------------ document images used as proofs
const titre = path.join(here, 'assets', 'titre-foncier.jpg');
if (!existsSync(titre)) {
  const d = await Tab.open({ port: 9501, width: 1200, height: 900, scale: 1, base: BASE });
  await d.go(pathToFileURL(path.join(FE, 'public', 'demo', 'titre-foncier.svg')).href, 600);
  await d.shot(titre, { format: 'jpeg', quality: 92 });
  d.close();
  log('titre-foncier.jpg ready');
}

const t = await Tab.open({ port: 9502, width: 390, height: 844, scale: 2, mobile: true, base: BASE });
await t.geo(BASE, 14.791, -16.9359);

// remember where each tap lands on the previous screenshot (used by the video for finger / cursor animations)
const taps = [];
let last = '';
const origShot = t.shot.bind(t);
t.shot = async (file, o) => {
  last = path.basename(file, '.png');
  return origShot(file, o);
};
const rectJs = (find) => `(function(){const el=${find}; if(!el) return null; const b=el.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height,vw:innerWidth,vh:innerHeight}})()`;
const origClickText = t.clickText.bind(t);
t.clickText = async (text, tag = 'button') => {
  const r = await t.eval(rectJs(`[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.replace(/\\s+/g,' ').includes(${JSON.stringify(text)}))`));
  if (r) taps.push({ shot: last, text, ...r });
  return origClickText(text, tag);
};
const origClick = t.click.bind(t);
t.click = async (sel) => {
  const r = await t.eval(rectJs(`document.querySelector(${JSON.stringify(sel)})`));
  if (r) taps.push({ shot: last, text: sel, ...r });
  return origClick(sel);
};
let projectPath = '';
let stepPath = '';
let fieldLink = '';

try {
  // ======================================================== A. sign up
  await t.go('/app/bienvenue', 1500);
  await t.eval("localStorage.setItem('nobpay-install-dismissed','1')");
  await t.shot(S('a1-welcome'));
  await t.go('/app/inscription', 1300);
  await t.shot(S('a2-signup'));
  await t.setValue('input[placeholder="Aminata"]', 'Moussa');
  await t.setValue('input[placeholder="Sow"]', 'Diallo');
  await t.setValue('input[type=tel]', '6 98 76 54 32');
  await sleep(300);
  await t.shot(S('a3-signup-filled'));
  await t.clickText('Recevoir le code');
  await t.waitFor("document.body.innerText.includes('Code de confirmation')", 8000);
  await sleep(600);
  await t.shot(S('a4-otp'));
  await t.clickText('Remplir');
  await sleep(500);
  await t.shot(S('a5-otp-filled'));
  await t.clickText('Créer mon compte');
  await t.waitFor("location.pathname.startsWith('/app/accueil')", 10000);
  await sleep(1800);
  await t.shot(S('a6-dashboard-empty'));
  log('A ok', await t.eval('location.pathname'));

  // ======================================================== B. create a project
  await t.go('/app/projets/nouveau', 1500);
  await t.shot(S('b1-sector'));
  await t.clickText('Immobilier');
  await sleep(400);
  await t.shot(S('b1b-sector-picked'));
  await t.clickText('Continuer');
  await sleep(700);
  await t.setValue("input[placeholder='Villa familiale']", 'Maison familiale');
  await t.setValue("input[placeholder='Thiès']", 'Thiès');
  await t.setValue('#budget', '24000');
  await sleep(500);
  await t.shot(S('b2-details'));
  await t.clickText('Continuer');
  await sleep(800);
  await t.shot(S('b3-steps'));
  await t.shot(S('b3-steps-full'), { full: true });
  await t.clickText('Continuer');
  await sleep(700);
  await t.setValue("input[placeholder='Mamadou Diop']", 'Mamadou Diop');
  await sleep(300);
  await t.shot(S('b4-manager'));
  await t.clickText('Continuer');
  await sleep(700);
  await t.shot(S('b5-recap'));
  await t.shot(S('b5-recap-full'), { full: true });
  await t.clickText('Créer le projet');
  await t.waitFor("location.search.includes('cree=1')", 12000);
  await sleep(1500);
  projectPath = await t.eval('location.pathname');
  await t.shot(S('b6-created'));
  await t.shot(S('b6-created-full'), { full: true });
  log('B ok', projectPath);

  // ======================================================== C. fund the escrow (Lightning, simulated)
  const fin = await t.eval("[...document.querySelectorAll('a')].find(a=>(a.getAttribute('href')||'').endsWith('/financer'))?.getAttribute('href')");
  await t.go(fin, 1300);
  await t.shot(S('c1-fund-empty'));
  for (const k of ['6', '0', '0', '0']) await t.click(`button[aria-label='${k}']`);
  await sleep(500);
  await t.shot(S('c2-keypad'));
  await t.clickText('Continuer');
  await sleep(800);
  await t.shot(S('c3-method'));
  await t.clickText('Générer la facture');
  await sleep(2500);
  await t.shot(S('c4-invoice'));
  await t.shot(S('c4-invoice-full'), { full: true });
  await t.clickText('Simuler le paiement');
  await t.waitFor("document.body.innerText.includes('reçus')", 12000);
  await sleep(1500);
  await t.shot(S('c5-paid'));
  log('C ok');

  // ======================================================== D. project page + the private link for the team on site
  await t.go(projectPath, 1500);
  await t.shot(S('d1-project-funded'));
  await t.shot(S('d1-project-funded-full'), { full: true });
  await t.go('/app/profil', 1500);
  fieldLink = await t.eval("[...document.querySelectorAll('a')].find(a=>(a.getAttribute('href')||'').startsWith('/terrain/'))?.getAttribute('href')");
  await t.shot(S('d2-profile-links'));
  log('D ok', fieldLink);

  // ======================================================== E. the person on site sends the proof (no account)
  await t.go(fieldLink, 1800);
  await t.shot(S('e1-field-open'));
  await t.shot(S('e1-field-open-full'), { full: true });
  await t.upload('input[multiple]', [titre]);
  await sleep(1800);
  await t.setValue("input[placeholder^='Ex. Quincaillerie']", 'Cabinet Fall, géomètre');
  await t.setValue('input[type=tel]', '77 654 32 10');
  await t.clickText('Orange Money');
  await t.setValue('textarea', 'Titre vérifié, bornage effectué sur place.');
  await sleep(700);
  await t.shot(S('e2-field-filled'));
  await t.shot(S('e2-field-filled-full'), { full: true });
  await t.clickText('Envoyer la preuve');
  await t.waitFor("document.body.innerText.includes('Preuve envoyée')", 12000);
  await sleep(1200);
  await t.shot(S('e3-field-sent'));
  log('E ok');

  // ======================================================== F. the funder reviews, can refuse, then releases the payment
  await t.go('/app/notifications', 1500);
  await t.shot(S('f0-notifications'));
  await t.go(projectPath, 1500);
  await t.shot(S('f1-project-pending'));
  stepPath = await t.eval("[...document.querySelectorAll('a')].find(a=>(a.getAttribute('href')||'').includes('/etapes/'))?.getAttribute('href')");
  await t.go(stepPath, 1800);
  await t.shot(S('f2-review'));
  await t.shot(S('f2-review-full'), { full: true });
  await t.clickText('Refuser cette preuve');
  await sleep(900);
  await t.shot(S('f3-reject'));
  await t.clickText('Annuler');
  await sleep(600);
  await t.clickText('Valider et payer');
  await t.waitFor("!!document.querySelector('[role=dialog]')", 8000);
  await sleep(900);
  await t.shot(S('f4-quote'));
  await t.clickText('Confirmer et payer');
  await sleep(1300);
  await t.shot(S('f5-releasing'));
  await t.waitFor("document.body.innerText.includes('Fournisseur payé')", 20000);
  await sleep(1500);
  await t.shot(S('f6-paid'));
  await t.shot(S('f6-paid-full'), { full: true });
  log('F ok');

  // ======================================================== G. the supplier's receipt
  const recu = await t.eval("[...document.querySelectorAll('a')].find(a=>(a.getAttribute('href')||'').startsWith('/recu/'))?.getAttribute('href')");
  await t.go(recu, 1500);
  await t.shot(S('g1-receipt'));
  await t.shot(S('g1-receipt-full'), { full: true });
  log('G ok', recu);

  // ======================================================== H. wallet, dashboard, certificate, anchoring, public verification
  await t.go('/app/portefeuille', 1500);
  await t.shot(S('h1-wallet'));
  await t.go('/app/accueil', 1800);
  await t.shot(S('h2-dashboard'));
  const certHref = projectPath.replace('/app/projets/', '/app/certificat/');
  await t.go(certHref, 1800);
  await t.shot(S('h3-certificate'));
  await t.shot(S('h3-certificate-full'), { full: true });
  await t.clickText('Ancrer l’état actuel sur Bitcoin');
  await sleep(4500);
  await t.shot(S('h4-anchored'));
  await t.shot(S('h4-anchored-full'), { full: true });
  const verify = await t.eval("[...document.querySelectorAll('a')].find(a=>(a.getAttribute('href')||'').startsWith('/verifier/'))?.getAttribute('href')");
  log('anchor link', verify);
  if (verify) {
    await t.go(verify, 3500);
    await t.shot(S('h5-verify'));
    await t.shot(S('h5-verify-full'), { full: true });
  }
  log('H ok');

  // ======================================================== I. desktop, demo account (admin page, review state, site)
  await t.setDevice(1440, 900, 1.5, false);
  await t.go('/', 2500);
  await t.shot(S('z0-site'));
  await t.go('/app/bienvenue', 800);
  await t.eval("fetch('/api/auth/demo',{method:'POST'}).then(r=>r.status)");
  await t.go('/app/accueil', 2000);
  await t.shot(S('z1-dash-desktop'));
  await t.go('/app/projets/p_villa', 2000);
  await t.shot(S('z2-project-desktop'));
  await t.go('/app/projets/p_villa/etapes/p_villa_s3', 2200);
  await t.shot(S('z3-review-desktop'));
  await t.go('/app/certificat/p_villa', 2200);
  await t.shot(S('z4-certificate-desktop'));
  await t.go('/app/admin', 2200);
  await t.shot(S('z5-admin-desktop'));
  await t.shot(S('z5-admin-desktop-full'), { full: true });
  if (verify) {
    await t.go(verify, 3500);
    await t.shot(S('z6-verify-desktop'));
  }
  await t.go('/terrain/demo-villa-thies', 1800);
  await t.shot(S('z7-field-desktop'));
  log('I ok');
} catch (e) {
  log('FAILED', e);
} finally {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path.join(here, 'assets', 'taps.json'), JSON.stringify(taps, null, 1));
  log('errors:', [...new Set(t.errors)].slice(0, 6), 'taps:', taps.length);
  t.close();
}
