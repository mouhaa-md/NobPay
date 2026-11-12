# Assembles the narrated pitch video: takes the waiting out of the screen recording, lays the voice on it, adds an original music
# bed that goes down while the voice speaks, and writes the subtitle file.
# Usage (same virtual environment as synth-en.py, plus: pip install imageio-ffmpeg):
#   python assemble-en.py <video.webm> <info.json> <narr-dir> <narration-en.json> <out-dir> [name]
# <info.json> comes from record-pitch.mjs (cuts to remove, start time of each sentence group in the final video),
# <narr-dir> from synth-en.py (one wav per sentence group + durations.json). NO_MUSIC=1 makes a version without the music bed.
# Writes <out-dir>/<name>.mp4 (H.264 + AAC, 1280x720, about -15 LUFS) and <out-dir>/<name>.en.srt (for YouTube's subtitles).
import json, os, re, subprocess, sys, textwrap, wave
import numpy as np
import imageio_ffmpeg

video, info_path, narr_dir, narration_path, out_dir = sys.argv[1:6]
name = sys.argv[6] if len(sys.argv) > 6 else 'nobpay-demo-pitch-en'
os.makedirs(out_dir, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
MUSIC_BELOW_VOICE_DB = 17.0  # the music bed, between sentences, is this far below the voice
DUCK_DB = 6.0                # and goes down by this much more while the voice speaks

info = json.load(open(info_path))
cuts, marks, total = info['cuts'], info['marks'], info['total']
durations = json.load(open(os.path.join(narr_dir, 'durations.json')))
captions = {s['id']: s['caption'] for s in json.load(open(narration_path, encoding='utf-8'))}

def run(args):
    subprocess.run([ffmpeg, '-y', '-hide_banner', '-loglevel', 'error'] + args, check=True)

# ---- 1. the voice, at the times the recording script gave ----
with wave.open(os.path.join(narr_dir, marks[0]['id'] + '.wav')) as w:
    rate = w.getframerate()
length = total + 1.0
voice = np.zeros(int(length * rate), dtype=np.int16)
prev_end = 0.0
for mk in marks:
    with wave.open(os.path.join(narr_dir, mk['id'] + '.wav')) as w:
        assert w.getframerate() == rate and w.getnchannels() == 1
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    i = int(mk['start'] * rate)
    voice[i:i + len(pcm)] = pcm[: max(0, len(voice) - i)]
    gap = mk['start'] - prev_end
    if gap > 0.9:
        print(f"  silence of {gap:.1f} s before '{mk['id']}'")
    prev_end = mk['start'] + durations[mk['id']]
voice_path = os.path.join(out_dir, name + '.voice24.wav')
with wave.open(voice_path, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(voice.tobytes())
voice48_path = os.path.join(out_dir, name + '.voice48.wav')
run(['-i', voice_path, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', voice48_path])

# ---- 2. the music bed ----
music_path = os.path.join(out_dir, name + '.music.wav')
subprocess.run([sys.executable, os.path.join(here, 'music.py'), str(length + 0.5), music_path, '7', '88'], check=True)

# ---- 3. mix: the music follows the voice (ducking, with a look-ahead so that it is already down when the voice starts) ----
SR = 48000
with wave.open(voice48_path) as w:
    v = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
with wave.open(music_path) as w:
    m = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32).reshape(-1, 2) / 32768
n = min(len(v), len(m))
v, m = v[:n], m[:n]
frame = SR // 50  # 20 ms
nf = n // frame
rms = np.sqrt(np.mean(v[: nf * frame].reshape(nf, frame) ** 2, axis=1))
speech = rms > 0.01
held = np.convolve(speech.astype(float), np.ones(25), mode='same') > 0  # the voice "holds" 0.25 s around each word
v_ref = np.sqrt(np.mean(rms[speech] ** 2)) if speech.any() else 0.1
m_ref = np.sqrt(np.mean(m ** 2))
base = v_ref * 10 ** (-MUSIC_BELOW_VOICE_DB / 20) / m_ref
duck = 10 ** (-DUCK_DB / 20)
g = np.ones(nf); cur = 1.0
a_att, a_rel = 1 - np.exp(-0.02 / 0.06), 1 - np.exp(-0.02 / 0.5)
for i in range(nf):
    target = duck if held[i] else 1.0
    cur += (a_att if target < cur else a_rel) * (target - cur)
    g[i] = cur
g = np.concatenate([g[8:], np.full(8, g[-1])])  # look-ahead of 0.16 s
gain = np.interp(np.arange(n), (np.arange(nf) + 0.5) * frame, g) * base
if os.environ.get('NO_MUSIC') == '1':
    gain = gain * 0  # a version without music
mix = np.stack([v + m[:, 0] * gain, v + m[:, 1] * gain], axis=1)
mix = np.clip(mix, -1, 1)
mix_path = os.path.join(out_dir, name + '.mix.wav')
with wave.open(mix_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(f"music: {20 * np.log10(base):.1f} dB gain, {MUSIC_BELOW_VOICE_DB:.0f} dB under the voice between sentences, {MUSIC_BELOW_VOICE_DB + DUCK_DB:.0f} dB while it speaks")

# ---- 4. subtitles: one cue per sentence ----
def stamp(x):
    h, r = divmod(x, 3600); mi, r = divmod(r, 60); s, ms = divmod(r, 1)
    return f"{int(h):02}:{int(mi):02}:{int(s):02},{int(ms * 1000):03}"
cues = []
for mk in marks:
    sentences = re.split(r'(?<=[.!?])\s+', captions[mk['id']])
    total_chars = sum(len(s) for s in sentences)
    t = mk['start']
    for s in sentences:
        d = durations[mk['id']] * len(s) / total_chars
        cues.append((t, t + d - 0.05, s))
        t += d
with open(os.path.join(out_dir, name + '.en.srt'), 'w', encoding='utf-8') as f:
    for k, (a, b, text) in enumerate(cues, 1):
        f.write(f"{k}\n{stamp(a)} --> {stamp(b)}\n" + '\n'.join(textwrap.wrap(text, 42)) + "\n\n")

# ---- 5. the picture without the waiting, and the sound, in one file ----
expr = '+'.join(f'between(t,{a},{b})' for a, b in cuts)
vf = f"fps=25,select='not({expr})',setpts=N/(25*TB)"
out = os.path.join(out_dir, name + '.mp4')
run([
    '-i', video, '-i', mix_path, '-vf', vf,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-af', 'loudnorm=I=-15:TP=-1.5:LRA=9', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', '-t', str(total + 0.4), out,
])
for p in (voice_path, voice48_path, music_path, mix_path):
    os.remove(p)
print('video', out, round(total + 0.4, 1), 's')
print('subtitles', len(cues), 'cues')
