// Synthesises every sentence of script.json with a neural French voice (one mp3 per sentence).
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { EdgeTTS } from 'node-edge-tts';

const VOICE = process.env.VOICE || 'fr-FR-RemyMultilingualNeural';
const dir = `assets/vo-${VOICE.split('-')[2].replace('MultilingualNeural', '').replace('Neural', '').toLowerCase()}`;
mkdirSync(dir, { recursive: true });
const script = JSON.parse(readFileSync('script.json', 'utf8'));
let n = 0;
for (const sc of script) {
  for (let k = 0; k < sc.lines.length; k++) {
    const file = `${dir}/${sc.id}-${k}.mp3`;
    if (existsSync(file) && !process.env.FORCE) continue;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const tts = new EdgeTTS({ voice: VOICE, lang: 'fr-FR', outputFormat: 'audio-24khz-96kbitrate-mono-mp3', rate: process.env.RATE || '-3%', timeout: 30000 });
        await tts.ttsPromise(sc.lines[k], file);
        n++;
        break;
      } catch (e) {
        if (attempt === 4) console.log('FAIL', file, String(e).slice(0, 120));
        else await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
}
console.log('synthesised', n, 'sentences into', dir);
