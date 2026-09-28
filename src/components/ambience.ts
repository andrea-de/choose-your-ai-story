'use client'

import { useEffect } from 'react'
import type { ThemeId } from '@/lib/story/types'
import { audioContext } from './audio'
import { useSettings } from './settings'

/**
 * Each book's quiet background: a fire, rain, waves, a ship's hum. One seamless
 * loop per theme (public/ambience/, credited in CREDITS.md), crossfaded when the
 * book changes, and turned down while the narrator speaks.
 */

const LEVEL = 0.55
const DUCKED = 0.18
const FADE_S = 2.5

interface Playing {
  theme: ThemeId
  source: AudioBufferSourceNode
  gain: GainNode
}

const buffers = new Map<ThemeId, Promise<AudioBuffer>>()
let current: Playing | null = null
let wanted: ThemeId | null = null
let ducked = false

function load(ctx: AudioContext, theme: ThemeId): Promise<AudioBuffer> {
  let buffer = buffers.get(theme)
  if (!buffer) {
    buffer = fetch(`/ambience/${theme}.m4a`)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`ambience ${res.status}`))))
      .then((data) => ctx.decodeAudioData(data))
    buffer.catch(() => buffers.delete(theme))
    buffers.set(theme, buffer)
  }
  return buffer
}

function fadeOut(playing: Playing, ctx: AudioContext) {
  const now = ctx.currentTime
  playing.gain.gain.cancelScheduledValues(now)
  playing.gain.gain.setValueAtTime(playing.gain.gain.value, now)
  playing.gain.gain.linearRampToValueAtTime(0, now + FADE_S)
  playing.source.stop(now + FADE_S + 0.1)
}

/** Plays this theme's background (null for none), crossfading from whatever was playing. */
export function setAmbience(theme: ThemeId | null) {
  wanted = theme
  const ctx = audioContext()
  if (!ctx) return
  if (current && current.theme === theme) return
  if (current) {
    fadeOut(current, ctx)
    current = null
  }
  if (!theme) return
  void load(ctx, theme)
    .then((buffer) => {
      // The reader may have moved on while it loaded.
      if (wanted !== theme || current?.theme === theme) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(ducked ? DUCKED : LEVEL, ctx.currentTime + FADE_S)
      source.connect(gain).connect(ctx.destination)
      // Start somewhere in the loop, so a return visit does not always begin the same way.
      source.start(0, Math.random() * buffer.duration)
      current = { theme, source, gain }
    })
    .catch(() => {
      // Background sound is a nicety; without it the book reads the same.
    })
}

/** Turns the background down while the narrator speaks, and back up after. */
export function duckAmbience(on: boolean) {
  ducked = on
  const ctx = audioContext()
  if (!ctx || !current) return
  const now = ctx.currentTime
  current.gain.gain.cancelScheduledValues(now)
  current.gain.gain.setValueAtTime(current.gain.gain.value, now)
  current.gain.gain.linearRampToValueAtTime(on ? DUCKED : LEVEL, now + 0.8)
}

/** The book's background sound, while this component shows it, if the reader has it on. */
export function useAmbience(theme: ThemeId | null, narratorSpeaking = false) {
  const { ambience } = useSettings()
  useEffect(() => {
    setAmbience(ambience ? theme : null)
  }, [ambience, theme])
  useEffect(() => {
    duckAmbience(narratorSpeaking)
  }, [narratorSpeaking])
  // Browsers keep sound off until the reader first taps; any tap will do.
  useEffect(() => {
    const unlock = () => audioContext()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])
}
