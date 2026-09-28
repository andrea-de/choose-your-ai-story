'use client'

import { audioContext } from './audio'

/**
 * Plays a page's narration as it streams in: raw 16-bit PCM from the server,
 * scheduled on Web Audio a fraction of a second at a time, so the narrator
 * starts talking about a second after the reader asks, while the rest is still
 * being recorded. Everything received is kept, so the reading can jump to any
 * point (a paragraph the reader taps) without fetching it again.
 */

export interface NarrationHandlers {
  /**
   * Audio time 0 plays (or would have played) at this performance.now(). Called
   * again whenever the timeline shifts: a stall, or a jump to another point.
   */
  onStart: (startedAt: number) => void
  /** The whole reading's length, as soon as it is known. */
  onDuration: (ms: number) => void
  onEnd: () => void
  /** Nothing could be played. */
  onError: (error: unknown) => void
}

export interface Playback {
  stop: () => void
  /** Where the reading is, in milliseconds from its start. */
  position: () => number
  /** Carry on from this point in the reading; waits for it if it has not arrived yet. */
  seek: (ms: number) => void
  /** Everything received so far, as samples, and their rate. */
  samples: () => { data: Float32Array; rate: number }
  /** Hold the reading where it is; resume carries on from the same place. */
  pause: () => void
  resume: () => void
}

/** Audio buffered before playback starts, and per scheduled piece after. */
const START_AFTER_S = 0.25
const PIECE_S = 0.2

/** Call inside a tap: browsers only let audio start from one. */
export function unlockNarration() {
  audioContext()
}

export function playNarration(url: string, handlers: NarrationHandlers): Playback {
  const ctx = audioContext()
  const abort = new AbortController()
  let sources: AudioBufferSourceNode[] = []
  let stopped = false
  let done = false
  let rate = 24000
  const received: Float32Array[] = []
  let receivedLength = 0
  /** The sample the current stretch of playback started from. */
  let playFrom = 0
  /** Context time at which sample `playFrom` plays; null until playback (re)starts. */
  let startTime: number | null = null
  /** Samples scheduled so far, as an index into the reading. */
  let scheduledUpTo = 0
  let carry: number | null = null
  let lastSource: AudioBufferSourceNode | null = null
  let paused = false
  let pausedAt = 0

  const toPerformance = (ctxTime: number) => performance.now() + (ctxTime - ctx!.currentTime) * 1000
  const reportStart = () => handlers.onStart(toPerformance(startTime!) - (playFrom / rate) * 1000)

  /** Copies samples [from, to) of the reading out of the received pieces. */
  const slice = (from: number, to: number): Float32Array => {
    const out = new Float32Array(to - from)
    let offset = 0
    let written = 0
    for (const piece of received) {
      const end = offset + piece.length
      if (end > from && offset < to) {
        const a = Math.max(from, offset) - offset
        const b = Math.min(to, end) - offset
        out.set(piece.subarray(a, b), written)
        written += b - a
      }
      offset = end
      if (offset >= to) break
    }
    return out
  }

  const schedule = (force: boolean) => {
    if (!ctx || stopped || paused) return
    const available = receivedLength - scheduledUpTo
    if (available <= 0) return
    if (startTime === null) {
      if (!force && available < rate * START_AFTER_S) return
      startTime = ctx.currentTime + 0.05
      reportStart()
    } else if (!force && available < rate * PIECE_S) return

    let at = startTime + (scheduledUpTo - playFrom) / rate
    if (at < ctx.currentTime + 0.02) {
      // The recording fell behind: pause the timeline rather than skip words.
      const shift = ctx.currentTime + 0.05 - at
      startTime += shift
      at += shift
      reportStart()
    }
    const buffer = ctx.createBuffer(1, available, rate)
    buffer.getChannelData(0).set(slice(scheduledUpTo, receivedLength))
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(at)
    sources.push(source)
    lastSource = source
    scheduledUpTo = receivedLength
    watchEnd()
  }

  const watchEnd = () => {
    if (!done || !lastSource || scheduledUpTo < receivedLength) return
    const last = lastSource
    last.onended = () => {
      if (!stopped && last === lastSource) handlers.onEnd()
    }
  }

  const take = (bytes: Uint8Array) => {
    let start = 0
    const samples: number[] = []
    if (carry !== null && bytes.length > 0) {
      samples.push((((bytes[0] << 8) | carry) << 16) >> 16)
      carry = null
      start = 1
    }
    const whole = Math.floor((bytes.length - start) / 2)
    const view = new DataView(bytes.buffer, bytes.byteOffset + start, whole * 2)
    const out = new Float32Array(samples.length + whole)
    samples.forEach((s, i) => (out[i] = s / 32768))
    for (let i = 0; i < whole; i++) out[samples.length + i] = view.getInt16(i * 2, true) / 32768
    if ((bytes.length - start) % 2 === 1) carry = bytes[bytes.length - 1]
    received.push(out)
    receivedLength += out.length
  }

  const finish = () => {
    done = true
    schedule(true)
    if (stopped) return
    if (receivedLength === 0) {
      handlers.onError(new Error('The narration was empty'))
      return
    }
    handlers.onDuration((receivedLength / rate) * 1000)
    watchEnd()
  }

  const silence = () => {
    for (const source of sources) {
      try {
        source.stop()
      } catch {
        // Already finished.
      }
    }
    sources = []
    lastSource = null
  }

  void (async () => {
    try {
      if (!ctx) throw new Error('This browser cannot play audio')
      const res = await fetch(url, { signal: abort.signal })
      if (!res.ok || !res.body) throw new Error(`Narration failed: ${res.status}`)
      rate = Number(res.headers.get('Content-Type')?.match(/rate=(\d+)/)?.[1] ?? rate)
      const known = Number(res.headers.get('X-Duration-Ms'))
      if (known > 0) handlers.onDuration(known)
      if (ctx.state !== 'running') await ctx.resume().catch(() => {})
      if (ctx.state !== 'running') throw new Error('Audio is blocked until the reader taps')
      const reader = res.body.getReader()
      for (;;) {
        const { done: ended, value } = await reader.read()
        if (ended || stopped) break
        take(value)
        schedule(false)
      }
      finish()
    } catch (error) {
      if (stopped) return
      // Cut off partway: let what arrived play out, as if the page ended there.
      if (startTime !== null) finish()
      else handlers.onError(error)
    }
  })()

  return {
    stop() {
      stopped = true
      abort.abort()
      silence()
    },
    position() {
      if (!ctx || startTime === null) return (playFrom / rate) * 1000
      const played = Math.max(0, Math.min((scheduledUpTo - playFrom) / rate, ctx.currentTime - startTime))
      return (playFrom / rate + played) * 1000
    },
    seek(ms) {
      if (stopped) return
      silence()
      playFrom = Math.max(0, Math.round((ms / 1000) * rate))
      if (done) playFrom = Math.min(playFrom, receivedLength)
      scheduledUpTo = playFrom
      startTime = null
      // Starts again as soon as enough of the reading from that point is here.
      schedule(done)
    },
    samples() {
      return { data: slice(0, receivedLength), rate }
    },
    pause() {
      if (paused || stopped) return
      pausedAt = this.position()
      silence()
      // Hold the timeline at the pause, so position() reports where the reading stopped.
      playFrom = Math.round((pausedAt / 1000) * rate)
      scheduledUpTo = playFrom
      startTime = null
      paused = true
    },
    resume() {
      if (!paused || stopped) return
      paused = false
      this.seek(pausedAt)
    },
  }
}
