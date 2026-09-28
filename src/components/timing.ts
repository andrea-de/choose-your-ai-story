/** The words of a page, paragraph by paragraph, as RevealText renders them. */
export function splitWords(text: string): string[][] {
  return text.split(/\n\s*\n/).map((p) => p.split(/\s+/).filter(Boolean))
}

/** Silent reading: one word every `pace` milliseconds. */
export function pacedTimes(text: string, pace: number): number[] {
  const total = splitWords(text).reduce((n, p) => n + p.length, 0)
  return Array.from({ length: total }, (_, i) => i * pace)
}

/** Allowance for the silence a speech model leaves before the first word and after the last. */
const LEAD_MS = 250
const TAIL_MS = 500

/** How long a word takes to say, relative to others: its length, plus the pause after it. */
function wordWeight(word: string, lastInParagraph: boolean): number {
  let weight = word.replace(/[^\p{L}\p{N}]/gu, '').length + 2
  if (/[.!?…]["'”’)]*$/.test(word)) weight += 7
  else if (/[,;:—–]["'”’)]*$/.test(word)) weight += 3
  if (lastInParagraph) weight += 6
  return weight
}

/** Spreads words across [from, to] milliseconds by their weights. */
function spread(words: readonly string[], from: number, to: number, paragraphEnds: boolean): number[] {
  const weights = words.map((w, i) => wordWeight(w, paragraphEnds && i === words.length - 1))
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let before = 0
  return weights.map((w) => {
    const t = from + (before / total) * Math.max(0, to - from)
    before += w
    return Math.round(t)
  })
}

/**
 * Read aloud: when each word is spoken, estimated from its length and the pause
 * that follows it, spread across the recording's duration.
 */
export function spokenTimes(text: string, durationMs: number): number[] {
  const words = splitWords(text)
  const flat = words.flatMap((p) => p)
  // Paragraph-final words get their extra pause, as in a single run of speech.
  const weights = words.flatMap((p) => p.map((w, i) => wordWeight(w, i === p.length - 1)))
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const span = Math.max(0, durationMs - LEAD_MS - TAIL_MS)
  let before = 0
  return flat.map((_, i) => {
    const t = LEAD_MS + (before / total) * span
    before += weights[i]
    return Math.round(t)
  })
}

/** For each word, the paragraph it belongs to. */
export function paragraphOfWord(text: string): number[] {
  return splitWords(text).flatMap((p, i) => p.map(() => i))
}

/** Index of the first word of each paragraph. */
export function firstWords(text: string): number[] {
  const starts: number[] = []
  let n = 0
  for (const p of splitWords(text)) {
    starts.push(n)
    n += p.length
  }
  return starts
}

export interface Pause {
  /** Milliseconds. */
  start: number
  end: number
}

/**
 * Stretches of near-silence in a recording: the narrator drawing breath. Loudness
 * is measured in 10ms windows against the recording's own voiced level, so it
 * works whatever the volume.
 */
export function findPauses(samples: Float32Array, rate: number, minMs = 180): Pause[] {
  const win = Math.max(1, Math.round(rate / 100))
  const levels: number[] = []
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j]
    levels.push(Math.sqrt(sum / win))
  }
  if (levels.length === 0) return []
  const sorted = [...levels].sort((a, b) => a - b)
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 0
  const quiet = Math.max(0.004, loud * 0.08)
  const pauses: Pause[] = []
  let from = -1
  for (let k = 0; k <= levels.length; k++) {
    const silent = k < levels.length && levels[k] < quiet
    if (silent && from < 0) from = k
    if (!silent && from >= 0) {
      if ((k - from) * 10 >= minMs) pauses.push({ start: from * 10, end: k * 10 })
      from = -1
    }
  }
  return pauses
}

/**
 * Where each paragraph starts in a recording. The estimate from word lengths is
 * snapped to the longest pause near it, since narrators breathe between paragraphs.
 */
export function paragraphStarts(text: string, samples: Float32Array, rate: number): number[] {
  const durationMs = (samples.length / rate) * 1000
  const estimated = spokenTimes(text, durationMs)
  const firsts = firstWords(text)
  const pauses = findPauses(samples, rate)
  // Speech starts where the first silence (if the recording opens with one) ends.
  const opening = pauses[0]?.start === 0 ? pauses[0].end : 0
  const starts = [Math.max(0, opening - 80)]
  const reach = Math.max(1500, (durationMs / Math.max(1, firsts.length)) * 0.35)
  for (let k = 1; k < firsts.length; k++) {
    const guess = estimated[firsts[k]]
    const after = starts[k - 1] + 500
    let best: Pause | null = null
    let bestScore = -Infinity
    for (const p of pauses) {
      if (p.end <= after) continue
      const distance = Math.abs(p.end - guess)
      if (distance > reach) continue
      // Longer pauses closer to the estimate win.
      const score = (p.end - p.start) - distance * 0.25
      if (score > bestScore) {
        best = p
        bestScore = score
      }
    }
    starts.push(best ? Math.max(after, best.end - 80) : Math.max(after, guess))
  }
  return starts
}

/**
 * Word timings for a finished recording: each paragraph's words spread between
 * where it starts and where the next begins, so the words keep pace paragraph by
 * paragraph instead of drifting across the whole page.
 */
export function alignedTimes(text: string, starts: readonly number[], durationMs: number): number[] {
  const words = splitWords(text)
  return words.flatMap((paragraph, k) => {
    const from = starts[k] ?? 0
    const next = starts[k + 1]
    // Leave the breath before the next paragraph (or the tail of the recording) unspoken.
    const to = next !== undefined ? Math.max(from, next - 450) : Math.max(from, durationMs - TAIL_MS)
    return spread(paragraph, from + 60, to, false)
  })
}

/** The last word index spoken by `elapsedMs`, or -1 before the first. */
export function wordAt(times: readonly number[], elapsedMs: number): number {
  let lo = 0
  let hi = times.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= elapsedMs) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/**
 * How long a narrator will take over a page, before the recording is finished.
 * Measured narrators read about 12 characters a second; the real length replaces this once known.
 */
export function estimateSpokenMs(text: string): number {
  return (text.replace(/\s/g, '').length / 12) * 1000
}

/**
 * New timings for a page already being read aloud: words already shown keep their
 * times, so nothing disappears; the rest move to the new timings, never into the past.
 */
export function retime(old: readonly number[], next: readonly number[], elapsedMs: number): number[] {
  return old.map((t, i) => (t <= elapsedMs ? t : Math.max(next[i] ?? t, elapsedMs + 60)))
}
