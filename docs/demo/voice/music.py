# An original, very quiet music bed for the demo video, made with numpy only (no sample, no library, no licence to credit,
# and nothing for a content-matching system to recognise).
# Usage: python music.py <seconds> <out.wav> [seed] [bpm]
# Soft pad + a slow bass + a gentle plucked arpeggio, over a four-chord loop (C, G, Am, F), with a little reverb and echo.
# 48 kHz stereo, 16 bit. The mixing script lowers it under the voice.
import sys, wave
import numpy as np

SR = 48000
dur = float(sys.argv[1])
out_path = sys.argv[2]
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 7
bpm = float(sys.argv[4]) if len(sys.argv) > 4 else 88.0
rng = np.random.default_rng(seed)
N = int(dur * SR)
beat = 60.0 / bpm
bar = 4 * beat

def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)

# four chords: pad voicing, bass note, arpeggio tones
PROG = [
    dict(pad=[60, 67, 72, 76], bass=36, arp=[72, 76, 79, 84, 88, 84, 79, 76]),  # C
    dict(pad=[59, 67, 71, 74], bass=43, arp=[71, 74, 79, 83, 86, 83, 79, 74]),  # G
    dict(pad=[57, 64, 69, 72], bass=45, arp=[69, 72, 76, 81, 84, 81, 76, 72]),  # Am
    dict(pad=[57, 65, 69, 72], bass=41, arp=[69, 72, 77, 81, 84, 81, 77, 72]),  # F
]

pad_l = np.zeros(N, dtype=np.float32); pad_r = np.zeros(N, dtype=np.float32)
arp_l = np.zeros(N, dtype=np.float32); arp_r = np.zeros(N, dtype=np.float32)
bass = np.zeros(N, dtype=np.float32)

def add(buf, start, sig):
    i = int(start * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    buf[i:j] += sig[: j - i]

def one_pole_lowpass(x, alpha):
    # y[n] = y[n-1] + alpha (x[n] - y[n-1]), done in blocks to stay fast
    y = np.empty_like(x)
    acc = 0.0
    for k in range(0, len(x), 4096):
        blk = x[k:k + 4096]
        for n in range(len(blk)):
            acc += alpha * (blk[n] - acc)
            y[k + n] = acc
    return y

n_bars = int(dur / bar) + 2
for b in range(n_bars):
    ch = PROG[b % 4]
    t0 = b * bar
    # --- pad: long soft notes that overlap the next bar
    length = bar + 1.6
    t = np.arange(int(length * SR)) / SR
    env = np.minimum(1.0, t / 1.2) * np.minimum(1.0, (length - t) / 1.5)
    for k, m in enumerate(ch['pad']):
        f = hz(m)
        l = sum(a * np.sin(2 * np.pi * f * d * t + ph) for d, a, ph in [(0.998, 1.0, 0.0), (2.0, 0.42, 0.5), (3.0, 0.22, 1.1)])
        r = sum(a * np.sin(2 * np.pi * f * d * t + ph) for d, a, ph in [(1.002, 1.0, 0.7), (2.0, 0.42, 0.2), (3.0, 0.22, 0.4)])
        amp = 0.052 / (1 + 0.15 * k)
        add(pad_l, t0, (amp * env * l).astype(np.float32)); add(pad_r, t0, (amp * env * r).astype(np.float32))
    # --- bass: one long sine per bar
    tb = np.arange(int((bar + 0.4) * SR)) / SR
    eb = np.minimum(1.0, tb / 0.08) * np.exp(-tb * 0.35) * np.minimum(1.0, (bar + 0.4 - tb) / 0.5)
    add(bass, t0, (0.085 * eb * (np.sin(2 * np.pi * hz(ch['bass']) * tb) + 0.12 * np.sin(2 * np.pi * hz(ch['bass']) * 2 * tb))).astype(np.float32))
    # --- plucked arpeggio, from the third bar on, with small variations
    if t0 >= 2 * bar:
        grow = min(1.0, (t0 - 2 * bar) / (6 * bar))
        for s, m in enumerate(ch['arp']):
            if (b % 4 == 2 and s in (3, 7)) or rng.random() < 0.12:
                continue  # a few rests so that it breathes
            ts = t0 + s * beat / 2 + rng.normal(0, 0.006)
            tp = np.arange(int(1.6 * SR)) / SR
            f = hz(m)
            vel = (0.55 + 0.45 * grow) * rng.uniform(0.75, 1.0)
            sig = vel * (np.exp(-tp * 5.5) * np.sin(2 * np.pi * f * tp) + 0.50 * np.exp(-tp * 8) * np.sin(2 * np.pi * 2 * f * tp) + 0.26 * np.exp(-tp * 11) * np.sin(2 * np.pi * 3 * f * tp))
            sig *= np.minimum(1.0, tp / 0.004)
            pan = 0.35 if s % 2 else 0.65
            add(arp_l, ts, (0.125 * (1 - pan) * 2 * sig).astype(np.float32)); add(arp_r, ts, (0.125 * pan * 2 * sig).astype(np.float32))

# warmth: low-pass the pad
alpha = 1 - np.exp(-2 * np.pi * 2800 / SR)
pad_l = one_pole_lowpass(pad_l, alpha); pad_r = one_pole_lowpass(pad_r, alpha)

hp_alpha = 1 - np.exp(-2 * np.pi * 170 / SR)
for name in ('pad_l', 'pad_r', 'arp_l', 'arp_r'):
    buf = globals()[name]
    globals()[name] = (buf - one_pole_lowpass(buf, hp_alpha)).astype(np.float32)

# echo on the arpeggio (dotted eighth, soft feedback)
d = int(beat * 0.75 * SR)
for buf in (arp_l, arp_r):
    for rep, g in ((1, 0.38), (2, 0.15)):
        buf[d * rep:] += g * buf[: N - d * rep]

# reverb: a decaying, low-passed noise tail, applied block by block
ir_len = int(1.9 * SR)
ir = rng.normal(0, 1, ir_len).astype(np.float32) * np.exp(-np.arange(ir_len) / (0.42 * SR)).astype(np.float32)
ir = one_pole_lowpass(ir, 1 - np.exp(-2 * np.pi * 3500 / SR))
ir /= np.sqrt(np.sum(ir ** 2))

def reverb(x, wet):
    B = 1 << 16
    size = 1 << 18
    H = np.fft.rfft(ir, size)
    y = np.zeros(len(x) + ir_len, dtype=np.float32)
    for k in range(0, len(x), B):
        blk = x[k:k + B]
        c = np.fft.irfft(np.fft.rfft(blk, size) * H, size)[: len(blk) + ir_len - 1]
        y[k:k + len(c)] += c.astype(np.float32)
    return (1 - wet) * x + wet * y[: len(x)]

L = reverb(pad_l + arp_l, 0.32) + bass
R = reverb(pad_r + arp_r, 0.32) + bass

# slow overall shape: fade in over 3 s, a gentle swell in the middle, fade out over the last 5 s
t = np.arange(N) / SR
shape = np.minimum(1.0, t / 3.0) * np.minimum(1.0, (dur - t) / 5.0) * (0.92 + 0.08 * np.sin(2 * np.pi * t / 41.0))
L *= shape.astype(np.float32); R *= shape.astype(np.float32)
peak = max(np.abs(L).max(), np.abs(R).max())
L /= peak; R /= peak
st = np.stack([L, R], axis=1) * 0.5  # peak at -6 dBFS
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype(np.int16).tobytes())
print('music', out_path, round(dur, 1), 's, rms', round(float(np.sqrt(np.mean(st ** 2))), 4))
