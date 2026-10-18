// Renders video.html frame by frame (deterministic) with several headless Edge workers -> frames/f_000001.jpg ...
// env: WORKERS (default 4), FPS (30), START / END (frame indexes, END exclusive), QUALITY (92)
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Tab, sleep } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TL = JSON.parse(readFileSync(path.join(here, 'timeline.json'), 'utf8').replace(/^﻿/, ''));
const FPS = +process.env.FPS || 30;
const N = Math.ceil(TL.total * FPS);
const START = +process.env.START || 0;
const END = Math.min(+process.env.END || N, N);
const WORKERS = +process.env.WORKERS || 4;
const QUALITY = +process.env.QUALITY || 92;
const out = path.join(here, 'frames');
mkdirSync(out, { recursive: true });
const name = (i) => path.join(out, `f_${String(i + 1).padStart(6, '0')}.jpg`);

let next = START;
let done = 0;
const t0 = Date.now();
const total = END - START;

async function worker(k) {
  const tab = await Tab.open({ port: 9500 + k, width: 1920, height: 1080, scale: 1 });
  await tab.go(pathToFileURL(path.join(here, 'video.html')).href, 300);
  await tab.eval('window.READY');
  while (true) {
    const i = next++;
    if (i >= END) break;
    if (existsSync(name(i))) {
      done++;
      continue;
    }
    await tab.eval(`window.renderAt(${(i / FPS).toFixed(5)})`);
    const r = await tab.send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY, optimizeForSpeed: true });
    writeFileSync(name(i), Buffer.from(r.data, 'base64'));
    done++;
    if (done % 250 === 0) {
      const el = (Date.now() - t0) / 1000;
      const eta = (el / done) * (total - done);
      console.log(`${done}/${total} frames · ${el.toFixed(0)} s · ETA ${eta.toFixed(0)} s`);
    }
  }
  if (tab.errors.length) console.log(`worker ${k} errors:`, tab.errors.slice(0, 3).join(' | '));
  tab.close();
}

console.log(`rendering frames ${START}..${END - 1} of ${N} (${TL.total.toFixed(1)} s @ ${FPS} fps) with ${WORKERS} workers`);
await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
