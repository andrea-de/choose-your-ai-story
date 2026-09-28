// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Just enough Web Audio to see what the player schedules. */
class FakeContext {
  static last: FakeContext
  state = 'running'
  currentTime = 10
  destination = {}
  started: { samples: Float32Array; at: number; source: { onended: null | (() => void); stopped: boolean } }[] = []
  constructor() {
    FakeContext.last = this
  }
  resume() {
    return Promise.resolve()
  }
  gains: { value: number; ramps: number[] }[] = []
  createGain() {
    const g = { value: 1, ramps: [] as number[] }
    this.gains.push(g)
    const node = {
      gain: {
        get value() {
          return g.value
        },
        setValueAtTime: (v: number) => {
          g.value = v
        },
        linearRampToValueAtTime: (v: number) => {
          g.ramps.push(v)
          g.value = v
        },
        cancelScheduledValues: () => {},
      },
      connect: (next: unknown) => next,
    }
    return node
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 150 })
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
  createBufferSource() {
    const ctx = this
    const source = {
      buffer: null as null | { getChannelData?: () => Float32Array },
      onended: null as null | (() => void),
      stopped: false,
      loop: false,
      connect: (next: unknown) => next,
      start(at: number) {
        ctx.started.push({ samples: source.buffer!.getChannelData?.() ?? new Float32Array(0), at, source })
      },
      stop() {
        source.stopped = true
      },
    }
    return source
  }
}

/** A response whose body arrives in the given pieces. */
function streamed(pieces: number[][], headers: Record<string, string> = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of pieces) controller.enqueue(new Uint8Array(p))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'audio/L16;rate=24000;channels=1', ...headers } })
}

/** Little-endian 16-bit samples as bytes. */
const bytes = (...samples: number[]) => samples.flatMap((s) => [s & 0xff, (s >> 8) & 0xff])

const settle = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('AudioContext', FakeContext)
})
afterEach(() => vi.unstubAllGlobals())

function handlers() {
  return { onStart: vi.fn(), onDuration: vi.fn(), onEnd: vi.fn(), onError: vi.fn() }
}

describe('playNarration', () => {
  it('rebuilds samples split across network chunks, and schedules them once enough has arrived', async () => {
    const { playNarration } = await import('@/components/narrator')
    // 0.6s of audio: the first sample is 1000, the last -2; samples straddle chunk boundaries.
    const samples = Array.from({ length: 14400 }, (_, i) => (i === 0 ? 1000 : i === 14399 ? -2 : 0))
    const all = bytes(...samples)
    vi.stubGlobal('fetch', vi.fn(async () => streamed([all.slice(0, 3), all.slice(3, 12001), all.slice(12001)])))
    const h = handlers()
    playNarration('/n', h)
    await settle()
    await settle()
    const ctx = FakeContext.last
    const played = ctx.started.flatMap((s) => [...s.samples])
    expect(played).toHaveLength(14400)
    expect(played[0]).toBeCloseTo(1000 / 32768)
    expect(played[14399]).toBeCloseTo(-2 / 32768)
    expect(ctx.started).toHaveLength(2)
    // Pieces follow one another with no gap.
    expect(ctx.started[0].at).toBeCloseTo(10.05)
    expect(ctx.started[1].at).toBeCloseTo(10.05 + ctx.started[0].samples.length / 24000)
    expect(h.onStart).toHaveBeenCalledTimes(1)
    expect(h.onDuration).toHaveBeenCalledWith(600)
    ctx.started.at(-1)!.source.onended!()
    expect(h.onEnd).toHaveBeenCalled()
  })

  it('knows the length at once for a stored recording', async () => {
    const { playNarration } = await import('@/components/narrator')
    vi.stubGlobal('fetch', vi.fn(async () => streamed([bytes(...new Array(12000).fill(1))], { 'X-Duration-Ms': '500' })))
    const h = handlers()
    playNarration('/n', h)
    await settle()
    expect(h.onDuration.mock.calls[0][0]).toBe(500)
  })

  it('reports where the reading has got to, and stops everything on request', async () => {
    const { playNarration } = await import('@/components/narrator')
    vi.stubGlobal('fetch', vi.fn(async () => streamed([bytes(...new Array(24000).fill(0))])))
    const h = handlers()
    const play = playNarration('/n', h)
    await settle()
    await settle()
    const ctx = FakeContext.last
    ctx.currentTime = 10.55
    expect(play.position()).toBeCloseTo(500)
    play.stop()
    expect(ctx.started.every((s) => s.source.stopped)).toBe(true)
  })

  it('jumps to a point in the reading, from what it already has', async () => {
    const { playNarration } = await import('@/components/narrator')
    // One second of audio whose samples count up, so we can see where playback resumes.
    const samples = Array.from({ length: 24000 }, (_, i) => i % 1000)
    vi.stubGlobal('fetch', vi.fn(async () => streamed([bytes(...samples)])))
    const h = handlers()
    const play = playNarration('/n', h)
    await settle()
    await settle()
    const ctx = FakeContext.last
    const firstSource = ctx.started[0].source
    play.seek(500)
    expect(firstSource.stopped).toBe(true)
    const resumed = ctx.started.at(-1)!
    expect(resumed.samples.length).toBe(12000)
    expect(resumed.samples[0]).toBeCloseTo((12000 % 1000) / 32768)
    expect(play.position()).toBeCloseTo(500)
    // The reading's clock is moved so audio time 0 is half a second before the resumed start.
    expect(h.onStart).toHaveBeenCalledTimes(2)
    expect(play.samples().data).toHaveLength(24000)
  })

  it('pauses where it is and resumes from the same place', async () => {
    const { playNarration } = await import('@/components/narrator')
    vi.stubGlobal('fetch', vi.fn(async () => streamed([bytes(...new Array(24000).fill(0))])))
    const play = playNarration('/n', handlers())
    await settle()
    await settle()
    const ctx = FakeContext.last
    ctx.currentTime = 10.35
    play.pause()
    expect(ctx.started.every((s) => s.source.stopped)).toBe(true)
    expect(play.position()).toBeCloseTo(300)
    ctx.currentTime = 20
    expect(play.position()).toBeCloseTo(300)
    play.resume()
    expect(ctx.started.at(-1)!.samples.length).toBe(24000 - 7200)
  })

  it('fails without a sound when the narration cannot be fetched', async () => {
    const { playNarration } = await import('@/components/narrator')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })))
    const h = handlers()
    playNarration('/n', h)
    await settle()
    expect(h.onError).toHaveBeenCalled()
    expect(h.onStart).not.toHaveBeenCalled()
  })

  it('fails when the browser will not play audio yet', async () => {
    const { playNarration } = await import('@/components/narrator')
    vi.stubGlobal(
      'AudioContext',
      class extends FakeContext {
        state = 'suspended'
      },
    )
    vi.stubGlobal('fetch', vi.fn(async () => streamed([bytes(1, 2)])))
    const h = handlers()
    playNarration('/n', h)
    await settle()
    expect(h.onError).toHaveBeenCalled()
  })
})

describe('ambience', () => {
  it('loops the book’s background, crossfades to another book, and ducks under the narrator', async () => {
    const { setAmbience, duckAmbience } = await import('@/components/ambience')
    const fetchMock = vi.fn(async () => new Response(new ArrayBuffer(8)))
    vi.stubGlobal('fetch', fetchMock)
    setAmbience('noir')
    await settle()
    const ctx = FakeContext.last
    expect(fetchMock).toHaveBeenCalledWith('/ambience/noir.m4a')
    const noir = ctx.started[0].source as unknown as { loop: boolean; stopped: boolean }
    expect(noir.loop).toBe(true)
    expect(ctx.gains[0].ramps.at(-1)).toBeCloseTo(0.55)

    duckAmbience(true)
    expect(ctx.gains[0].ramps.at(-1)).toBeCloseTo(0.18)
    duckAmbience(false)

    setAmbience('pirate')
    await settle()
    expect(fetchMock).toHaveBeenCalledWith('/ambience/pirate.m4a')
    // The old loop fades out and stops; the new one fades in.
    expect(ctx.gains[0].ramps.at(-1)).toBe(0)
    expect(noir.stopped).toBe(true)
    expect(ctx.started).toHaveLength(2)

    setAmbience(null)
    expect(ctx.gains[1].ramps.at(-1)).toBe(0)
  })
})
