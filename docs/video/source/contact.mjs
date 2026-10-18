// Contact sheets from the rendered frames: node contact.mjs <step seconds> [from] [to]   -> contact/sheet-XX.jpg (3x3 tiles, 640x360)
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FF = process.env.FFMPEG || 'ffmpeg';
const step = parseFloat(process.argv[2] || '3');
const from = parseFloat(process.argv[3] || '0.5');
const to = parseFloat(process.argv[4] || '278');
const dir = path.join(here, 'contact');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const times = [];
for (let t = from; t <= to; t += step) times.push(+t.toFixed(2));
for (let i = 0; i < times.length; i += 9) {
  const grp = times.slice(i, i + 9);
  const list = grp.map((t) => `file '${path.join(here, 'frames', `f_${String(Math.round(t * 30) + 1).padStart(6, '0')}.jpg`).replace(/\\/g, '/')}'\nduration 1`).join('\n');
  const lf = path.join(dir, `list-${i / 9}.txt`);
  writeFileSync(lf, list + '\n');
  const out = path.join(dir, `sheet-${String(i / 9).padStart(2, '0')}.jpg`);
  execFileSync(FF, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', `scale=640:360,tile=3x3:padding=0:margin=0`, '-frames:v', '1', '-q:v', '3', out]);
}
console.log(times.length, 'frames ->', Math.ceil(times.length / 9), 'sheets');
console.log(times.map((t, i) => (i % 9 === 0 ? '\n' : '') + t).join(' '));
