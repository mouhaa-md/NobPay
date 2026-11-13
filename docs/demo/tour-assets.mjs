// Proof files for the tour video: one invoice and (when the step asks for photos) distinct photos for each step of each business model.
// They are made on the fly so that no two steps share a file: the app's own checks (same file or same picture used elsewhere) stay quiet.
//   import { invoicePng, photoJpg, titlePng } from './tour-assets.mjs'
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const sharp = require(fileURLToPath(new URL('../../frontend/node_modules/sharp', import.meta.url)));
const DEMO = fileURLToPath(new URL('../../frontend/public/demo', import.meta.url));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fcfa = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

/** A bill in the style of the demo's invoices; the total is the amount asked in the proof form. */
export async function invoicePng({ supplier, place, phone, title, totalFcfa, number, lines }) {
  const rows = lines && lines.length ? lines : [{ label: title, qty: 1, amount: totalFcfa }];
  const body = rows.map((r, i) => `
    <text x="86" y="${628 + i * 80}" font-size="34" fill="#0B132B">${esc(r.label)}</text>
    <text x="880" y="${628 + i * 80}" font-size="34" fill="#0B132B" text-anchor="end">${esc(r.qty)}</text>
    <text x="1194" y="${628 + i * 80}" font-size="34" fill="#0B132B" text-anchor="end">${fcfa(r.amount)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1700" font-family="Segoe UI, Arial, sans-serif">
    <rect width="1280" height="1700" fill="#fff"/><rect width="1280" height="224" fill="#EEF3FF"/>
    <text x="86" y="136" font-size="60" font-weight="700" fill="#0B132B">${esc(supplier.toUpperCase())}</text>
    <text x="86" y="190" font-size="30" fill="#4A4F63">${esc(place)} · Tél. ${esc(phone)}</text>
    <text x="86" y="350" font-size="56" font-weight="700" fill="#0A3DB8">FACTURE N° ${esc(number)}</text>
    <text x="86" y="404" font-size="30" fill="#4A4F63">Document d'exemple (données de démonstration)</text>
    <line x1="86" y1="468" x2="1194" y2="468" stroke="#CFCDE0" stroke-width="3"/>
    <text x="86" y="548" font-size="32" font-weight="700" fill="#0B132B">Désignation</text>
    <text x="880" y="548" font-size="32" font-weight="700" fill="#0B132B" text-anchor="end">Qté</text>
    <text x="1194" y="548" font-size="32" font-weight="700" fill="#0B132B" text-anchor="end">Montant (FCFA)</text>
    ${body}
    <line x1="86" y1="1000" x2="1194" y2="1000" stroke="#CFCDE0" stroke-width="3"/>
    <text x="86" y="1090" font-size="48" font-weight="700" fill="#0B132B">TOTAL</text>
    <text x="1194" y="1090" font-size="48" font-weight="700" fill="#0B132B" text-anchor="end">${fcfa(totalFcfa)} FCFA</text>
    <text x="86" y="1190" font-size="32" fill="#4A4F63">Payé par mobile money (Wave) à réception.</text>
    <rect x="800" y="1250" width="394" height="190" rx="28" fill="none" stroke="#1D4ED8" stroke-width="6" stroke-dasharray="22 14"/>
    <text x="997" y="1360" font-size="46" font-weight="700" fill="#1D4ED8" text-anchor="middle">PAYÉ</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const BASE = { immobilier: 'proof-immobilier.jpg', agricole: 'proof-agricole.jpg', commerce: 'proof-commerce.jpg' };

/** A photo for step number `n`: another region and tone of the sector's demo picture, so that no two are alike. */
export async function photoJpg(kind, n) {
  const img = sharp(readFileSync(`${DEMO}/${BASE[kind] ?? BASE.commerce}`));
  const { width, height } = await img.metadata();
  const w = Math.round(width * 0.62), h = Math.round(height * 0.62);
  const left = Math.round(((n * 37) % 100) / 100 * (width - w)), top = Math.round(((n * 53) % 100) / 100 * (height - h));
  return img.extract({ left, top, width: w, height: h }).modulate({ brightness: 0.92 + (n % 4) * 0.04, hue: (n * 9) % 30 }).resize(1280).jpeg({ quality: 82 }).toBuffer();
}

/** The land title, as a picture the field form accepts (the demo's own file is an SVG, which uploads refuse). */
export async function titlePng() {
  return sharp(readFileSync(`${DEMO}/titre-foncier.svg`)).resize(1100).png().toBuffer();
}
