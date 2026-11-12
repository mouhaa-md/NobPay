// Builds the Devpost gallery images (3:2, 1200x800) from the screenshots taken by gallery-shots.mjs, the phone screenshots of the
// landing page and the brand files. Run from anywhere:  node docs/demo/gallery-compose.cjs <screenshots-dir> [out-dir]
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '../..');
const sharp = require(path.join(ROOT, 'frontend/node_modules/sharp'));
const SHOTS = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, 'docs/devpost-gallery');
fs.mkdirSync(OUT, { recursive: true });
const W = 1200, H = 800, INK = '#0B132B', ORANGE = '#F7931A', FONT = 'Segoe UI, Arial, sans-serif';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wrap = (t, n) => { const lines = []; let cur = ''; for (const w of t.split(' ')) { if ((cur + ' ' + w).trim().length > n) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) lines.push(cur); return lines; };
const save = (svg, layers, name) => sharp(Buffer.from(svg)).composite(layers).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));

(async () => {
  const logoSmall = await sharp(path.join(ROOT, 'docs/brand/nobpay-logo-white.png')).resize({ width: 132 }).png().toBuffer();
  const logoBig = await sharp(path.join(ROOT, 'docs/brand/nobpay-logo-white.png')).resize({ width: 340 }).png().toBuffer();

  // a desktop screenshot under a title and a one-sentence caption
  const desktop = async (name, shot, title, caption) => {
    const lines = wrap(caption, 76);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${INK}"/>
      <rect x="66" y="172" width="1068" height="606" rx="22" ry="22" fill="#1B2750"/>
      <text x="72" y="84" font-family="${FONT}" font-size="50" font-weight="700" fill="#FFFFFF">${esc(title)}</text>
      ${lines.map((l, i) => `<text x="72" y="${124 + i * 30}" font-family="${FONT}" font-size="25" fill="#D5DCEE">${esc(l)}</text>`).join('')}
    </svg>`;
    const mask = Buffer.from('<svg width="1056" height="594"><rect width="1056" height="594" rx="16" ry="16" fill="#fff"/></svg>');
    const img = await sharp(path.join(SHOTS, shot + '.png')).resize(1056, 594).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    await save(svg, [{ input: logoSmall, left: W - 132 - 60, top: 40 }, { input: img, left: 72, top: 178 }], name);
    console.log(name);
  };

  // a phone screenshot on the right, the text on the left
  const phone = async (name, webp, title, caption) => {
    const PW = 400, PX = 730, PY = 70, vis = H - PY, R = 44;
    const full = await sharp(path.join(ROOT, 'frontend/public/site', webp)).resize({ width: PW }).png().toBuffer();
    const mask = Buffer.from(`<svg width="${PW}" height="${vis}"><path d="M0,${R} A${R},${R} 0 0 1 ${R},0 H${PW - R} A${R},${R} 0 0 1 ${PW},${R} V${vis} H0 Z" fill="#fff"/></svg>`);
    const ph = await sharp(full).extract({ left: 0, top: 0, width: PW, height: vis }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    const lines = wrap(caption, 27);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${INK}"/>
      <rect x="${PX - 12}" y="${PY - 12}" width="${PW + 24}" height="900" rx="56" ry="56" fill="#1B2750"/>
      <text x="72" y="330" font-family="${FONT}" font-size="88" font-weight="700" fill="#FFFFFF">${esc(title)}</text>
      ${lines.map((l, i) => `<text x="72" y="${408 + i * 42}" font-family="${FONT}" font-size="32" fill="#D5DCEE">${esc(l)}</text>`).join('')}
    </svg>`;
    await save(svg, [{ input: logoBig, left: 72, top: 72 }, { input: ph, left: PX, top: PY }], name);
    console.log(name);
  };

  // what is real, what is not: three honest columns
  const real = async (name) => {
    const cols = [
      { head: 'Real, and running', color: '#3DD68C', items: ['Hash-chained ledger', 'Anchoring on Bitcoin (OpenTimestamps)', 'Verification in the browser, without an account', '929 automated tests, open source (MIT)'] },
      { head: 'Tested with simulators, not yet with real sats', color: '#7AA2FF', items: ['Lightning funding and payout (Nostr Wallet Connect)', 'Supplier paid at a Lightning address, refunds', 'Mobile money payout (Bitnob sandbox)'] },
      { head: 'Switched off on this free demo', color: '#9FB0D6', items: ['Publishing the ledger on Nostr relays', 'AI advice on proofs (no API key)', 'Lasting data: it resets at each restart'] },
    ];
    const cw = 346, gap = 21, x0 = 60;
    const card = (c, i) => {
      const x = x0 + i * (cw + gap);
      const head = wrap(c.head, 22);
      let y = 250 + head.length * 36 + 14;
      const body = c.items.map((it) => { const ls = wrap(it, 25); const out = ls.map((l, k) => `<text x="${x + 52}" y="${y + k * 32}" font-family="${FONT}" font-size="25" fill="#E6EBF7">${esc(l)}</text>`).join('') + `<circle cx="${x + 32}" cy="${y - 8}" r="6" fill="${c.color}"/>`; y += ls.length * 32 + 22; return out; }).join('');
      return `<rect x="${x}" y="196" width="${cw}" height="520" rx="22" ry="22" fill="#14204A"/>
        <rect x="${x}" y="196" width="${cw}" height="8" rx="4" fill="${c.color}"/>
        ${head.map((l, k) => `<text x="${x + 28}" y="${250 + k * 36}" font-family="${FONT}" font-size="29" font-weight="700" fill="${c.color}">${esc(l)}</text>`).join('')}
        ${body}`;
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${INK}"/>
      <text x="60" y="108" font-family="${FONT}" font-size="54" font-weight="700" fill="#FFFFFF">What is real, and what is not</text>
      <text x="60" y="156" font-family="${FONT}" font-size="26" fill="#D5DCEE">As of 12 November 2026. A prototype that says exactly what it does.</text>
      ${cols.map(card).join('')}
      <text x="60" y="762" font-family="${FONT}" font-size="26" fill="#9FB0D6">Payments in the live demo are simulated: nobpay.onrender.com</text>
    </svg>`;
    await save(svg, [{ input: logoSmall, left: W - 132 - 60, top: 56 }], name);
    console.log(name);
  };

  fs.copyFileSync(path.join(ROOT, 'docs/brand/devpost-thumbnail.png'), path.join(OUT, '01-pay-on-proof.png'));
  await desktop('02-dashboard.png', 'dashboard', "The funder's dashboard", 'Escrow, projects, paid steps, and the proof that is waiting for a decision.');
  await desktop('03-project.png', 'project', 'A project, step by step', 'Each step is paid only against proof. Done steps are marked paid; the next ones wait.');
  await desktop('04-fund.png', 'invoice', '1 · Fund', 'A Lightning invoice puts the money in escrow. Demo invoices cannot be paid, so we simulate the payment.');
  await phone('05-prove.png', 'phone-preuve.webp', '2 · Prove', 'The person on site needs no account: a private link, a dated and located photo, the invoice, who to pay.');
  await desktop('06-decide.png', 'step', '3 · Decide', 'The funder looks at the photo and the invoice, then approves or refuses. Nothing is paid without approval.');
  await desktop('07-release.png', 'quote', '4 · Release', 'A quote first: what is debited, the rate, the fees, and what the supplier receives. Then the supplier is paid directly.');
  await desktop('08-record.png', 'ledger', '5 · Record', 'Every event joins a hash-chained ledger. Its fingerprint is anchored on Bitcoin with OpenTimestamps.');
  await desktop('09-verify.png', 'verify', '6 · Verify', 'A public page re-checks everything in the browser, without an account. Nobody has to trust our server.');
  await real('10-real-and-simulated.png');
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
