import { describe, expect, it } from 'vitest'
import { changeTempo, parseSpeed, processVoice, voiceFilter } from '@/lib/ai/tempo'

/** One second of a 440Hz tone as 16-bit PCM, in a few chunks like a stream. */
function tone(rate = 24000) {
  const samples = new Int16Array(rate)
  for (let i = 0; i < rate; i++) samples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000)
  const bytes = new Uint8Array(samples.buffer)
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 9600) c.enqueue(bytes.slice(i, i + 9600))
      c.close()
    },
  })
}

async function read(stream: ReadableStream<Uint8Array>) {
  const parts: number[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(...value)
  }
  return new Int16Array(Uint8Array.from(parts).buffer)
}

/** Upward zero crossings per second: the tone's pitch. */
const pitch = (s: Int16Array, rate = 24000) => {
  let n = 0
  for (let i = 1; i < s.length; i++) if (s[i - 1] < 0 && s[i] >= 0) n++
  return n / (s.length / rate)
}

describe('changeTempo', () => {
  it('speeds the narration up without raising the voice', async () => {
    const out = await read(changeTempo(tone(), 24000, 1.4))
    expect(out.length / 24000).toBeCloseTo(1 / 1.4, 1)
    expect(pitch(out)).toBeGreaterThan(420)
    expect(pitch(out)).toBeLessThan(460)
  })

  it('leaves normal speed alone', async () => {
    expect((await read(changeTempo(tone(), 24000, 1))).length).toBe(24000)
  })

  it('passes the narration through untouched on a server without ffmpeg', async () => {
    const path = process.env.PATH
    process.env.PATH = ''
    try {
      const out = await read(processVoice(tone(), 24000, { speed: 1.4, treatment: 'robot' }))
      expect(out).toEqual(await read(tone()))
    } finally {
      process.env.PATH = path
    }
  })

  it('accepts only the offered speeds', () => {
    expect(parseSpeed('1.2')).toBe(1.2)
    expect(parseSpeed('7')).toBe(1)
    expect(parseSpeed(null)).toBe(1)
  })
})

describe('voice treatments', () => {
  it('builds one filter graph for a treatment and a speed', () => {
    expect(voiceFilter('none', 1)).toBeNull()
    expect(voiceFilter('none', 1.2)).toBe('[0:a]atempo=1.2[out]')
    expect(voiceFilter('radio', 1)).toMatch(/^\[0:a\]highpass.*\[out\]$/)
    expect(voiceFilter('robot', 1.4)).toMatch(/\[mid\];\[mid\]atempo=1\.4\[out\]$/)
  })

  it.each(['robot', 'radio', 'temple', 'dream'] as const)('%s changes the sound and keeps it playing', async (treatment) => {
    const input = await read(tone())
    const out = await read(processVoice(tone(), 24000, { treatment }))
    // About as long (echoes may add a little tail), and audibly different.
    expect(out.length / 24000).toBeGreaterThan(0.95)
    expect(out.length / 24000).toBeLessThan(1.5)
    let diff = 0
    for (let i = 0; i < 24000; i++) diff += Math.abs(out[i] - input[i])
    expect(diff / 24000).toBeGreaterThan(200)
    expect(Math.max(...out.slice(0, 24000).map(Math.abs))).toBeGreaterThan(2000)
  })
})
