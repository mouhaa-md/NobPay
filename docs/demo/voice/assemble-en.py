# Lays the English narration on the screen recording, and writes the subtitle file.
# Usage (same virtual environment as synth-en.py):
#   python assemble-en.py <video.webm> <marks.json> <narr-dir> <narration-en.json> <out-dir> [name]
# <marks.json> comes from record-pitch.mjs, <narr-dir> from synth-en.py (one wav per sentence group + durations.json).
# Writes <out-dir>/<name>.mp4 (H.264 + AAC, 1280x720, voice at about -16 LUFS) and <out-dir>/<name>.en.srt (for YouTube's subtitles).
import json, os, re, subprocess, sys, textwrap, wave
import numpy as np
import imageio_ffmpeg

video, marks_path, narr_dir, narration_path, out_dir = sys.argv[1:6]
name = sys.argv[6] if len(sys.argv) > 6 else 'nobpay-demo-pitch-en'
os.makedirs(out_dir, exist_ok=True)
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

info = json.load(open(marks_path))
t_ready = info['tReady']
durations = json.load(open(os.path.join(narr_dir, 'durations.json')))
captions = {s['id']: s['caption'] for s in json.load(open(narration_path, encoding='utf-8'))}

# length of the screen recording
probe = subprocess.run([ffmpeg, '-hide_banner', '-i', video], capture_output=True, text=True).stderr
m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe)
video_len = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
RATE = 22050
# stop 2.5 s after the last sentence (the recording keeps running a few seconds while the script closes)
last = max(mk['start'] + durations[mk['id']] for mk in info['marks'])
length = min(video_len - t_ready, last - t_ready + 2.5)

# the voice track: each sentence group placed where the recording script said it started
track = np.zeros(int((length + 1.0) * RATE), dtype=np.int16)
cues = []
for mk in info['marks']:
    with wave.open(os.path.join(narr_dir, mk['id'] + '.wav')) as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    at = max(0.0, mk['start'] - t_ready)
    i = int(at * RATE)
    track[i:i + len(pcm)] = pcm[: max(0, len(track) - i)]
    # subtitle cues: one per sentence, sharing the segment's time by text length
    sentences = re.split(r'(?<=[.!?])\s+', captions[mk['id']])
    total_chars = sum(len(s) for s in sentences)
    t = at
    for s in sentences:
        d = durations[mk['id']] * len(s) / total_chars
        cues.append((t, t + d - 0.08, s))
        t += d
wav_path = os.path.join(out_dir, name + '.voice.wav')
with wave.open(wav_path, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(track.tobytes())

def stamp(x):
    h, r = divmod(x, 3600); mi, r = divmod(r, 60); s, ms = divmod(r, 1)
    return f"{int(h):02}:{int(mi):02}:{int(s):02},{int(ms * 1000):03}"

with open(os.path.join(out_dir, name + '.en.srt'), 'w', encoding='utf-8') as f:
    for n, (a, b, text) in enumerate(cues, 1):
        f.write(f"{n}\n{stamp(a)} --> {stamp(b)}\n" + '\n'.join(textwrap.wrap(text, 42)) + "\n\n")

out = os.path.join(out_dir, name + '.mp4')
subprocess.run([
    ffmpeg, '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', str(t_ready), '-i', video, '-i', wav_path,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart', '-t', str(length), out,
], check=True)
os.remove(wav_path)
print('video', out, round(length, 1), 's')
print('subtitles', len(cues), 'cues')
