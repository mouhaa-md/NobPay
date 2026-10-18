// Encodes frames/ + audio/ into the final MP4s (H.264 + AAC, 1920x1080, 30 fps) in out/
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FF = process.env.FFMPEG || 'ffmpeg';
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const frames = readdirSync(path.join(here, 'frames')).filter((f) => f.endsWith('.jpg')).length;
console.log('frames', frames);
const run = (args) => execFileSync(FF, ['-y', '-hide_banner', '-v', 'error', '-stats', ...args], { stdio: 'inherit' });

const vf = 'scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p';
const main = path.join(out, 'NobPay-demo.mp4');
run([
  '-framerate', '30', '-i', path.join(here, 'frames', 'f_%06d.jpg'),
  '-i', path.join(here, 'audio', 'mix.wav'),
  '-vf', vf,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.2', '-r', '30',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart', '-shortest', main,
]);
// same picture, voice only (no music, no sound effects)
run(['-i', main, '-i', path.join(here, 'audio', 'voice-proc.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', path.join(out, 'NobPay-demo-voix-seule.mp4')]);
// the voice-over alone
run(['-i', path.join(here, 'audio', 'voice-proc.wav'), '-c:a', 'libmp3lame', '-b:a', '192k', path.join(out, 'NobPay-voix-off.mp3')]);
console.log('done ->', out);
