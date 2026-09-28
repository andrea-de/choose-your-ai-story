import { describe, expect, it, vi } from 'vitest'
import { MockStoryTeller } from '@/lib/ai/mock'
import type { PageRequest } from '@/lib/story/prompts'
import type { PageDraft } from '@/lib/story/schema'
import { GenerationError, PageNotFoundError, StoryNotFoundError, toPageView, VoiceLockedError } from '@/lib/story/service'
import { MemoryStore } from '@/lib/store/memory'
import { wavToPcm } from '@/lib/ai/wav'
import { concat } from '@/lib/story/recording'
import { seedSuggestion } from '@/lib/voices'
import { flush, makeService } from './helpers'

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
    // No library sketch chosen, so nothing to show in the default mode.
    expect(view.sketchUrl).toBeUndefined()
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

describe('StoryService sketches from the library (default)', () => {
  it('stores the sketch the model picked and points the page at the static file', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect(page.sketch).toBeTruthy()
    const view = await service.viewPage(story.id, page)
    expect(view.sketchUrl).toBe(`/sketches/${page.sketch}.svg`)
    expect(teller.drawCalls).toBe(0)
  })

  it('tells the model which sketch the previous page used', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    const first = await service.readPage(story.id, 1)
    await service.readPage(story.id, first.choices![0].page)
    expect(teller.requests[0].previousSketch).toBeUndefined()
    expect(teller.requests[1].previousSketch).toBe(first.sketch)
  })

  it('ignores a sketch id that is not in the library', async () => {
    const teller = new SpyTeller()
    const orig = teller.writePage.bind(teller)
    teller.writePage = async (req) => ({ ...(await orig(req)), sketch: 'none' })
    const { service } = makeService({ teller })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect(page.sketch).toBeUndefined()
    expect((await service.viewPage(story.id, page)).sketchUrl).toBeUndefined()
  })

  it('never calls the image model', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    await expect(service.getIllustration(story.id, 1)).rejects.toBeInstanceOf(PageNotFoundError)
    expect(teller.drawCalls).toBe(0)
  })
})

describe('StoryService.getIllustration (generate mode)', () => {
  it('points pages at the generated image', async () => {
    const { service } = makeService({ sketches: 'generate' })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect((await service.viewPage(story.id, page)).sketchUrl).toBe(`/api/stories/${story.id}/pages/1/illustration`)
  })

  it('draws once, caches, and shares concurrent requests', async () => {
    const teller = new SpyTeller()
    const { service } = makeService({ teller, sketches: 'generate' })
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    const [a, b] = await Promise.all([service.getIllustration(story.id, 1), service.getIllustration(story.id, 1)])
    await service.getIllustration(story.id, 1)
    expect(teller.drawCalls).toBe(1)
    expect(a.mimeType).toBe('image/svg+xml')
    expect(b.data).toEqual(a.data)
  })

  it('refuses to draw a page that is not written yet', async () => {
    const { service } = makeService({ sketches: 'generate' })
    const story = await service.createStory()
    await expect(service.getIllustration(story.id, 1)).rejects.toBeInstanceOf(PageNotFoundError)
  })
})

describe('StoryService with sketches off', () => {
  it('hides sketches and never calls the image model', async () => {
    const { MockStoryTeller } = await import('@/lib/ai/mock')
    const teller = new MockStoryTeller()
    const draw = vi.spyOn(teller, 'drawIllustration')
    const { service } = makeService({ teller, sketches: 'off' })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect((await service.viewPage(story.id, page)).sketchUrl).toBeUndefined()
    await expect(service.getIllustration(story.id, 1)).rejects.toBeInstanceOf(PageNotFoundError)
    expect(draw).not.toHaveBeenCalled()
  })
})

describe('StoryService narration', () => {
  class CountingTeller extends MockStoryTeller {
    narrations: Parameters<MockStoryTeller['narrate']>[0][] = []
    narrate(request: Parameters<MockStoryTeller['narrate']>[0]) {
      this.narrations.push(request)
      return super.narrate(request)
    }
  }

  async function readAll(stream: ReadableStream<Uint8Array>) {
    const chunks: Uint8Array[] = []
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    return concat(chunks)
  }

  it('streams a page the first time, with its tone and mood, then serves the stored recording', async () => {
    const teller = new CountingTeller()
    const { service, store } = makeService({ teller, narration: true })
    const story = await service.createStory({ theme: 'noir', tone: 'wry' })
    const page = await service.readPage(story.id, 1)
    expect((await service.viewPage(story.id, page)).narrationUrl).toBe(`/api/stories/${story.id}/pages/1/narration`)

    const live = await service.listen(story.id, 1)
    expect(live.durationMs).toBeUndefined()
    expect(live.sampleRate).toBe(24000)
    const first = await readAll(live.audio)
    expect(first.length).toBeGreaterThan(24000)
    expect(teller.narrations).toHaveLength(1)
    expect(teller.narrations[0]).toMatchObject({ theme: 'noir', tone: 'wry', mood: page.mood, text: page.text })
    expect(teller.narrations[0].narrator).toEqual({ kind: 'suggested', suggestion: seedSuggestion('noir') })

    await flush()
    const stored = await store.getNarration(story.id, 1)
    expect(stored!.mimeType).toBe('audio/wav')
    const again = await service.listen(story.id, 1)
    expect(again.durationMs).toBeCloseTo((first.length / 2 / 24000) * 1000)
    expect(Buffer.compare(Buffer.from(await readAll(again.audio)), Buffer.from(first))).toBe(0)
    expect(teller.narrations).toHaveLength(1)
  })

  it('shares one recording among listeners who arrive while it is being spoken', async () => {
    const teller = new CountingTeller()
    const { service } = makeService({ teller, narration: true })
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    const [a, b] = await Promise.all([service.listen(story.id, 1), service.listen(story.id, 1)])
    const late = await service.listen(story.id, 1)
    const [x, y, z] = await Promise.all([readAll(a.audio), readAll(b.audio), readAll(late.audio)])
    expect(teller.narrations).toHaveLength(1)
    expect(Buffer.compare(Buffer.from(x), Buffer.from(y))).toBe(0)
    expect(Buffer.compare(Buffer.from(x), Buffer.from(z))).toBe(0)
  })

  it('hands back the whole narration as a WAV file', async () => {
    const { service } = makeService({ narration: true })
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    const wav = await service.getNarration(story.id, 1)
    expect(Buffer.from(wav.data.subarray(0, 4)).toString()).toBe('RIFF')
    expect(wavToPcm(wav.data).sampleRate).toBe(24000)
  })

  it('keeps each page’s mood', async () => {
    const { service } = makeService({ narration: true })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect(page.mood).toBeTruthy()
  })

  it('offers nothing when narration is off', async () => {
    const teller = new CountingTeller()
    const { service } = makeService({ teller })
    const story = await service.createStory()
    const page = await service.readPage(story.id, 1)
    expect((await service.viewPage(story.id, page)).narrationUrl).toBeUndefined()
    await expect(service.listen(story.id, 1)).rejects.toBeInstanceOf(PageNotFoundError)
    expect(teller.narrations).toHaveLength(0)
  })

  it('refuses to narrate a page that is not written yet', async () => {
    const { service } = makeService({ narration: true })
    const story = await service.createStory()
    await expect(service.listen(story.id, 1)).rejects.toBeInstanceOf(PageNotFoundError)
  })

  it('never records ahead: only pages someone listens to cost anything', async () => {
    const teller = new CountingTeller()
    const { service } = makeService({ teller, narration: true })
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    await service.prefetchChoices(story.id, 1)
    expect(teller.narrations).toHaveLength(0)
  })

  it('ends a failed recording with an error, stores nothing, and lets the next listener try again', async () => {
    const teller = new CountingTeller()
    let fail = true
    const narrate = teller.narrate.bind(teller)
    teller.narrate = (request) =>
      fail
        ? (async function* () {
            yield new Uint8Array([1, 2])
            throw new Error('quota')
          })()
        : narrate(request)
    const { service, store } = makeService({ teller, narration: true })
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    const broken = await service.listen(story.id, 1)
    await expect(readAll(broken.audio)).rejects.toBeInstanceOf(GenerationError)
    await flush()
    expect(await store.getNarration(story.id, 1)).toBeNull()
    fail = false
    expect((await readAll((await service.listen(story.id, 1)).audio)).length).toBeGreaterThan(2)
  })
})

describe('StoryService.storyMap', () => {
  it('lists every page’s place in the tree, written or waiting, with no text', async () => {
    const { service } = makeService()
    const story = await service.createStory()
    await service.readPage(story.id, 1)
    const map = await service.storyMap(story.id)
    expect(map[0]).toEqual({ number: 1, parent: null, written: true, isEnding: false })
    expect(map.filter((n) => n.parent === 1)).toHaveLength(story.choicesPerPage)
    expect(map.every((n) => !('text' in n))).toBe(true)
    await expect(service.storyMap('nope')).rejects.toBeInstanceOf(StoryNotFoundError)
  })
})

describe('StoryService: the tale’s voice', () => {
  async function readAll(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader()
    let n = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return n
      n += value.length
    }
  }

  it('starts with the book’s own narrator, suggested and chosen, and open to change', async () => {
    const { service } = makeService({ narration: true })
    const story = await service.createStory({ theme: 'future' })
    const voice = await service.voiceState(story.id)
    expect(voice).toEqual({ chosen: 'suggested', suggestion: seedSuggestion('future'), locked: false })
    expect(voice.suggestion.treatment).toBe('robot')
  })

  it('offers new ideas, each different from the last, and lets the reader choose', async () => {
    const { service } = makeService({ narration: true })
    const story = await service.createStory({ theme: 'pirate' })
    const ideas = []
    for (let i = 0; i < 4; i++) ideas.push((await service.suggestVoice(story.id)).suggestion)
    // A person the model casts, then one of the book's treated voices, and round again.
    expect(ideas.map((i) => i.treatment)).toEqual(['none', 'dream', 'none', 'temple'])
    expect(ideas[1].label).toBe('Drowned sailor')
    expect(ideas[3].label).toBe('Ghost captain')
    expect(new Set(ideas.map((i) => i.label)).size).toBe(4)
    expect((await service.chooseVoice(story.id, 'standard')).chosen).toBe('standard')
  })

  it('reads the summary aloud to try a voice, once; hearing it again is free', async () => {
    const teller = new MockStoryTeller()
    const spoken: string[] = []
    const narrate = teller.narrate.bind(teller)
    teller.narrate = (request) => {
      spoken.push(request.text)
      return narrate(request)
    }
    const { service } = makeService({ teller, narration: true })
    const story = await service.createStory({ theme: 'future' })
    const preview = await service.previewVoice(story.id, 'suggested')
    expect(preview.treatment).toBe('robot')
    expect(await readAll(preview.audio)).toBeGreaterThan(0)
    const again = await service.previewVoice(story.id, 'suggested')
    expect(again.durationMs).toBeGreaterThan(0)
    await readAll(again.audio)
    expect((await service.previewVoice(story.id, 'standard')).treatment).toBe('none')
    expect(spoken.filter((t) => t === story.bible.premise)).toHaveLength(2)
  })

  it('fixes the voice when the reader begins the tale, whatever was chosen', async () => {
    const { service } = makeService({ narration: true })
    const story = await service.createStory({ theme: 'pirate' })
    await service.chooseVoice(story.id, 'standard')
    expect(await service.confirmVoice(story.id)).toMatchObject({ chosen: 'standard', locked: true })
    expect(await service.confirmVoice(story.id)).toMatchObject({ chosen: 'standard', locked: true })
    await expect(service.chooseVoice(story.id, 'suggested')).rejects.toBeInstanceOf(VoiceLockedError)
  })

  it('fixes the voice once a page is read aloud, so the tale sounds alike throughout', async () => {
    const { service } = makeService({ narration: true })
    const story = await service.createStory({ theme: 'noir' })
    await service.readPage(story.id, 1)
    await readAll((await service.listen(story.id, 1)).audio)
    expect((await service.voiceState(story.id)).locked).toBe(true)
    await expect(service.suggestVoice(story.id)).rejects.toBeInstanceOf(VoiceLockedError)
    await expect(service.chooseVoice(story.id, 'standard')).rejects.toBeInstanceOf(VoiceLockedError)
  })

  it('keeps the voice older tales had, and fixed', async () => {
    const { service, store } = makeService({ narration: true })
    const story = await service.createStory({ theme: 'pirate' })
    await store.updateStory(story.id, { voice: undefined, config: { ...story.config, narrator: 'plain' } })
    expect(await service.voiceState(story.id)).toMatchObject({ chosen: 'standard', locked: true })
  })
})
