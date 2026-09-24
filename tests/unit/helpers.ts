import { MockStoryTeller } from '@/lib/ai/mock'
import type { StoryTeller } from '@/lib/ai/types'
import { createRng } from '@/lib/story/random'
import { StoryService, type StoryServiceOptions } from '@/lib/story/service'
import { MemoryStore } from '@/lib/store/memory'

export function makeService(
  options: { teller?: StoryTeller; store?: MemoryStore } & StoryServiceOptions = {},
) {
  const store = options.store ?? new MemoryStore()
  const teller = options.teller ?? new MockStoryTeller()
  let clock = 1_000_000
  const service = new StoryService(store, teller, {
    now: () => clock,
    random: createRng(42),
    sleep: async () => {
      clock += 1000
    },
    ...options,
  })
  return { service, store, teller, advance: (ms: number) => (clock += ms) }
}

/** Resolves when all queued microtasks and timers have run. */
export const flush = () => new Promise((r) => setTimeout(r, 0))
