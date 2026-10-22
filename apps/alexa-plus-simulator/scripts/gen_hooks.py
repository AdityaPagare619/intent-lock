#!/usr/bin/env python3
"""
Generate 10 royalty-safe 3-second "chorus hook" motifs as WAV files.
These are ORIGINAL synthesized melodies (sine/triangle stacks, no samples),
so they carry zero copyright risk in the demo video (compliance rule 2).
Each track gets an audibly DISTINCT motif — the disambiguation is real:
same-name versions must sound different, or the demo lies.

Output: ../public/hooks/<name>.wav  (22050 Hz mono 16-bit, ~130KB each)
Run: python3 scripts/gen_hooks.py
"""
import math, os, struct, wave, random

SR = 22050
DUR = 3.0
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "hooks")
os.makedirs(OUT, exist_ok=True)
random.seed(42)

def note_freq(midi: int) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)

def render(notes, bass=(), noise_amt=0.0, detune=0.0, bright=0.35):
    """notes: [(midi, start_s, dur_s, vol)] ; bass: [(midi, start_s, dur_s)]
    Returns list[float] samples in [-1, 1]."""
    n = int(SR * DUR)
    buf = [0.0] * n
    def adsr(t, dur):
        a = min(0.012, dur * 0.2)
        r = min(0.09, dur * 0.35)
        if t < a: return t / a
        if t > dur - r: return max(0.0, (dur - t) / r)
        return 1.0
    def add(midi, start, dur, vol, wave2=False):
        f = note_freq(midi) * (1.0 + detune)
        s0 = int(start * SR); s1 = min(n, int((start + dur) * SR))
        for i in range(s0, s1):
            t = (i - s0) / SR
            env = adsr(t, dur)
            v = math.sin(2 * math.pi * f * t)
            v += bright * math.sin(2 * math.pi * f * 2 * t)      # 2nd harmonic
            v += 0.12 * math.sin(2 * math.pi * f * 3 * t)       # 3rd harmonic
            if wave2:  # triangle-ish lead for karaoke thinness
                v = 2 * abs(2 * ((f * t) % 1) - 1) - 1
                v *= 0.6
            buf[i] += vol * env * v / 1.5
    for m in notes: add(*m)
    for (midi, start, dur) in bass:
        f = note_freq(midi - 12)
        s0 = int(start * SR); s1 = min(n, int((start + dur) * SR))
        for i in range(s0, s1):
            t = (i - s0) / SR
            buf[i] += 0.30 * adsr(t, dur) * math.sin(2 * math.pi * f * t)
    if noise_amt > 0:  # "live crowd" wash
        for i in range(n):
            buf[i] += noise_amt * (random.random() * 2 - 1) * 0.25
    peak = max(1e-6, max(abs(x) for x in buf))
    return [max(-1.0, min(1.0, x / peak * 0.89)) for x in buf]

def write_wav(name, samples):
    path = os.path.join(OUT, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(struct.pack("<%dh" % len(samples),
                                  *(int(s * 32767) for s in samples)))
    print(f"wrote {path} ({os.path.getsize(path)//1024}KB)")

def seq(midis, start, step, dur, vol=0.5):
    return [(m, start + i * step, dur, vol) for i, m in enumerate(midis)]

BASS = lambda root, beats: [(root, i * beats, beats * 0.9) for i in range(int(DUR / beats))]

# 1. lollipop-lagelu-studio — fast bouncy Bhojpuri-ish, C pentatonic, 8ths @150bpm
write_wav("lollipop-lagelu-studio", render(
    seq([72,74,76,79,76,74,72,74, 76,79,81,79,76,74,72,0], 0.0, 0.20, 0.18),
    bass=BASS(48, 0.4), bright=0.45))

# 2. lollipop-mika-studio — western pop, A minor, moderate 8ths
write_wav("lollipop-mika-studio", render(
    seq([69,72,76,72,69,67,69,72, 76,74,72,69,67,0,69,72], 0.0, 0.22, 0.20),
    bass=BASS(45, 0.44), bright=0.35))

# 3. raja-ji-studio — bright D major anthem
write_wav("raja-ji-studio", render(
    seq([74,76,78,81,78,76,74,76, 78,81,83,81,78,76,74,0], 0.0, 0.21, 0.19),
    bass=BASS(50, 0.42), bright=0.5))

# 4. raja-ji-studio-alt — same song, DIFFERENT take: E major, swung rhythm
notes = []
t = 0.0
for m in [76,78,80,83,80,78,76,78,80,83,85,83,80,78]:
    d = 0.26 if t % 0.52 < 0.26 else 0.16
    notes.append((m, round(t,3), 0.22, 0.5)); t += d
write_wav("raja-ji-studio-alt", render(notes, bass=BASS(52, 0.5), bright=0.4))

# 5. raja-ji-live — the anthem + crowd wash + looser timing
live_notes = [(m, s + random.uniform(-0.02, 0.02), d, v)
              for (m, s, d, v) in seq([74,76,78,81,78,76,74,76,78,81,78,76,74,0], 0.0, 0.21, 0.19)]
write_wav("raja-ji-live", render(live_notes, bass=BASS(50, 0.42),
                                 noise_amt=0.5, bright=0.35))

# 6. raja-ji-remix — four-on-the-floor + stab motif
kick = [(36 - 12, i * 0.5, 0.12) for i in range(6)]
stabs = [(74, i * 0.5 + 0.25, 0.12, 0.55) for i in range(6)] + \
        [(78, i * 0.5 + 0.25, 0.12, 0.45) for i in range(2, 6)]
write_wav("raja-ji-remix", render(stabs, bass=kick, bright=0.6))

# 7. raja-ji-karaoke — thin melody only, slightly detuned, no bass (cheap feel)
thin = []
for (m, s, d, v) in seq([74,76,78,81,78,76,74,76,78,81,78,76], 0.0, 0.24, 0.22):
    thin.append((m, s, d, v))
buf = render([], detune=0.004)
# re-render thin via wave2 flag path: build manually
n = int(SR * DUR); kbuf = [0.0] * n
for (m, s, d, v) in thin:
    f = note_freq(m) * 1.004
    s0 = int(s * SR); s1 = min(n, int((s + d) * SR))
    for i in range(s0, s1):
        tri = 2 * abs(2 * ((f * (i - s0) / SR) % 1) - 1) - 1
        kbuf[i] += v * 0.5 * tri
peak = max(1e-6, max(abs(x) for x in kbuf))
write_wav("raja-ji-karaoke", [x / peak * 0.8 for x in kbuf])

# 8. mujhe-tum-yaad-studio — slow warm F major, legato
write_wav("mujhe-tum-yaad-studio", render(
    seq([65,67,69,72,69,67,65,62, 65,67,65,0], 0.0, 0.42, 0.40, vol=0.45),
    bass=[(53, 0.0, 1.4), (50, 1.4, 1.4)], bright=0.25))

# 9. despacito-studio — D minor syncopated latin-ish
dnotes = []
t = 0.0
for m in [62,65,69,65,62,60,62,65, 69,72,69,65,62,0]:
    dnotes.append((m, round(t,3), 0.20, 0.5)); t += 0.19 if t % 0.38 < 0.19 else 0.28
write_wav("despacito-studio", render(dnotes, bass=BASS(50, 0.47), bright=0.4))

# 10. upsell-ad — annoying two-tone ad beep (the trap you never want to hear)
ad = []
for i in range(12):
    f = 880 if i % 2 == 0 else 660
    ad.append((69 if f == 880 else 64, i * 0.25, 0.22, 0.5))
write_wav("upsell-ad", render(ad, bright=0.7))

print("done — 10 royalty-safe motifs, zero copyright risk.")
