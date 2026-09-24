import { useSyncExternalStore } from 'react'

/** Pages this browser has already read, per story, kept for the session. */

const EMPTY: ReadonlySet<number> = new Set()
const listeners = new Set<() => void>()
const fallback = new Map<string, string>()
const cache = new Map<string, { raw: string; set: ReadonlySet<number> }>()

const keyFor = (storyId: string) => `read:${storyId}`

function readRaw(storyId: string): string {
  try {
    return sessionStorage.getItem(keyFor(storyId)) ?? fallback.get(storyId) ?? '[]'
  } catch {
    return fallback.get(storyId) ?? '[]'
  }
}

function snapshot(storyId: string): ReadonlySet<number> {
  const raw = readRaw(storyId)
  const cached = cache.get(storyId)
  if (cached?.raw === raw) return cached.set
  let set: ReadonlySet<number> = EMPTY
  try {
    set = new Set(JSON.parse(raw) as number[])
  } catch {
    // Corrupt entry: treat as nothing read.
  }
  cache.set(storyId, { raw, set })
  return set
}

export function markPageRead(storyId: string, page: number) {
  const current = snapshot(storyId)
  if (current.has(page)) return
  const raw = JSON.stringify([...current, page])
  fallback.set(storyId, raw)
  try {
    sessionStorage.setItem(keyFor(storyId), raw)
  } catch {
    // Storage unavailable; the in-memory copy still works for this visit.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useReadPages(storyId: string): ReadonlySet<number> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(storyId),
    () => EMPTY,
  )
}
