# English narration of the pitch video, synthesised locally with Kokoro (82M parameters, Apache 2.0; no online service).
# Setup, in a virtual environment (Python 3.10 to 3.13):
#   pip install kokoro-onnx soundfile numpy
#   download kokoro-v1.0.onnx (310 MB) and voices-v1.0.bin (26 MB) from
#   https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
# Usage:
#   python synth-en.py <kokoro-v1.0.onnx> <voices-v1.0.bin> <narration-en.json> <out-dir> [voice] [speed]
# Writes <out-dir>/<id>.wav (mono) for each sentence group and <out-dir>/durations.json (seconds).
# The default voice is af_heart, the best graded of Kokoro's voices ("A"); speed 1.0 is its natural pace.
# The silence Kokoro leaves at the start and the end of each clip is trimmed, so the pauses are the ones the script chooses.
# NEW_ONLY=1 keeps the clips already in <out-dir> (same voice and speed) and only synthesises the sentence groups that have none.
import json, os, sys, wave
import numpy as np
from kokoro_onnx import Kokoro

model, voices, narration_path, out_dir = sys.argv[1:5]
voice = sys.argv[5] if len(sys.argv) > 5 else 'af_heart'
speed = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
os.makedirs(out_dir, exist_ok=True)
kokoro = Kokoro(model, voices)
segments = json.load(open(narration_path, encoding='utf-8'))
durations = {}
total_words = 0
for s in segments:
    wav_path = os.path.join(out_dir, f"{s['id']}.wav")
    if os.environ.get('NEW_ONLY') == '1' and os.path.exists(wav_path):
        with wave.open(wav_path) as w:
            durations[s['id']] = w.getnframes() / w.getframerate()
        total_words += len(s['speak'].split())
        continue
    samples, rate = kokoro.create(s['speak'], voice=voice, speed=speed, lang='en-us')
    x = np.asarray(samples, dtype=np.float32)
    loud = np.where(np.abs(x) > 0.012)[0]
    if len(loud):
        pad = int(0.04 * rate)
        x = x[max(0, loud[0] - pad): loud[-1] + pad]
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(os.path.join(out_dir, f"{s['id']}.wav"), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm.tobytes())
    durations[s['id']] = len(pcm) / rate
    words = len(s['speak'].split()); total_words += words
    print(f"{s['id']:9} {durations[s['id']]:5.1f}s  {words:3} words  {words / durations[s['id']]:.2f} w/s")
json.dump(durations, open(os.path.join(out_dir, 'durations.json'), 'w'))
t = sum(durations.values())
print('total', round(t, 1), 's,', total_words, 'words,', round(60 * total_words / t), 'words per minute')
