# Voix du commentaire de la démonstration (Piper, voix fr_FR-tom-medium, locale, sans service en ligne).
# synth.py : voir docs/DEMO-SCRIPT.md, section « Vidéo avec voix ». Dépendances : piper-tts, imageio-ffmpeg, faster-whisper (verify), numpy.
import json, wave, sys
from piper import PiperVoice, SynthesisConfig
voice = PiperVoice.load('/tmp/nobpay-run/tts/voices/fr_FR-tom-medium.onnx')
cfg = SynthesisConfig(length_scale=1.0)
scenes = json.load(open('/tmp/nobpay-run/narr/scenes.json'))
out = {}
for s in scenes:
    path = f"/tmp/nobpay-run/narr/{s['id']}.wav"
    with wave.open(path, 'wb') as w:
        voice.synthesize_wav(s['text'], w, syn_config=cfg)
    with wave.open(path) as w:
        out[s['id']] = {'seconds': w.getnframes() / w.getframerate(), 'rate': w.getframerate(), 'channels': w.getnchannels()}
    print(f"{s['id']:12} {out[s['id']]['seconds']:5.1f}s  {len(s['text'].split()):3} words")
json.dump(out, open('/tmp/nobpay-run/narr/durations.json', 'w'))
print('total', round(sum(v['seconds'] for v in out.values()), 1), 's')
