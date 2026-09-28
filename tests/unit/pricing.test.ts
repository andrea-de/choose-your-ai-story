import { describe, expect, it } from 'vitest'
import { addUsage, costOf, totalUsd } from '@/lib/ai/pricing'
import type { BibleOptions, PageRequest } from '@/lib/story/prompts'
import type { StoryConfig } from '@/lib/story/types'
import type { Theme } from '@/lib/themes'
import type { PageDraft } from '@/lib/story/schema'
import { MockStoryTeller } from '@/lib/ai/mock'
import type { Meter } from '@/lib/ai/pricing'
import { makeService } from './helpers'

describe('pricing', () => {
  it('prices each kind of call per million tokens, thinking billed as output', () => {
    const sept = Date.UTC(2026, 8, 25)
    expect(costOf({ kind: 'text', model: 'm', inputTokens: 1_000_000, outputTokens: 0 }, sept)).toBeCloseTo(0.75)
    expect(costOf({ kind: 'text', model: 'm', inputTokens: 0, outputTokens: 1_000_000 }, sept)).toBeCloseTo(3.75)
    expect(costOf({ kind: 'speech', model: 'm', inputTokens: 0, outputTokens: 1_000_000 }, sept)).toBeCloseTo(9)
  })

  it('doubles from 1 January 2027, as Google has announced', () => {
    const usage = { kind: 'speech' as const, model: 'm', inputTokens: 100, outputTokens: 2000 }
    expect(costOf(usage, Date.UTC(2027, 0, 1))).toBeCloseTo(2 * costOf(usage, Date.UTC(2026, 11, 31)))
  })

  it('keeps a running total by kind', () => {
    const at = Date.UTC(2026, 8, 25)
    let cost = addUsage(undefined, { kind: 'text', model: 'm', inputTokens: 4000, outputTokens: 1000 }, at)
    cost = addUsage(cost, { kind: 'speech', model: 'm', inputTokens: 200, outputTokens: 1600 }, at)
    cost = addUsage(cost, { kind: 'text', model: 'm', inputTokens: 4000, outputTokens: 1000 }, at)
    expect(cost.text.calls).toBe(2)
    expect(cost.text.inputTokens).toBe(8000)
    expect(cost.speech.calls).toBe(1)
    expect(totalUsd(cost)).toBeCloseTo(2 * (0.003 + 0.00375) + (0.0001 + 0.0144))
  })
})

describe('a story’s running cost', () => {
  /** Reports a fixed usage for every call, like Gemini does. */
  class MeteredTeller extends MockStoryTeller {
    async writeBible(config: StoryConfig, _theme?: Theme, _options?: BibleOptions, meter?: Meter) {
      meter?.({ kind: 'text', model: 'm', inputTokens: 1000, outputTokens: 500 })
      return super.writeBible(config)
    }
    async writePage(req: PageRequest, meter?: Meter): Promise<PageDraft> {
      meter?.({ kind: 'text', model: 'm', inputTokens: 3000, outputTokens: 800 })
      return super.writePage(req)
    }
  }

  it('adds up the plan and every page written, and keeps it with the story', async () => {
    const { service, store } = makeService({ teller: new MeteredTeller() })
    const story = await service.createStory()
    expect(story.cost?.text.calls).toBe(1)
    await service.readPage(story.id, 1)
    await new Promise((r) => setTimeout(r, 0))
    const cost = await service.storyCost(story.id)
    expect(cost.text.calls).toBe(2)
    expect(cost.text.inputTokens).toBe(4000)
    expect((await store.getStory(story.id))?.cost?.text.outputTokens).toBe(1300)
  })

  it('is nothing for a story that has cost nothing', async () => {
    const { service } = makeService()
    const story = await service.createStory()
    expect(totalUsd(await service.storyCost(story.id))).toBe(0)
  })
})
