/**
 * What Gemini charges, per million tokens, from Google's price list
 * (ai.google.dev/gemini-api/docs/pricing, September 2026). Prices double on
 * 1 January 2027; each call is priced at the rate on the day it was made.
 */

export type UsageKind = 'text' | 'speech' | 'image'

/** One model call's token counts, as the API reported them. */
export interface Usage {
  kind: UsageKind
  model: string
  inputTokens: number
  /** Everything billed as output, thinking included. */
  outputTokens: number
}

/** Reports usage as it happens; the story service keeps the running total. */
export type Meter = (usage: Usage) => void

interface Rate {
  input: number
  output: number
}

/** Per million tokens, before 2027. */
const RATES: Record<UsageKind, Rate> = {
  // gemini-3.8-flash; output includes thinking tokens.
  text: { input: 0.75, output: 3.75 },
  // gemini-3.8-flash-tts; output is audio tokens.
  speech: { input: 0.5, output: 9 },
  // gemini-3.1-flash-lite-image; output is image tokens (about $0.034 an image).
  image: { input: 0.75, output: 30 },
}

/** The day Google's prices double. */
const DOUBLING = Date.UTC(2027, 0, 1)

export function costOf(usage: Usage, at = Date.now()): number {
  const rate = RATES[usage.kind]
  const factor = at >= DOUBLING ? 2 : 1
  return ((usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000) * factor
}

/** A story's spending so far, by kind. */
export type StoryCost = Record<UsageKind, { calls: number; inputTokens: number; outputTokens: number; usd: number }>

export const emptyCost = (): StoryCost => ({
  text: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
  speech: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
  image: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
})

export function addUsage(cost: StoryCost | undefined, usage: Usage, at = Date.now()): StoryCost {
  const next = structuredClone(cost ?? emptyCost())
  const line = next[usage.kind]
  line.calls += 1
  line.inputTokens += usage.inputTokens
  line.outputTokens += usage.outputTokens
  line.usd += costOf(usage, at)
  return next
}

export const totalUsd = (cost: StoryCost | undefined): number =>
  cost ? cost.text.usd + cost.speech.usd + cost.image.usd : 0
