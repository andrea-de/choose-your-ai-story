/** Wraps raw 16-bit mono PCM in a WAV header, so browsers can play it. */
export function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new DataView(new ArrayBuffer(44))
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  header.setUint32(4, 36 + pcm.length, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true) // PCM
  header.setUint16(22, 1, true) // mono
  header.setUint32(24, sampleRate, true)
  header.setUint32(28, sampleRate * 2, true)
  header.setUint16(32, 2, true)
  header.setUint16(34, 16, true)
  ascii(36, 'data')
  header.setUint32(40, pcm.length, true)
  const wav = new Uint8Array(44 + pcm.length)
  wav.set(new Uint8Array(header.buffer), 0)
  wav.set(pcm, 44)
  return wav
}

/** Reads the sample rate from a mime type like "audio/L16;codec=pcm;rate=24000". */
export function pcmRate(mimeType: string, fallback = 24000): number {
  const match = mimeType.match(/rate=(\d+)/)
  return match ? Number(match[1]) : fallback
}

/** The PCM samples and rate inside a WAV file. */
export function wavToPcm(wav: Uint8Array): { pcm: Uint8Array; sampleRate: number } {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file')
  let sampleRate = 24000
  let offset = 12
  while (offset + 8 <= wav.length) {
    const size = view.getUint32(offset + 4, true)
    if (tag(offset) === 'fmt ') sampleRate = view.getUint32(offset + 12, true)
    // Streamed WAVs may claim an unknown (maximal) size: take whatever is there.
    if (tag(offset) === 'data') return { pcm: wav.subarray(offset + 8, Math.min(wav.length, offset + 8 + size)), sampleRate }
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV file has no data')
}
