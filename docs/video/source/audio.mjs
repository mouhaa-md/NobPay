// Builds the soundtrack: voice-over placed on the timeline, tiny sound-design (taps, pops, whooshes) and a very quiet ambient pad.
// outputs: audio/voice-proc.wav (voice only, mastered), audio/mix.wav (voice + sfx + pad), subtitles.srt
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Tab } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FF = process.env.FFMPEG || 'ffmpeg';
const SR = 48000;
const TL = JSON.parse(readFileSync(path.join(here, 'timeline.json'), 'utf8').replace(/^\uFEFF/, ''));
const outDir = path.join(here, 'audio');
mkdirSync(outDir, { recursive: true });
const N = Math.ceil((TL.total + 0.5) * SR);

// ------------------------------------------------------------ events from the page
let sfx;
{
  const tab = await Tab.open({ port: 9490, width: 1920, height: 1080, scale: 1 });
  await tab.go(pathToFileURL(path.join(here, 'video.html')).href, 300);
  await tab.eval('window.READY');
  sfx = JSON.parse(await tab.eval('JSON.stringify(window.SFX)'));
  tab.close();
}
const S = TL.s;
const sc = TL.scenes;
const extra = [
  { t: 1.55, k: 'thud' },
  { t: 1.75, k: 'chime' },
  { t: S['financement-2'].t + 0.72 * S['financement-2'].d, k: 'chime' },
  { t: S['terrain-5'].t + 0.55 * S['terrain-5'].d, k: 'chime' },
  { t: S['decision-5'].t + 0.05, k: 'chime' },
  { t: sc.outro.start + 0.9 + 0.5, k: 'thud' },
  { t: sc.outro.start + 0.9 + 1.5, k: 'chime' },
];
const order = ['intro', 'probleme', 'principe', 'fin', 'terrain', 'decision', 'fournisseur', 'preuve', 'admin', 'bitnob', 'outro'];
for (let i = 0; i < order.length - 1; i++) extra.push({ t: sc[order[i]].end - 0.5, k: 'whoosh' });
const events = [...sfx, ...extra].filter((e) => e.t >= 0 && e.t < TL.total).sort((a, b) => a.t - b.t);
writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(events));
console.log('sound events', events.length);

// ------------------------------------------------------------ helpers
const L = new Float32Array(N), R = new Float32Array(N); // voice
const sL = new Float32Array(N), sR = new Float32Array(N); // sfx
const pL = new Float32Array(N), pR = new Float32Array(N); // pad

// voice clips -> mono float -> both channels
for (const c of TL.clips) {
  const buf = execFileSync(FF, ['-v', 'error', '-i', path.join(here, 'assets', 'vo-remy', c.key + '.mp3'), '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const o = Math.round(c.t * SR);
  for (let i = 0; i < f.length && o + i < N; i++) {
    L[o + i] += f[i];
    R[o + i] += f[i];
  }
}

// deterministic noise
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const TAU = Math.PI * 2;

/** adds a mono-ish synthesized sound into the sfx stem. fn(t) -> [l, r] */
function put(t0, dur, gain, fn) {
  const o = Math.round(t0 * SR), n = Math.round(dur * SR);
  for (let i = 0; i < n && o + i < N; i++) {
    const [l, r] = fn(i / SR);
    sL[o + i] += l * gain;
    sR[o + i] += r * gain;
  }
}
const SYN = {
  tap: (t0) => put(t0, 0.1, 0.22, (t) => { const v = Math.exp(-t * 70) * Math.sin(TAU * 1800 * t) * 0.5 + Math.exp(-t * 45) * Math.sin(TAU * 230 * t) * 0.6; return [v, v]; }),
  pop: (t0) => put(t0, 0.22, 0.18, (t) => { const v = Math.exp(-t * 20) * Math.sin(TAU * (520 + 900 * (1 - Math.exp(-t * 60))) * t); return [v, v]; }),
  hit: (t0) => { let y = 0; put(t0, 1.3, 0.26, (t) => { y += 0.2 * (rnd() - y); const v = Math.exp(-t * 4.5) * Math.sin(TAU * 58 * t) * 0.9 + Math.exp(-t * 16) * y * 0.5; return [v, v]; }); },
  thud: (t0) => put(t0, 1.5, 0.3, (t) => { const v = Math.exp(-t * 3.4) * Math.sin(TAU * (44 + 34 * Math.exp(-t * 11)) * t); return [v, v]; }),
  chime: (t0) => {
    const note = (dt, f) => put(t0 + dt, 2.4, 0.07, (t) => { const v = (Math.exp(-t * 2.6) * Math.sin(TAU * f * t) + 0.5 * Math.exp(-t * 4) * Math.sin(TAU * f * 1.5 * t) + 0.25 * Math.exp(-t * 6) * Math.sin(TAU * f * 2 * t)); return [v, v]; });
    note(0, 1046.5);
    note(0.13, 1318.5);
  },
  swish: (t0) => { let y = 0, z = 0; put(t0, 0.7, 0.09, (t) => { const x = rnd(); y += 0.35 * (x - y); z += 0.03 * (y - z); const v = (y - z) * Math.pow(Math.sin(Math.PI * Math.min(1, t / 0.7)), 2); return [v, v * 0.9]; }); },
  whoosh: (t0) => {
    let y = 0, y2 = 0, z = 0, z2 = 0;
    put(t0, 1.1, 0.15, (t) => {
      const p = t / 1.1;
      const cut = 0.04 + 0.5 * Math.sin(Math.PI * p);
      y += cut * (rnd() - y); y2 += cut * (rnd() - y2);
      z += 0.02 * (y - z); z2 += 0.02 * (y2 - z2);
      const env = Math.pow(Math.sin(Math.PI * p), 2.2);
      const th = p * (Math.PI / 2);
      return [(y - z) * env * Math.cos(th) * 1.4, (y2 - z2) * env * Math.sin(th) * 1.4];
    });
  },
};
for (const e of events) SYN[e.k]?.(e.t);

// ambient pad: slow chord progression Am - F - C - G, soft sines, wide stereo, low-passed
{
  const chords = [
    [110, 164.81, 220, 261.63],
    [87.31, 130.81, 174.61, 220],
    [130.81, 196, 261.63, 329.63],
    [98, 146.83, 196, 246.94],
  ];
  const seg = 16, fade = 5.5;
  const nSeg = Math.ceil(TL.total / (seg - fade)) + 1;
  const lpL = [0, 0], lpR = [0, 0];
  const gainAt = (t) => {
    // louder in the intro and outro (no voice), very low under the voice
    const intro = t < 8.6 ? 1.0 : Math.max(0.55, 1.0 - (t - 8.6) / 3);
    const outro = t > sc.outro.start ? Math.min(1.0, 0.55 + (t - sc.outro.start) / 2.5 * 0.45) : 1;
    return t < sc.outro.start ? (t < 8.6 ? 1.0 : intro) : outro;
  };
  const total = Math.round(TL.total * SR);
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let l = 0, r = 0;
    const k0 = Math.max(0, Math.floor((t - fade) / (seg - fade)) - 1);
    for (let k = k0; k < Math.min(nSeg, k0 + 4); k++) {
      const st = k * (seg - fade);
      const u = t - st;
      if (u < 0 || u > seg) continue;
      const env = Math.min(1, u / fade, (seg - u) / fade);
      const e2 = env * env * (3 - 2 * env);
      const ch = chords[k % 4];
      for (let n = 0; n < ch.length; n++) {
        const f = ch[n];
        const vib = 1 + 0.0012 * Math.sin(TAU * (0.13 + 0.03 * n) * t + n);
        l += e2 * (Math.sin(TAU * f * 0.9985 * vib * t) + 0.22 * Math.sin(TAU * f * 2 * vib * t));
        r += e2 * (Math.sin(TAU * f * 1.0015 * vib * t + 0.6) + 0.22 * Math.sin(TAU * f * 2 * 1.001 * vib * t + 0.3));
      }
    }
    const trem = 0.82 + 0.18 * Math.sin(TAU * 0.07 * t);
    const g = 0.034 * trem * gainAt(t);
    lpL[0] += 0.12 * (l - lpL[0]); lpL[1] += 0.12 * (lpL[0] - lpL[1]);
    lpR[0] += 0.12 * (r - lpR[0]); lpR[1] += 0.12 * (lpR[0] - lpR[1]);
    const fi = Math.min(1, t / 2.5), fo = Math.min(1, (TL.total - t) / 3.5);
    pL[i] = lpL[1] * g * fi * fo;
    pR[i] = lpR[1] * g * fi * fo;
  }
}

// ------------------------------------------------------------ write stems (32-bit float WAV)
function wav(file, a, b) {
  const n = N, data = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) {
    data.writeFloatLE(a[i], i * 8);
    data.writeFloatLE(b[i], i * 8 + 4);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}
wav(path.join(outDir, 'voice-raw.wav'), L, R);
wav(path.join(outDir, 'sfx.wav'), sL, sR);
wav(path.join(outDir, 'pad.wav'), pL, pR);

// ------------------------------------------------------------ master
const run = (args) => execFileSync(FF, ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
run(['-i', path.join(outDir, 'voice-raw.wav'), '-af', 'highpass=f=75,acompressor=threshold=-21dB:ratio=2.6:attack=8:release=140:makeup=3dB,loudnorm=I=-16:TP=-1.5:LRA=8,aresample=48000', '-ar', '48000', '-c:a', 'pcm_s16le', path.join(outDir, 'voice-proc.wav')]);
run(['-i', path.join(outDir, 'voice-proc.wav'), '-i', path.join(outDir, 'sfx.wav'), '-i', path.join(outDir, 'pad.wav'), '-filter_complex', '[0][1][2]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.89:level=disabled', '-ar', '48000', '-c:a', 'pcm_s16le', path.join(outDir, 'mix.wav')]);
// loudness report
const rep = execFileSync(FF, ['-v', 'info', '-i', path.join(outDir, 'mix.wav'), '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
console.log(rep.split('\n').filter((l) => /I:|LRA:|Peak:/.test(l)).slice(-4).join('\n'));

// ------------------------------------------------------------ subtitles (bonus .srt)
const fmt = (t) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), x = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(x).padStart(3, '0')}`;
};
const srt = TL.clips.map((c, i) => `${i + 1}\n${fmt(c.t)} --> ${fmt(c.t + c.d)}\n${TL.s[c.key].text.replace(/Nob Pay/g, 'NobPay')}\n`).join('\n');
writeFileSync(path.join(here, 'subtitles.srt'), srt);
console.log('audio ready');
