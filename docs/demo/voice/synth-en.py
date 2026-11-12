# English narration of the pitch video, synthesised locally with Piper (no online service).
# Usage (in a virtual environment: pip install piper-tts imageio-ffmpeg numpy ; python -m piper.download_voices en_US-ryan-high):
#   python synth-en.py <voice.onnx> <narration-en.json> <out-dir> [length_scale] [pause_seconds]
# Writes <out-dir>/<id>.wav for each segment and <out-dir>/durations.json (seconds).
# length_scale > 1 speaks slower (default 1.25, for listeners who do not have English as a first language);
# a short pause is added between sentences (default 0.4 s).
import json, sys, wave, os
import numpy as np
from piper import PiperVoice, SynthesisConfig

voice_path, narration_path, out_dir = sys.argv[1:4]
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 1.25
pause = float(sys.argv[5]) if len(sys.argv) > 5 else 0.4
os.makedirs(out_dir, exist_ok=True)
voice = PiperVoice.load(voice_path)
cfg = SynthesisConfig(length_scale=scale)
segments = json.load(open(narration_path, encoding='utf-8'))
durations = {}
for s in segments:
    parts, rate = [], 22050
    for chunk in voice.synthesize(s['speak'], syn_config=cfg):
        rate = chunk.sample_rate
        if parts:
            parts.append(np.zeros(int(rate * pause), dtype=np.int16))
        parts.append(chunk.audio_int16_array)
    audio = np.concatenate(parts)
    path = os.path.join(out_dir, f"{s['id']}.wav")
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(audio.tobytes())
    durations[s['id']] = len(audio) / rate
    print(f"{s['id']:8} {durations[s['id']]:5.1f}s  {len(s['speak'].split()):3} words")
json.dump(durations, open(os.path.join(out_dir, 'durations.json'), 'w'))
print('total', round(sum(durations.values()), 1), 's')
