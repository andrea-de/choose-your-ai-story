import type { Illustration, StoryTeller } from '../ai/types'
import type { StoryStore } from '../store/types'
import { getTheme } from '../themes'
import type { PageDraft, NewStoryRequest } from './schema'
import { pick } from './random'
import { allocatePageNumbers, factsAlongPath, pathTo, shouldEnd } from './tree'
import type { PageNode, PageView, Story, StoryConfig, StorySummary } from './types'

export class StoryNotFoundError extends Error {}
export class PageNotFoundError extends Error {}
export class GenerationError extends Error {}

export interface StoryServiceOptions {
  now?: () => number
  random?: () => number
  sleep?: (ms: number) => Promise<void>
  /** A claim older than this is treated as abandoned and may be retaken. */
  staleAfterMs?: number
  /** How long to wait for another request that is writing the same page. */
  waitTimeoutMs?: number
  pollMs?: number
  /** Draw a sketch for each page. Off saves the image-model cost (and suits keys without billing). */
  sketches?: boolean
}

const DEFAULTS = {
  pageCount: 400,
  choicesPerPage: 2,
  minDepth: 4,
  maxDepth: 8,
}

export class StoryService {
  private readonly now: () => number
  private readonly random: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly staleAfterMs: number
  private readonly waitTimeoutMs: number
  private readonly pollMs: number
  private readonly sketches: boolean
  /** In-process single flight: one generation per page per server. */
  private readonly inflight = new Map<string, Promise<PageNode>>()
  private readonly drawing = new Map<string, Promise<Illustration>>()

  constructor(
    private readonly store: StoryStore,
    private readonly teller: StoryTeller,
    options: StoryServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.staleAfterMs = options.staleAfterMs ?? 120_000
    this.waitTimeoutMs = options.waitTimeoutMs ?? 90_000
    this.pollMs = options.pollMs ?? 400
    this.sketches = options.sketches ?? true
  }

  get tellerName() {
    return this.teller.name
  }

  /** Fills in anything the reader left blank, like rolling the dice. */
  rollConfig(request: NewStoryRequest = {}): StoryConfig {
    const theme = getTheme(request.theme ?? 'historic-fantasy')
    return {
      theme: theme.id,
      hero: request.hero || pick(theme.heroes, this.random),
      setting: request.setting || pick(theme.settings, this.random),
      tone: request.tone || pick(theme.tones, this.random),
    }
  }

  async createStory(request: NewStoryRequest = {}): Promise<Story> {
    const config = this.rollConfig(request)
    const bible = await this.teller.writeBible(config, getTheme(config.theme))
    const createdAt = this.now()
    const story: Story = {
      id: makeId(this.random),
      config,
      bible,
      seed: Math.floor(this.random() * 2 ** 32),
      createdAt,
      firstPage: 1,
      ...DEFAULTS,
    }
    await this.store.createStory(story, {
      storyId: story.id,
      number: story.firstPage,
      parent: null,
      depth: 0,
      choiceText: null,
      status: 'pending',
      visits: 0,
      createdAt,
    })
    return story
  }

  async getStory(id: string): Promise<Story> {
    const story = await this.store.getStory(id)
    if (!story) throw new StoryNotFoundError(`No story ${id}`)
    return story
  }

  async listStories(limit = 20): Promise<StorySummary[]> {
    const stories = await this.store.listStories(limit)
    return Promise.all(
      stories.map(async (story) => {
        const pages = [...(await this.store.getPages(story.id)).values()]
        return {
          id: story.id,
          title: story.bible.title,
          premise: story.bible.premise,
          theme: story.config.theme,
          pagesWritten: pages.filter((p) => p.status === 'ready').length,
          endingsFound: pages.filter((p) => p.isEnding).length,
          createdAt: story.createdAt,
        }
      }),
    )
  }

  /** Returns the page if already written, without generating it. */
  async peekPage(storyId: string, number: number): Promise<PageNode> {
    const page = await this.store.getPage(storyId, number)
    if (!page) {
      await this.getStory(storyId)
      throw new PageNotFoundError(`Story ${storyId} has no page ${number}`)
    }
    return page
  }

  /** Returns the page, writing it first if nobody has yet. */
  async readPage(storyId: string, number: number, { countVisit = false } = {}): Promise<PageNode> {
    const page = await this.peekPage(storyId, number)
    const ready = page.status === 'ready' ? page : await this.ensureWritten(storyId, number)
    if (countVisit) {
      await this.store.recordVisit(storyId, number)
      ready.visits += 1
    }
    return ready
  }

  /** Writes the pages behind each choice so they are ready when the reader turns. */
  async prefetchChoices(storyId: string, number: number): Promise<void> {
    const page = await this.store.getPage(storyId, number)
    if (page?.status !== 'ready' || !page.choices) return
    await Promise.all(
      page.choices.map((c) =>
        this.ensureWritten(storyId, c.page).catch(() => {
          // A failed prefetch is retried when the reader actually turns there.
        }),
      ),
    )
  }

  ensureWritten(storyId: string, number: number): Promise<PageNode> {
    const key = `${storyId}:${number}`
    let flight = this.inflight.get(key)
    if (!flight) {
      flight = this.writeOrWait(storyId, number).finally(() => this.inflight.delete(key))
      this.inflight.set(key, flight)
    }
    return flight
  }

  private async writeOrWait(storyId: string, number: number): Promise<PageNode> {
    const deadline = this.now() + this.waitTimeoutMs
    for (;;) {
      const page = await this.peekPage(storyId, number)
      if (page.status === 'ready') return page
      const now = this.now()
      if (await this.store.claimPage(storyId, number, now, now - this.staleAfterMs)) {
        return this.write(storyId, number)
      }
      // Another server is writing it; wait for them.
      if (now > deadline) throw new GenerationError(`Timed out waiting for page ${number}`)
      await this.sleep(this.pollMs)
    }
  }

  private async write(storyId: string, number: number): Promise<PageNode> {
    try {
      const story = await this.getStory(storyId)
      const pages = await this.store.getPages(storyId)
      const path = pathTo(pages, number)
      const page = path[path.length - 1]
      const earlier = path.slice(0, -1)
      const facts = factsAlongPath(earlier)
      const mustEnd = shouldEnd(story, number, page.depth)
      const theme = getTheme(story.config.theme)

      const request = {
        bible: story.bible,
        theme,
        config: story.config,
        path: earlier.map((p) => ({ text: p.text ?? '', choiceText: p.choiceText })),
        facts,
        choiceText: page.choiceText,
        mustEnd,
        choicesCount: story.choicesPerPage,
        depth: page.depth,
        maxDepth: story.maxDepth,
      }
      const draft = await this.draftWithRetry(() => this.teller.writePage(request), mustEnd, story.choicesPerPage)

      const used = new Set(pages.keys())
      const numbers = mustEnd ? [] : allocatePageNumbers(story, number, used, story.choicesPerPage)
      const choiceTexts = draft.choices.slice(0, story.choicesPerPage)
      const knownFacts = new Set(facts.map((f) => f.id))
      const now = this.now()

      const written: PageNode = {
        ...page,
        status: 'ready',
        claimedAt: undefined,
        error: undefined,
        text: tidy(draft.text),
        choices: mustEnd ? [] : choiceTexts.map((text, i) => ({ text: tidyLine(text), page: numbers[i] })),
        factsAdded: draft.newFacts.map((text, i) => ({ id: `p${number}.${i + 1}`, text: tidyLine(text) })),
        factsRetired: draft.retiredFactIds.filter((id) => knownFacts.has(id)),
        isEnding: mustEnd,
        endingTitle: mustEnd ? tidyLine(draft.endingTitle) || 'The End' : undefined,
        illustrationPrompt: draft.illustrationPrompt,
      }
      const children: PageNode[] = (written.choices ?? []).map((choice) => ({
        storyId,
        number: choice.page,
        parent: number,
        depth: page.depth + 1,
        choiceText: choice.text,
        status: 'pending',
        visits: 0,
        createdAt: now,
      }))
      await this.store.completePage(storyId, written, children)
      return written
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.store.failPage(storyId, number, message)
      throw new GenerationError(`Could not write page ${number}: ${message}`)
    }
  }

  /** Models occasionally return too few choices; ask once more before giving up. */
  private async draftWithRetry(write: () => Promise<PageDraft>, mustEnd: boolean, choices: number) {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const draft = await write()
        if (!mustEnd && draft.choices.length < choices) {
          throw new Error(`expected ${choices} choices, got ${draft.choices.length}`)
        }
        return draft
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }

  /** A page as the reader sees it, including which choices others have taken. */
  async viewPage(storyId: string, page: PageNode): Promise<PageView> {
    const view = toPageView(page, await this.store.getPages(storyId))
    return this.sketches ? view : { ...view, hasIllustration: false }
  }

  async getIllustration(storyId: string, number: number): Promise<Illustration> {
    if (!this.sketches) throw new PageNotFoundError('Sketches are turned off')
    const cached = await this.store.getIllustration(storyId, number)
    if (cached) return cached
    const key = `${storyId}:${number}`
    let flight = this.drawing.get(key)
    if (!flight) {
      flight = this.draw(storyId, number).finally(() => this.drawing.delete(key))
      this.drawing.set(key, flight)
    }
    return flight
  }

  private async draw(storyId: string, number: number): Promise<Illustration> {
    const story = await this.getStory(storyId)
    const page = await this.peekPage(storyId, number)
    if (page.status !== 'ready' || !page.illustrationPrompt) {
      throw new PageNotFoundError(`Page ${number} has no illustration yet`)
    }
    const illustration = await this.teller.drawIllustration(page.illustrationPrompt, getTheme(story.config.theme))
    await this.store.saveIllustration(storyId, number, illustration)
    return illustration
  }
}

export function toPageView(page: PageNode, pages: ReadonlyMap<number, PageNode> = new Map()): PageView {
  return {
    storyId: page.storyId,
    number: page.number,
    parent: page.parent,
    depth: page.depth,
    status: page.status,
    text: page.text,
    choices: page.choices?.map((c) => ({ ...c, explored: (pages.get(c.page)?.visits ?? 0) > 0 })),
    isEnding: page.isEnding,
    endingTitle: page.endingTitle,
    hasIllustration: Boolean(page.illustrationPrompt),
    visits: page.visits,
  }
}

function makeId(random: () => number): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let id = ''
  for (let i = 0; i < 10; i++) id += alphabet[Math.floor(random() * alphabet.length)]
  return id
}

function tidy(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

function tidyLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
