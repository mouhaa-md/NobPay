// Renders a few frames of video.html at given times (seconds) -> probe/<t>.jpg, then 2x2 contact sheets with ffmpeg.
// usage: node probe.mjs 3.2 10 25.5 ...   (or  node probe.mjs scene:fin  -> 4 frames spread over the scene)
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Tab } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FF = process.env.FFMPEG || 'ffmpeg';
const TL = JSON.parse(readFileSync(path.join(here, 'timeline.json'), 'utf8'));
const times = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith('scene:')) {
    const sc = TL.scenes[a.slice(6)];
    for (let i = 0; i < 8; i++) times.push(+(sc.start + ((i + 0.5) / 8) * (sc.end - sc.start)).toFixed(2));
  } else if (a.startsWith('range:')) {
    const [t0, t1, n] = a.slice(6).split(',').map(Number);
    for (let i = 0; i < n; i++) times.push(+(t0 + (i / Math.max(1, n - 1)) * (t1 - t0)).toFixed(2));
  } else times.push(parseFloat(a));
}
const out = path.join(here, 'probe');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const tab = await Tab.open({ port: 9400, width: 1920, height: 1080, scale: 1 });
await tab.go(pathToFileURL(path.join(here, 'video.html')).href, 400);
await tab.eval('window.READY');
const names = [];
for (const t of times) {
  await tab.eval(`window.renderAt(${t})`);
  const f = path.join(out, `t-${String(Math.round(t * 100)).padStart(6, '0')}.jpg`);
  await tab.shot(f, { format: 'jpeg', quality: 88 });
  names.push(f);
}
if (tab.errors.length) console.log('PAGE ERRORS:\n' + tab.errors.join('\n'));
tab.close();
// 2x2 sheets
for (let i = 0; i < names.length; i += 4) {
  const grp = names.slice(i, i + 4);
  const args = ['-y', '-v', 'error'];
  for (const g of grp) args.push('-i', g);
  const n = grp.length;
  const lay = n === 1 ? '0_0' : n === 2 ? '0_0|w0_0' : n === 3 ? '0_0|w0_0|0_h0' : '0_0|w0_0|0_h0|w0_h0';
  const filt = grp.map((_, k) => `[${k}:v]scale=960:540[v${k}]`).join(';') + ';' + grp.map((_, k) => `[v${k}]`).join('') + (n === 1 ? 'copy[o]' : `xstack=inputs=${n}:layout=${lay}[o]`);
  args.push('-filter_complex', filt, '-map', '[o]', '-frames:v', '1', path.join(out, `sheet-${String(i / 4).padStart(2, '0')}.jpg`));
  execFileSync(FF, args);
}
console.log(times.map((t) => t.toFixed(2)).join(' '));
console.log('sheets:', Math.ceil(names.length / 4));
