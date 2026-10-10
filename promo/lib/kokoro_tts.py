"""Reads lines aloud with Kokoro-82M, locally, for the promo videos.

  python kokoro_tts.py JOBS.json

JOBS.json is a list of {"text", "voice", "speed", "out"}. The model loads once
for the whole list. Model files live in $KOKORO_DIR (default /opt/kokoro):
kokoro-v1.0.onnx and voices-v1.0.bin from the kokoro-onnx model-files-v1.0 release.
"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

root = os.environ.get("KOKORO_DIR", "/opt/kokoro")
kokoro = Kokoro(os.path.join(root, "kokoro-v1.0.onnx"), os.path.join(root, "voices-v1.0.bin"))
for job in json.load(open(sys.argv[1])):
    lang = "en-gb" if job["voice"][:1] == "b" else "en-us"
    samples, rate = kokoro.create(job["text"], voice=job["voice"], speed=job.get("speed", 1.0), lang=lang)
    sf.write(job["out"], samples, rate)
    print(f'{job["out"]}: {len(samples) / rate:.2f} s', flush=True)
