"""
Builds one seamless ambient loop per theme (public/ambience/<theme>.m4a) from the
openly licensed recordings listed in public/ambience/CREDITS.md. Download those
files from Wikimedia Commons into raw/ first; needs ffmpeg and numpy.
"""
import subprocess, numpy as np, json, os
RATE = 44100
LOOP = 150.0   # seconds
XFADE = 6.0    # seconds of the end blended into the start

def load(path, start=0.0, filters=None):
    """Decodes a file to mono float32, optionally filtered by ffmpeg."""
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(start), '-i', path]
    if filters: cmd += ['-af', filters]
    cmd += ['-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()

def span(x, seconds):
    """Repeats (with crossfades) or trims x to exactly `seconds`, plus the crossfade tail."""
    need = int((seconds + XFADE) * RATE)
    fade = int(2.0 * RATE)
    out = x[:need].copy()
    while len(out) < need:
        ramp = np.linspace(0, 1, fade, dtype=np.float32)
        head = x[:fade] * ramp
        out[-fade:] = out[-fade:] * (1 - ramp) + head
        out = np.concatenate([out, x[fade:]])
    return out[:need]

def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)

def at(x, db):
    """Scales x to a given RMS level in dBFS."""
    return x * (10 ** ((db - rms_db(x)) / 20))

def seamless(x):
    """Blends the last XFADE seconds into the first, so the loop has no seam."""
    n = int(LOOP * RATE); f = int(XFADE * RATE)
    body = x[:n].copy()
    ramp = np.linspace(0, 1, f, dtype=np.float32)
    body[:f] = x[n:n + f] * (1 - ramp) + body[:f] * ramp
    return body

R = 'raw/'
MIXES = {
  'historic-fantasy': [(R+'Bones breaking wood fire ice crackling.ogg', 0, 'lowpass=f=4500,highpass=f=80,acompressor=threshold=0.04:ratio=8:attack=1:release=60', -30),
                       (R+'Medieval Story by Frank Schröter.ogg', 0, 'lowpass=f=6000', -33)],
  'future':           [(R+'John Bartmann - flourescent-crystals-master.ogg', 30, 'highpass=f=55', -28)],
  'noir':             [(R+'Urban Street on a Rainy Afternoon.flac', 400, 'highpass=f=90,lowpass=f=9000', -28)],
  'pirate':           [(R+'Ocean Waves on a Tropical Beach.ogg', 60, 'lowpass=f=7000', -27)],
  'ancient':          [(R+'Ocean Waves on a Tropical Beach.ogg', 200, 'lowpass=f=5000', -33),
                       (R+'Birdsong mild sunny day.ogg', 0, 'highpass=f=300', -34),
                       (R+'Cicada orni.ogg', 0, 'lowpass=f=3500,highpass=f=800', -42)],
  'dream':            [(R+'Windchime.ogg', 0, 'lowpass=f=7000', -31),
                       (R+'John Bartmann - bee-hive-pad-master (audio).ogg', 20, 'lowpass=f=2500,highpass=f=70', -35)],
}
os.makedirs('out', exist_ok=True)
for theme, layers in MIXES.items():
    mix = None
    for path, start, flt, db in layers:
        x = at(span(load(path, start, flt), LOOP), db)
        mix = x if mix is None else mix + x
    loop = seamless(mix)
    peak = np.max(np.abs(loop))
    if peak > 0.89: loop *= 0.89 / peak
    raw = f'out/{theme}.f32'
    loop.astype(np.float32).tofile(raw)
    # AAC in .m4a plays everywhere, including Safari on iPhones.
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', raw,
                    '-c:a', 'aac', '-b:a', '80k', f'out/{theme}.m4a'], check=True)
    os.remove(raw)
    print(f'{theme:17} rms {rms_db(loop):6.1f} dBFS  peak {20*np.log10(np.max(np.abs(loop))):5.1f} dBFS  {os.path.getsize(f"out/{theme}.m4a")//1024} KB')
