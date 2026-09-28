'use client'

/** One Web Audio context for the narrator and the sound effects. */
let context: AudioContext | null = null

/**
 * The shared context, created and resumed if need be. Call it inside a tap the
 * first time: browsers only let audio start from one.
 */
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    // Web Audio obeys the iPhone's silent switch unless the page says it plays media.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
  } catch {
    // Not supported; nothing to do.
  }
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  context ??= new Context()
  if (context.state === 'suspended') void context.resume()
  return context
}
