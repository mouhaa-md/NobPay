# Voix du commentaire de la démonstration (Piper, voix fr_FR-tom-medium, locale, sans service en ligne).
# assemble.py : voir docs/DEMO-SCRIPT.md, section « Vidéo avec voix ». Dépendances : piper-tts, imageio-ffmpeg, faster-whisper (verify), numpy.
import json, wave, subprocess, glob, numpy as np, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
V = glob.glob('/tmp/nobpay-run/video2/*.webm')[0]
T = json.load(open('/tmp/nobpay-run/narr/timeline.json'))
# 1) find the red calibration flash in the video
raw = subprocess.run([FF,'-v','error','-i',V,'-t','6','-vf','fps=25,scale=32:18','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
frames = np.frombuffer(raw,dtype=np.uint8).reshape(-1,18,32,3).astype(float)
red = [i for i,f in enumerate(frames) if f[...,0].mean()>150 and f[...,1].mean()<70 and f[...,2].mean()<70]
assert red, 'flash not found'
fs, fe = red[0]/25.0, (red[-1]+1)/25.0
offset = fs - T['flashAt']/1000.0
print(f"flash in video: {fs:.2f}-{fe:.2f}s | script said {T['flashAt']/1000:.2f}-{T['flashEnd']/1000:.2f}s | offset {offset:+.2f}s")
trim = fe + 0.25
# 2) place each narration clip on a timeline (trimmed start = 0)
SR = 44100
total = T['total']/1000.0 + offset - trim + 0.5
buf = np.zeros(int(total*SR)+SR, dtype=np.float32)
for sc in T['scenes']:
    with wave.open(f"/tmp/nobpay-run/narr/{sc['id']}.wav") as w:
        assert w.getframerate()==SR
        x = np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768.0
    n=int(0.012*SR); x[:n]*=np.linspace(0,1,n); x[-n:]*=np.linspace(1,0,n)
    start = int((sc['at']/1000.0 + offset - trim)*SR)
    assert start>=0, sc
    buf[start:start+len(x)] += x
peak = np.abs(buf).max(); buf *= (0.89/peak) if peak>0.89 else 1.0
out = np.int16(np.clip(buf,-1,1)*32767)
with wave.open('/tmp/nobpay-run/narr/narration_full.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print(f"narration timeline {len(buf)/SR:.1f}s, peak {peak:.2f}, trim video from {trim:.2f}s")
json.dump({'trim':trim,'duration':len(buf)/SR},open('/tmp/nobpay-run/narr/assemble.json','w'))
