import { describe, expect, it, vi } from 'vitest'
import { MockStoryTeller } from '@/lib/ai/mock'
import type { PageRequest } from '@/lib/story/prompts'
import type { PageDraft } from '@/lib/story/schema'
import { GenerationError, PageNotFoundError, StoryNotFoundError, toPageView } from '@/lib/story/service'
import { MemoryStore } from '@/lib/store/memory'
import { makeService } from './helpers'

/** A mock teller that records every page request and can be told to misbehave. */
class SpyTeller extends MockStoryTeller {
  requests: PageRequest[] = []
  failNext = 0
  shortNext = 0
  gate: Promise<void> | null = null
  drawCalls = 0

  async writePage(req: PageRequest): Promise<PageDraft> {
    this.requests.push(req)
    if (this.gate) await this.gate
    if (this.failNext > 0) {
      this.failNext--
      throw new Error('model unavailable')
    }
    const draft = await super.writePage(req)
    if (this.shortNext > 0) {
      this.shortNext--
      return { ...draft, choices: draft.choices.slice(0, 1) }
    }
    return draft
  }

  async drawIllustration(subject: string, theme: Parameters<MockStoryTeller['drawIllustration']>[1]) {
    this.drawCalls++
    return super.drawIllustration(subject, theme)
  }
}

describe('StoryService.createStory', () => {
  it('rolls any blank settings and stores a pending first page', async () => {
    const { service, store } = makeService()
    const story = await service.createStory({ hero: 'a falconer' })
    expect(story.config.hero).toBe('a falconer')
    expect(story.config.setting).toBeTruthy()
    expect(story.config.tone).toBeTruthy()
    expect(story.bible.title).toMatch(/^The /)
    expect(story.firstPage).toBe(1)
    expect(story.id).toMatch(/^[a-z0-9]{10}$/)
    const first = await store.getPage(story.id, 1)
    expect(first).toMatchObject({ status: 'pending', depth: 0, parent: null })
  })

  it('rollConfig keeps what the reader chose', () => {
    const { service } = makeService()
    expect(service.rollConfig({ hero: 'h', setting: 's', tone: 't' })).toEqual({
      theme: 'historic-fantasy',
      hero: 'h',
      setting: 's',
      tone: 't',
    })
  })
})

describe('StoryService.readPage', () => {
  it('writes the first page with two choices on fresh page numbers', async () => {
    const { service, store } = makeService()
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect(page.status).toBe('ready')
    expect(page.text).toBeTruthy()
    expect(page.choices).toHaveLength(2)
    const [a, b] = page.choices!
    expect(a.page).not.toBe(b.page)
    for (const c of page.choices!) {
      const child = await store.getPage(story.id, c.page)
      expect(child).toMatchObject({ status: 'pending', parent: 1, depth: 1, choiceText: c.text })
    }
  })

  it('does not call the model again for a page already written', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    await service.readPage(story.id, 1)
    expect(teller.requests).toHaveLength(1)
  })

  it('writes a page only once when many readers arrive together', async () => {
    const teller = new SpyTeller()
    let open!: () => void
    teller.gate = new Promise((r) => (open = r))
    const { service } = makeService({ teller })
    const story = await service.createStory()
    const reads = Array.from({ length: 5 }, () => service.readPage(story.id, 1))
    open()
    const pages = await Promise.all(reads)
    expect(teller.requests).toHaveLength(1)
    expect(new Set(pages.map((p) => p.text)).size).toBe(1)
  })

  it('waits for another server that has claimed the page, then returns its work', async () => {
    const store = new MemoryStore()
    const teller = new SpyTeller()
    const a = makeService({ store, teller })
    const story = await a.service.createStory()
    // Server A claims the page but has not finished.
    let open!: () => void
    teller.gate = new Promise((r) => (open = r))
    const readA = a.service.readPage(story.id, 1)
    await new Promise((r) => setTimeout(r, 0))
    // Server B polls; let A finish during B's first sleep.
    const bSleep = vi.fn(async () => open())
    const other = new SpyTeller()
    const waiting = makeService({ store, teller: other, sleep: bSleep })
    const [pageA, pageB] = await Promise.all([readA, waiting.service.readPage(story.id, 1)])
    expect(bSleep).toHaveBeenCalled()
    expect(pageB.text).toBe(pageA.text)
    expect(teller.requests).toHaveLength(1)
    expect(other.requests).toHaveLength(0)
  })

  it('retakes a claim that was abandoned long ago', async () => {
    const store = new MemoryStore()
    const teller = new SpyTeller()
    const { service } = makeService({ store, teller, staleAfterMs: 5_000 })
    const story = await service.createStory()
    // Someone claimed page 1 at time 0 and died.
    await store.claimPage(story.id, 1, 0, -1)
    const page = await service.readPage(story.id, 1)
    expect(page.status).toBe('ready')
    expect(teller.requests).toHaveLength(1)
  })

  it('gives up waiting after the timeout', async () => {
    const store = new MemoryStore()
    const { service } = makeService({ store, waitTimeoutMs: 3_000, staleAfterMs: 1e12 })
    const story = await service.createStory()
    await store.claimPage(story.id, 1, 1_000_000, 0)
    await expect(service.readPage(story.id, 1)).rejects.toBeInstanceOf(GenerationError)
  })

  it('marks the page failed when the model fails twice, and succeeds on a later try', async () => {
    const teller = new SpyTeller()
    teller.failNext = 2
    const { service, store } = makeService({ teller })
    const story = await service.createStory()
    await expect(service.readPage(story.id, 1)).rejects.toBeInstanceOf(GenerationError)
    expect((await store.getPage(story.id, 1))?.status).toBe('failed')
    const page = await service.readPage(story.id, 1)
    expect(page.status).toBe('ready')
  })

  it('retries once when the model returns too few choices', async () => {
    const teller = new SpyTeller()
    teller.shortNext = 1
    const { service } = makeService({ teller })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect(page.choices).toHaveLength(2)
    expect(teller.requests).toHaveLength(2)
  })

  it('passes the path and the branch’s facts to the model, with fact ids', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    const first = await service.readPage(story.id, 1)
    const next = first.choices![0]
    await service.readPage(story.id, next.page)
    const req = teller.requests[1]
    expect(req.choiceText).toBe(next.text)
    expect(req.path.map((p) => p.text)).toEqual([first.text])
    expect(req.facts.map((f) => f.id)).toEqual(first.factsAdded!.map((f) => f.id))
    expect(req.facts[0].id).toBe('p1.1')
    expect(req.depth).toBe(1)
  })

  it('drops retirements of fact ids the model invented', async () => {
    const teller = new SpyTeller()
    const orig = teller.writePage.bind(teller)
    teller.writePage = async (req) => ({ ...(await orig(req)), retiredFactIds: ['p999.9'] })
    const { service } = makeService({ teller })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect(page.factsRetired).toEqual([])
  })

  it('ends every path by maxDepth, with an ending title and no choices', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    let page = await service.readPage(story.id, 1)
    let steps = 0
    while (!page.isEnding) {
      page = await service.readPage(story.id, page.choices![steps % 2].page)
      steps++
      expect(steps).toBeLessThanOrEqual(story.maxDepth)
    }
    expect(page.depth).toBeGreaterThanOrEqual(story.minDepth)
    expect(page.choices).toEqual([])
    expect(page.endingTitle).toBeTruthy()
    expect(teller.requests.at(-1)!.mustEnd).toBe(true)
  })

  it('counts visits only when asked', async () => {
    const { service, store } = makeService()
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    const visited = await service.readPage(story.id, 1, { countVisit: true })
    expect(visited.visits).toBe(1)
    expect((await store.getPage(story.id, 1))!.visits).toBe(1)
  })

  it('throws not-found for unknown stories and pages', async () => {
    const { service } = makeService()
    await expect(service.readPage('nope', 1)).rejects.toBeInstanceOf(StoryNotFoundError)
    const story = await service.createStory()
    await expect(service.readPage(story.id, 999)).rejects.toBeInstanceOf(PageNotFoundError)
  })
})

describe('StoryService.prefetchChoices', () => {
  it('writes the pages behind every choice', async () => {
    const { service, store } = makeService()
    const story = await service.createStory()
    const first = await service.readPage(story.id, 1)
    await service.prefetchChoices(story.id, 1)
    for (const c of first.choices!) expect((await store.getPage(story.id, c.page))!.status).toBe('ready')
  })

  it('does nothing for a page not yet written, and swallows failures', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    await service.prefetchChoices(story.id, 1)
    expect(teller.requests).toHaveLength(0)
    await service.readPage(story.id, 1)
    teller.failNext = 10
    await expect(service.prefetchChoices(story.id, 1)).resolves.toBeUndefined()
  })
})

describe('StoryService views and listings', () => {
  it('marks a choice explored once someone has visited it', async () => {
    const { service } = makeService()
    const story = await service.createStory()
    const first = await service.readPage(story.id, 1)
    const before = await service.viewPage(story.id, first)
    expect(before.choices!.every((c) => !c.explored)).toBe(true)
    await service.readPage(story.id, first.choices![1].page, { countVisit: true })
    const after = await service.viewPage(story.id, first)
    expect(after.choices!.map((c) => c.explored)).toEqual([false, true])
  })

  it('hides private fields from the reader view', () => {
    const view = toPageView({
      storyId: 's',
      number: 3,
      parent: 1,
      depth: 1,
      choiceText: 'x',
      status: 'ready',
      text: 't',
      factsAdded: [{ id: 'p3.1', text: 'secret' }],
      illustrationPrompt: 'a key',
      visits: 2,
      createdAt: 0,
    })
    expect(view).not.toHaveProperty('factsAdded')
    expect(view).not.toHaveProperty('illustrationPrompt')
    expect(view.hasIllustration).toBe(true)
  })

  it('lists stories newest first with pages and endings counted', async () => {
    const { service, advance } = makeService()
    const older = await service.createStory()
    advance(10)
    const newer = await service.createStory()
    await service.readPage(newer.id, 1)
    const list = await service.listStories()
    expect(list.map((s) => s.id)).toEqual([newer.id, older.id])
    expect(list[0]).toMatchObject({ pagesWritten: 1, endingsFound: 0, title: newer.bible.title })
  })
})

describe('StoryService.getIllustration', () => {
  it('draws once, caches, and shares concurrent requests', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    const [a, b] = await Promise.all([service.getIllustration(story.id, 1), service.getIllustration(story.id, 1)])
    await service.getIllustration(story.id, 1)
    expect(teller.drawCalls).toBe(1)
    expect(a.mimeType).toBe('image/svg+xml')
    expect(b.data).toEqual(a.data)
  })

  it('refuses to draw a page that is not written yet', async () => {
    const { service } = makeService()
    const story = await service.createStory()
    await expect(service.getIllustration(story.id, 1)).rejects.toBeInstanceOf(PageNotFoundError)
  })
})

describe('StoryService with sketches off', () => {
  it('hides sketches and never calls the image model', async () => {
    const { MockStoryTeller } = await import('@/lib/ai/mock')
    const teller = new MockStoryTeller()
    const draw = vi.spyOn(teller, 'drawIllustration')
    const { service } = makeService({ teller, sketches: false })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect((await service.viewPage(story.id, page)).hasIllustration).toBe(false)
    await expect(service.getIllustration(story.id, 1)).rejects.toBeInstanceOf(PageNotFoundError)
    expect(draw).not.toHaveBeenCalled()
  })
})
