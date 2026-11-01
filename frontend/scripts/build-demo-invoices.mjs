#!/usr/bin/env node
/**
 * Draws the demonstration invoices (public/demo/factures/<stepId>.png) and their manifest.json.
 * One invoice per seeded step, with the supplier of that step and a total that is EXACTLY the step amount at the demo
 * rate, so the picture a visitor opens agrees with the amount typed in the proof (and with what an AI reads on it).
 *
 * Usage:  node scripts/build-demo-invoices.mjs        (needs the `sharp` dev dependency; text uses the system Arial)
 * Run it again when the demo rate or a seeded step changes: tests/seed.test.ts fails while the manifest is out of date.
 * Invoices carry no date on purpose: the demonstration data is relative to "now", a printed date would drift.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RATE = 593; // XOF per dollar, same as DEFAULT_USD_XOF in src/server/config.ts (observed at Bitnob on 18 Oct. 2026)
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo', 'factures');

/** [label, quantity, weight]: the weights share the total; the last line takes the rounding remainder. */
const INVOICES = [
  {
    step: 'p_villa_s1', usd: 1200, supplier: 'CABINET FALL, GÉOMÈTRE', place: 'Thiès', ninea: '0051 207', phone: '77 123 45 67', no: '2026-117', pay: 'Orange Money',
    lines: [['Vérification du titre foncier (Thiès)', 1, 30], ['Bornage et plan de situation', 1, 50], ['Droits et frais de timbre', 1, 20]],
  },
  {
    step: 'p_villa_s2', usd: 4800, supplier: 'QUINCAILLERIE NDIAYE', place: 'Thiès', ninea: '0042 118', phone: '77 654 32 10', no: '0388', pay: 'Wave',
    lines: [['Ciment CPJ 45 (sac 50 kg)', 180, 30], ['Fer à béton Ø12 (barre)', 120, 40], ['Gravier 15/25 (camion 20 t)', 3, 20], ['Sable de construction (camion)', 4, 10]],
  },
  {
    step: 'p_villa_s3', usd: 6000, supplier: 'QUINCAILLERIE NDIAYE', place: 'Thiès', ninea: '0042 118', phone: '77 654 32 10', no: '0412', pay: 'Wave',
    lines: [['Ciment CPJ 45 (sac 50 kg)', 120, 1440], ['Fer à béton Ø12 (barre)', 80, 2080], ['Parpaings 15 cm', 900, 1040]],
  },
  {
    step: 'p_champ_s1', usd: 1350, supplier: 'COOPÉRATIVE SINE-SALOUM', place: 'Kaolack', ninea: '0067 342', phone: '77 999 88 77', no: 'C-2026-054', pay: 'Wave',
    lines: [['Labour mécanisé (hectare)', 3, 55], ['Fumure organique (tonne)', 6, 30], ['Main-d’œuvre de planage (journée)', 12, 15]],
  },
  {
    step: 'p_champ_s2', usd: 1350, supplier: 'COOPÉRATIVE SINE-SALOUM', place: 'Kaolack', ninea: '0067 342', phone: '77 999 88 77', no: 'C-2026-071', pay: 'Wave',
    lines: [['Graines maraîchères sélectionnées (lot)', 18, 45], ['Substrat et sachets de repiquage', 2000, 25], ['Main-d’œuvre de semis (journée)', 10, 30]],
  },
  {
    step: 'p_champ_s3', usd: 2700, supplier: 'COOPÉRATIVE SINE-SALOUM', place: 'Kaolack', ninea: '0067 342', phone: '77 999 88 77', no: 'C-2026-103', pay: 'Wave',
    lines: [['Engrais NPK 15-15-15 (sac 50 kg)', 60, 45], ['Produits phytosanitaires (lot)', 1, 20], ['Arrosage : pompe et tuyaux (forfait)', 1, 25], ['Entretien (main-d’œuvre du mois)', 1, 10]],
  },
  {
    step: 'p_boutique_s1', usd: 1000, supplier: 'GROSSISTE TOUBA TEXTILES', place: 'Touba, marché Ocass', ninea: '0073 915', phone: '77 888 99 00', no: 'T-5521', pay: 'Orange Money',
    lines: [['Bazin riche 5 yards (pièce)', 60, 50], ['Wax Hollandais 6 yards (pièce)', 80, 35], ['Voiles et foulards (lot)', 25, 15]],
  },
];

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function amounts(total, lines) {
  const sum = lines.reduce((s, l) => s + l[2], 0);
  const parts = lines.slice(0, -1).map((l) => Math.round((total * l[2]) / sum / 1000) * 1000);
  return [...parts, total - parts.reduce((s, v) => s + v, 0)];
}

function svg(inv, total) {
  const shares = amounts(total, inv.lines);
  const rows = inv.lines
    .map((l, i) => {
      const y = 240 + i * 30;
      return `<text x="32" y="${y}">${esc(l[0])}</text><text x="330" y="${y}" text-anchor="end">${fmt(l[1])}</text><text x="448" y="${y}" text-anchor="end">${fmt(shares[i])}</text>`;
    })
    .join('');
  const endY = 240 + inv.lines.length * 30 + 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
  <rect width="480" height="640" fill="#ffffff"/>
  <rect width="480" height="84" fill="#eff4ff"/>
  <text x="32" y="50" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#0b1c30">${esc(inv.supplier)}</text>
  <text x="32" y="72" font-family="Arial, sans-serif" font-size="12" fill="#434655">${esc(inv.place)} · NINEA ${inv.ninea} · Tél. ${inv.phone}</text>
  <text x="32" y="130" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#0037b0">FACTURE N° ${esc(inv.no)}</text>
  <text x="32" y="152" font-family="Arial, sans-serif" font-size="12" fill="#434655">Document d'exemple (données de démonstration)</text>
  <line x1="32" y1="176" x2="448" y2="176" stroke="#c4c5d7"/>
  <g font-family="Arial, sans-serif" font-size="13" fill="#0b1c30">
    <text x="32" y="206" font-weight="700">Désignation</text><text x="330" y="206" font-weight="700" text-anchor="end">Qté</text><text x="448" y="206" font-weight="700" text-anchor="end">Montant (FCFA)</text>
    ${rows}
  </g>
  <line x1="32" y1="${endY}" x2="448" y2="${endY}" stroke="#c4c5d7"/>
  <text x="32" y="${endY + 42}" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#0b1c30">TOTAL</text>
  <text x="448" y="${endY + 42}" text-anchor="end" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#0b1c30">${fmt(total)} FCFA</text>
  <text x="32" y="${endY + 90}" font-family="Arial, sans-serif" font-size="13" fill="#434655">Payé par mobile money (${inv.pay}) à réception.</text>
  <rect x="300" y="${endY + 130}" width="148" height="72" rx="8" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="374" y="${endY + 172}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#1d4ed8">PAYÉ</text>
</svg>`;
}

mkdirSync(out, { recursive: true });
const manifest = { rate: RATE, invoices: {} };
for (const inv of INVOICES) {
  const total = Math.round(inv.usd * RATE);
  await sharp(Buffer.from(svg(inv, total)), { density: 192 }).png({ compressionLevel: 9, palette: true }).toFile(path.join(out, `${inv.step}.png`));
  manifest.invoices[inv.step] = { totalFcfa: total, usd: inv.usd, supplier: inv.supplier, number: inv.no };
}
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${INVOICES.length} factures écrites dans ${path.relative(process.cwd(), out)} (taux ${RATE})`);
