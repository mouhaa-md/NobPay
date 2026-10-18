# Voix du commentaire de la démonstration (Piper, voix fr_FR-tom-medium, locale, sans service en ligne).
# verify.py : voir docs/DEMO-SCRIPT.md, section « Vidéo avec voix ». Dépendances : piper-tts, imageio-ffmpeg, faster-whisper (verify), numpy.
import json, re, difflib, unicodedata
import wave, numpy as np
from faster_whisper import WhisperModel
def load16k(p):
    with wave.open(p) as w:
        sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768.0
    n=int(len(x)*16000/sr); return np.interp(np.linspace(0,len(x)-1,n),np.arange(len(x)),x).astype(np.float32)
m = WhisperModel('small', device='cpu', compute_type='int8')
scenes = json.load(open('/tmp/nobpay-run/narr/scenes.json'))
def norm(t):
    t = unicodedata.normalize('NFKD', t.lower()).encode('ascii','ignore').decode()
    t = t.replace('i. f. a. d.','ifad').replace('i f a d','ifad')
    return re.findall(r"[a-z0-9']+", t.replace("'", " "))
tot=0; n=0
for s in scenes:
    segs,_ = m.transcribe(load16k(f"/tmp/nobpay-run/narr/{s['id']}.wav"), language='fr', beam_size=5)
    heard = ' '.join(x.text.strip() for x in segs)
    a, b = norm(s['text']), norm(heard)
    r = difflib.SequenceMatcher(None, a, b).ratio(); tot += r; n += 1
    diffs = [(' '.join(a[i1:i2]), ' '.join(b[j1:j2])) for tag,i1,i2,j1,j2 in difflib.SequenceMatcher(None,a,b).get_opcodes() if tag!='equal']
    print(f"{s['id']:11} match {r*100:5.1f}%  {diffs[:4]}")
print('mean match', round(tot/n*100,1), '%')
