"""The harness's ears: transcribes takes and measures their pitch.

  python listen.py FILE.wav [FILE.wav ...]

Prints one JSON object per file: {"file", "text", "f0"}. The transcript shows
whether a take says its words (nothing cut off or garbled); f0 is the median
speaking pitch in Hz, so a promo voice can be kept clear of the app's narrators.
"""
import json
import sys

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

model = WhisperModel("base.en", device="cpu", compute_type="int8")


def median_f0(path):
    audio, rate = sf.read(path)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    frame, hop = int(rate * 0.04), int(rate * 0.01)
    lo, hi = int(rate / 400), int(rate / 70)
    found = []
    for start in range(0, len(audio) - frame, hop):
        x = audio[start : start + frame]
        if np.sqrt(np.mean(x**2)) < 0.02:
            continue
        x = x - x.mean()
        ac = np.correlate(x, x, "full")[frame - 1 :]
        if ac[0] <= 0:
            continue
        lag = lo + int(np.argmax(ac[lo:hi]))
        if ac[lag] / ac[0] > 0.45:
            found.append(rate / lag)
    return round(float(np.median(found)), 1) if found else None


for path in sys.argv[1:]:
    segments, _ = model.transcribe(path, beam_size=5, language="en")
    text = " ".join(s.text.strip() for s in segments)
    print(json.dumps({"file": path, "text": text, "f0": median_f0(path)}), flush=True)
