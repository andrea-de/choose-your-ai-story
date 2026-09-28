import { useSyncExternalStore } from 'react'
import { SETTINGS_KEY, TEXT_SCALE } from './settingsScript'

/** The reader's preferences, remembered in this browser. */
export interface Settings {
  /** Little sounds when choosing things. */
  sfx: boolean
  /** Each book's quiet background: a fire, rain, waves. */
  ambience: boolean
  /**
   * Narration on: each new page is read aloud as the reader turns to it, and a
   * tapped paragraph is read from its start. The ribbon pauses and resumes.
   */
  narration: boolean
  /** How fast the narrator speaks: 0.85, 1, 1.2 or 1.4 times. Same pitch at any speed. */
  voiceSpeed: number
  textSize: 'small' | 'medium' | 'large'
  /** How quickly the words appear. */
  pace: 'slow' | 'normal' | 'fast' | 'instant'
  /** Simple fades instead of turning pages, and no drifting or drawing. */
  motion: 'full' | 'reduced'
}

export const DEFAULT_SETTINGS: Settings = { sfx: true, ambience: true, narration: false, voiceSpeed: 1, textSize: 'medium', pace: 'normal', motion: 'full' }

/** Multiplies the theme's pause between words. */
export const PACE_FACTOR: Record<Settings['pace'], number> = { slow: 1.5, normal: 1, fast: 0.55, instant: 0 }

const listeners = new Set<() => void>()
let fallback: Settings = DEFAULT_SETTINGS
let cached: { raw: string | null; value: Settings } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(SETTINGS_KEY)
  } catch {
    return null
  }
}

export function getSettings(): Settings {
  const raw = readRaw()
  if (raw === null) return fallback
  if (cached?.raw === raw) return cached.value
  let value = DEFAULT_SETTINGS
  try {
    value = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    // Corrupt entry: fall back to the defaults.
  }
  cached = { raw, value }
  return value
}

const changeListeners = new Set<(next: Settings, previous: Settings) => void>()

/** Called with the new and old settings whenever they change. Returns an unsubscribe. */
export function onSettingsChange(listener: (next: Settings, previous: Settings) => void) {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

export function updateSettings(change: Partial<Settings>) {
  const previous = getSettings()
  const next = { ...previous, ...change }
  fallback = next
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable; the in-memory copy still works for this visit.
  }
  applySettings(next)
  listeners.forEach((l) => l())
  changeListeners.forEach((l) => l(next, previous))
}

/** Only for tests: forget everything. */
export function resetSettings() {
  fallback = DEFAULT_SETTINGS
  cached = null
  try {
    localStorage.removeItem(SETTINGS_KEY)
  } catch {
    // Nothing to clear.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULT_SETTINGS)
}

/** Settings that live on the page itself: text size and motion. */
export function applySettings(settings: Settings) {
  if (typeof document === 'undefined') return
  document.documentElement.style.fontSize = TEXT_SCALE[settings.textSize]
  document.documentElement.dataset.motion = settings.motion
}
