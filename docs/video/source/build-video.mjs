// Builds timeline.js (VO-driven timing), assets.js (logo parts, portraits, tap positions) and video.html.
// Needs the logo / portrait generator modules (nobpay.mjs, art2.mjs, fonts) of the brand work folder: ../logo/. The generated timeline.js, assets.js and video.html are already included, so render.mjs works without this step.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HAVE_LOGO = existsSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'logo', 'nobpay.mjs'));
const { SPEC, letters, mark, move } = HAVE_LOGO ? await import('../logo/nobpay.mjs') : {};
const { portrait, WHO } = HAVE_LOGO ? await import('../logo/art2.mjs') : {};

const here = path.dirname(fileURLToPath(import.meta.url));
const VOICE = process.env.VOICE_DIR || 'vo-remy';
const FF = process.env.FFPROBE || 'ffprobe';
const script = JSON.parse(readFileSync(path.join(here, 'script.json'), 'utf8'));

// ---------------------------------------------------------------- durations
function dur(file) {
  if (FF) {
    try {
      return parseFloat(execFileSync(FF, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
    } catch {
      /* fall through */
    }
  }
  return (statSync(file).size * 8) / 96000; // CBR 96 kbit/s estimate
}

const SEQ = [
  { id: 'intro', groups: ['intro'], lead: 1.1, tail: 1.0 },
  { id: 'probleme', groups: ['probleme'] },
  { id: 'principe', groups: ['principe'] },
  { id: 'fin', groups: ['financeur', 'projet', 'financement'] },
  { id: 'terrain', groups: ['terrain'] },
  { id: 'decision', groups: ['decision'] },
  { id: 'fournisseur', groups: ['fournisseur'] },
  { id: 'preuve', groups: ['preuve'] },
  { id: 'admin', groups: ['admin'] },
  { id: 'bitnob', groups: ['bitnob'] },
  { id: 'outro', groups: ['outro'], tail: 3.2 },
];
const byId = Object.fromEntries(script.map((g) => [g.id, g]));
const GAP_S = 0.42; // between sentences
const GAP_G = 0.8; // between groups of one scene
const s = {};
const scenes = {};
const clips = [];
let cur = 0;
for (const sc of SEQ) {
  const start = cur;
  cur += sc.lead ?? 1.6;
  let first = null;
  for (const gid of sc.groups) {
    byId[gid].lines.forEach((text, k) => {
      const file = path.join(here, 'assets', VOICE, `${gid}-${k}.mp3`);
      const d = dur(file);
      s[`${gid}-${k}`] = { t: +cur.toFixed(3), d: +d.toFixed(3), text };
      clips.push({ key: `${gid}-${k}`, file, t: +cur.toFixed(3), d: +d.toFixed(3) });
      first ??= cur;
      cur += d + GAP_S;
    });
    cur += GAP_G - GAP_S;
  }
  cur += (sc.tail ?? 0.9) - GAP_G + GAP_S - GAP_S;
  scenes[sc.id] = { start: +start.toFixed(3), end: +cur.toFixed(3), first: +first.toFixed(3) };
}
const total = +cur.toFixed(3);
writeFileSync(path.join(here, 'timeline.json'), JSON.stringify({ s, scenes, total, clips }, null, 1));
writeFileSync(path.join(here, 'timeline.js'), `window.TL=${JSON.stringify({ s, scenes, total })};`);

if (!HAVE_LOGO) {
  console.log('total', total.toFixed(1), 's; timeline rebuilt (logo modules not found: assets.js and video.html left untouched)');
  process.exit(0);
}
// ---------------------------------------------------------------- logo parts, portraits, taps
const G = letters(SPEC);
const M = mark(SPEC);
const parts = [
  { id: 'archL', d: M.parts[0].d },
  { id: 'key', d: M.parts[1].d },
  { id: 'archR', d: M.parts[2].d },
];
let x = M.width + SPEC.gaps.no;
for (const [ch, gap] of [['o', SPEC.gaps.ob], ['b', SPEC.gaps.bp], ['p', SPEC.gaps.pa], ['a', SPEC.gaps.ay], ['y', 0]]) {
  parts.push({ id: ch, d: move(G[ch].d, x, 0) });
  x += G[ch].w + gap;
}
const svgOf = (o, mood = 'smile') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 360" width="100%" height="100%">${portrait(o, { mood })}</svg>`;
const portraits = { moussa: svgOf(WHO.ibou), mamadou: svgOf(WHO.mamadou), fournisseur: svgOf(WHO.cheikh), admin: svgOf(WHO.awa) };
const taps = JSON.parse(readFileSync(path.join(here, 'assets', 'taps.json'), 'utf8')).map((t) => ({ ...t, text: t.text.normalize('NFC').replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è') }));
writeFileSync(path.join(here, 'assets.js'), `window.ASSETS=${JSON.stringify({ logoParts: parts, logoW: x, portraits, taps })};`);

// ---------------------------------------------------------------- html
const font = (pkg, file) => pathToFileURL(path.join(here, '..', 'logo', 'node_modules', '@fontsource', pkg, 'files', file)).href;
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>NobPay · vidéo</title>
<style>
@font-face{font-family:'Bricolage Grotesque';font-weight:700;src:url('${font('bricolage-grotesque', 'bricolage-grotesque-latin-700-normal.woff')}')}
@font-face{font-family:'Bricolage Grotesque';font-weight:800;src:url('${font('bricolage-grotesque', 'bricolage-grotesque-latin-800-normal.woff')}')}
@font-face{font-family:'Figtree';font-weight:400;src:url('${font('figtree', 'figtree-latin-400-normal.woff')}')}
@font-face{font-family:'Figtree';font-weight:500;src:url('${font('figtree', 'figtree-latin-500-normal.woff')}')}
@font-face{font-family:'Figtree';font-weight:600;src:url('${font('figtree', 'figtree-latin-600-normal.woff')}')}
@font-face{font-family:'Figtree';font-weight:700;src:url('${font('figtree', 'figtree-latin-700-normal.woff')}')}
@font-face{font-family:'Figtree';font-weight:800;src:url('${font('figtree', 'figtree-latin-800-normal.woff')}')}
@font-face{font-family:'Instrument Serif';font-style:italic;font-weight:400;src:url('${font('instrument-serif', 'instrument-serif-latin-400-italic.woff')}')}
html,body{margin:0;background:#000;overflow:hidden}
#stage{position:relative;width:1920px;height:1080px;overflow:hidden;background:#0B132B;font-family:'Figtree',sans-serif;-webkit-font-smoothing:antialiased}
img{display:block}
</style></head><body><div id="stage"></div>
<script src="timeline.js"></script><script src="assets.js"></script><script src="engine.js"></script><script src="lib.js"></script><script src="sc-a.js"></script><script src="sc-b.js"></script><script src="sc-c.js"></script>
<script>
window.READY=(async()=>{
  await document.fonts.load("800 40px 'Bricolage Grotesque'");await document.fonts.load("700 40px 'Figtree'");await document.fonts.load("500 40px 'Figtree'");await document.fonts.load("italic 40px 'Instrument Serif'");
  const imgs=[...document.images];await Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r})));
  await Promise.all(imgs.map(i=>i.decode?i.decode().catch(()=>{}):0));
  window.ENG.renderAt(0);return true;
})();
window.renderAt=(t)=>{window.ENG.renderAt(t);return t};
</script></body></html>`;
writeFileSync(path.join(here, 'video.html'), html);
console.log('total', total.toFixed(1), 's;', Object.keys(s).length, 'sentences');
for (const [k, v] of Object.entries(scenes)) console.log(k.padEnd(12), v.start.toFixed(1).padStart(6), '->', v.end.toFixed(1).padStart(6));
