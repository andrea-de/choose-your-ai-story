'use client'

import type { DeskTheme } from '@/lib/themes'
import { audioContext } from './audio'
import { getSettings } from './settings'

/**
 * A small sound when the reader picks something, in each book's own idiom:
 * a quill scratch, a console chirp, typewriter keys, a ship's bell, a lyre, a chime.
 * Synthesised on the spot, so there are no audio files to load.
 */

const VOLUME = 0.22

type Voice = (ctx: AudioContext, out: AudioNode, at: number) => void

let noiseBuffer: AudioBuffer | null = null

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer?.sampleRate === ctx.sampleRate) return noiseBuffer
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

/** A burst of filtered noise with a sharp attack and an exponential fall. */
function burst(ctx: AudioContext, out: AudioNode, at: number, opts: { freq: number; q: number; length: number; gain: number; type?: BiquadFilterType }) {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = opts.type ?? 'bandpass'
  filter.frequency.value = opts.freq
  filter.Q.value = opts.q
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(opts.gain, at + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.length)
  src.connect(filter).connect(gain).connect(out)
  src.start(at, Math.random() * 0.5)
  src.stop(at + opts.length + 0.05)
}

/** A decaying tone, optionally with a pitch glide. */
function tone(ctx: AudioContext, out: AudioNode, at: number, opts: { freq: number; to?: number; length: number; gain: number; type?: OscillatorType }) {
  const osc = ctx.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, at)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.length * 0.6)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(opts.gain, at + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.length)
  osc.connect(gain).connect(out)
  osc.start(at)
  osc.stop(at + opts.length + 0.05)
}

const voices: Record<DeskTheme, Voice> = {
  /** A soft tap of paper: the library's own, neutral sound. */
  library: (ctx, out, at) => {
    burst(ctx, out, at, { freq: 1800, q: 0.7, length: 0.07, gain: 0.45 })
    tone(ctx, out, at, { freq: 220, length: 0.08, gain: 0.12 })
  },
  /** A quill's quick scratch across parchment. */
  'historic-fantasy': (ctx, out, at) => {
    burst(ctx, out, at, { freq: 3200, q: 1.4, length: 0.09, gain: 0.5 })
    burst(ctx, out, at + 0.07, { freq: 4200, q: 1.8, length: 0.12, gain: 0.35 })
  },
  /** A console acknowledging: two bright rising blips. */
  future: (ctx, out, at) => {
    tone(ctx, out, at, { freq: 880, length: 0.07, gain: 0.35, type: 'triangle' })
    tone(ctx, out, at + 0.075, { freq: 1320, length: 0.12, gain: 0.3, type: 'triangle' })
  },
  /** Three typewriter keys striking the platen. */
  noir: (ctx, out, at) => {
    for (const [i, offset] of [0, 0.075, 0.16].entries()) {
      burst(ctx, out, at + offset, { freq: 2600 + i * 300, q: 0.9, length: 0.035, gain: 0.9 })
      tone(ctx, out, at + offset, { freq: 140, length: 0.04, gain: 0.35 })
    }
  },
  /** Two strikes of a ship's bell: inharmonic partials ringing down. */
  pirate: (ctx, out, at) => {
    for (const strike of [0, 0.22]) {
      for (const [ratio, gain] of [[1, 0.28], [2.01, 0.12], [2.76, 0.09], [5.4, 0.04]] as const) {
        tone(ctx, out, at + strike, { freq: 620 * ratio, length: 1.1 - ratio * 0.12, gain })
      }
    }
  },
  /** A plucked lyre string, a fifth apart. */
  ancient: (ctx, out, at) => {
    for (const [freq, delay] of [[392, 0], [587.3, 0.09]] as const) {
      tone(ctx, out, at + delay, { freq, length: 0.9, gain: 0.3, type: 'triangle' })
      tone(ctx, out, at + delay, { freq: freq * 2, length: 0.35, gain: 0.08 })
    }
  },
  /** Glass chimes drifting in from somewhere. */
  dream: (ctx, out, at) => {
    const notes = [1046.5, 1318.5, 1568, 1760, 2093]
    for (let i = 0; i < 3; i++) {
      const freq = notes[Math.floor(Math.random() * notes.length)]
      tone(ctx, out, at + i * 0.09, { freq, length: 1.4, gain: 0.14 })
      tone(ctx, out, at + i * 0.09, { freq: freq * 1.003, length: 1.4, gain: 0.08 })
    }
  },
}

/** Plays the book's sound for a chosen option. Silent if audio is unavailable. */
export function playChoiceSound(theme: DeskTheme) {
  if (!getSettings().sfx) return
  const ctx = audioContext()
  if (!ctx) return
  try {
    const out = ctx.createGain()
    out.gain.value = VOLUME
    out.connect(ctx.destination)
    voices[theme](ctx, out, ctx.currentTime + 0.01)
  } catch {
    // A sound effect is never worth an error.
  }
}
