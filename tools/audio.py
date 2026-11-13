# Procedural soundtrack for the promo: soft pad + music-box notes + wind (swells in the storm shot).
import numpy as np, sys
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile
SR = 44100; DUR = float(sys.argv[1]); N = int(SR * DUR); t = np.arange(N) / SR
rng = np.random.default_rng(7)
STORM = (float(sys.argv[2]), float(sys.argv[3]))  # storm shot in/out (s)
midi = lambda m: 440 * 2 ** ((m - 69) / 12)

def env(n, a, r):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 2; e[-nr:] *= np.linspace(1, 0, nr) ** 2; return e

# pad: D major, 4 chords
BAR = DUR / 4
chords = [[50, 57, 62, 66, 69], [47, 54, 62, 66, 69], [43, 55, 59, 62, 66], [45, 57, 61, 64, 69]]
pad = np.zeros((N, 2))
for i, ch in enumerate(chords):
    a, b = int(max(0, i * BAR - 0.8) * SR), min(N, int(((i + 1) * BAR + 1.2) * SR)); n = b - a; tt = np.arange(n) / SR
    for j, m in enumerate(ch):
        f = midi(m)
        for det, pan in ((-0.0025, 0.3), (0.0025, 0.7)):
            ph = rng.uniform(0, 6.28)
            w = np.sin(2 * np.pi * f * (1 + det) * tt + ph) + 0.25 * np.sin(4 * np.pi * f * (1 + det) * tt + ph) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * tt + j))
            w *= env(n, 1.6, 2.0) * (0.5 if j == 0 else 0.32)
            pad[a:b, 0] += w * (1 - pan); pad[a:b, 1] += w * pan
pad *= 0.085

# music box: one note list per bar (offset in beats of BAR/8, midi)
mel = [[(0, 78), (2, 81), (3, 86), (5, 85), (6, 81)], [(0, 78), (2, 83), (4, 81), (6, 78)],
       [(0, 79), (2, 83), (3, 86), (5, 90), (6, 86)], [(0, 88), (2, 85), (4, 81), (6, 85), (7, 88)]]
box = np.zeros((N, 2))
for i, bar in enumerate(mel):
    for k, (beat, m) in enumerate(bar):
        st = int((i * BAR + beat * BAR / 8 + 0.35) * SR); n = min(int(3.2 * SR), N - st)
        if n <= 0: continue
        tt = np.arange(n) / SR; f = midi(m)
        w = (np.sin(2 * np.pi * f * tt + 1.4 * np.exp(-tt * 9) * np.sin(2 * np.pi * f * 3.01 * tt)) * np.exp(-tt * 2.6)
             + 0.3 * np.sin(2 * np.pi * f * 2 * tt) * np.exp(-tt * 5))
        w[:60] *= np.linspace(0, 1, 60); pan = 0.35 + 0.3 * ((k * 37 + i * 11) % 7) / 6
        box[st:st + n, 0] += w * (1 - pan); box[st:st + n, 1] += w * pan
box *= 0.16
# low bass note per chord
bass = np.zeros(N)
for i, ch in enumerate(chords):
    a, b = int(i * BAR * SR), min(N, int((i + 1) * BAR * SR + 0.6 * SR)); tt = np.arange(b - a) / SR
    bass[a:b] += np.sin(2 * np.pi * midi(ch[0] - 12) * tt) * env(b - a, 0.5, 1.2) * 0.16

music = pad + box + bass[:, None]
# reverb
L = int(2.6 * SR); ir = rng.standard_normal((L, 2)) * np.exp(-np.arange(L) / SR * 2.4)[:, None]
ir = sosfilt(butter(2, 5200, 'low', fs=SR, output='sos'), ir, axis=0)
wet = np.stack([fftconvolve(music[:, c], ir[:, c])[:N] for c in range(2)], 1)
music = music + wet * 0.028

# wind: band-passed noise with slow gusts, louder + higher in the storm
def gust(rate, seed):
    r = np.random.default_rng(seed); k = int(DUR * rate) + 3
    return np.interp(t, np.linspace(0, DUR, k), r.uniform(0, 1, k))
storm = np.clip(np.minimum((t - STORM[0] + 0.5) / 0.9, (STORM[1] + 0.6 - t) / 1.2), 0, 1); storm = storm * storm * (3 - 2 * storm)
wind = np.zeros((N, 2))
for c in range(2):
    nz = rng.standard_normal(N)
    lo = sosfilt(butter(2, [140, 520], 'band', fs=SR, output='sos'), nz)
    hi = sosfilt(butter(2, [520, 1700], 'band', fs=SR, output='sos'), nz)
    g = 0.35 + 0.65 * gust(0.5, 20 + c) * gust(1.3, 30 + c)
    wind[:, c] = lo * g * (0.10 + 0.5 * storm) + hi * g * (0.015 + 0.34 * storm * gust(2.2, 40 + c))
music *= (1 - 0.35 * storm)[:, None]
mix = music + wind
fade = np.minimum(1, np.minimum(t / 0.6, (DUR - t) / 1.6)); mix *= fade[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.82
wavfile.write(sys.argv[4], SR, (mix * 32767).astype(np.int16))
print('ok', DUR, np.sqrt((mix ** 2).mean()))
