import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { addUsage, type Usage } from '../ai/pricing'
import type { Illustration, Narration } from '../ai/types'
import type { PageNode, Story } from '../story/types'
import type { StoryStore } from './types'

type MediaKind = 'illustrations' | 'narrations'
type Media = Illustration | Narration

interface StoryRecord {
  story: Story
  pages: Map<number, PageNode>
}

/**
 * Keeps everything in memory. With `dir` set, it also writes each story to
 * `<dir>/stories/<id>.json`, each illustration to `<dir>/illustrations/` and each
 * narration to `<dir>/narrations/`,
 * and reloads them on first use. Good for local play and a single server;
 * a multi-instance deploy needs a database-backed StoryStore.
 */
export class MemoryStore implements StoryStore {
  private stories = new Map<string, StoryRecord>()
  private media: Record<MediaKind, Map<string, Media>> = { illustrations: new Map(), narrations: new Map() }
  private loaded: Promise<void> | null = null
  private writes = new Map<string, Promise<void>>()

  constructor(private readonly dir?: string) {}

  async createStory(story: Story, firstPage: PageNode) {
    await this.load()
    if (this.stories.has(story.id)) throw new Error(`Story ${story.id} already exists`)
    this.stories.set(story.id, { story, pages: new Map([[firstPage.number, { ...firstPage }]]) })
    await this.persist(story.id)
  }

  async getStory(id: string) {
    await this.load()
    return this.stories.get(id)?.story ?? null
  }

  async listStories(limit: number) {
    await this.load()
    return [...this.stories.values()]
      .map((r) => r.story)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }

  async getPage(storyId: string, number: number) {
    await this.load()
    const page = this.stories.get(storyId)?.pages.get(number)
    return page ? { ...page } : null
  }

  async getPages(storyId: string) {
    await this.load()
    const pages = this.stories.get(storyId)?.pages ?? new Map<number, PageNode>()
    return new Map([...pages].map(([n, p]) => [n, { ...p }]))
  }

  async claimPage(storyId: string, number: number, now: number, staleBefore: number) {
    await this.load()
    const page = this.stories.get(storyId)?.pages.get(number)
    if (!page) return false
    const claimable =
      page.status === 'pending' ||
      page.status === 'failed' ||
      (page.status === 'generating' && (page.claimedAt ?? 0) < staleBefore)
    if (!claimable) return false
    page.status = 'generating'
    page.claimedAt = now
    delete page.error
    return true
  }

  async completePage(storyId: string, page: PageNode, children: PageNode[]) {
    await this.load()
    const record = this.stories.get(storyId)
    if (!record) throw new Error(`No story ${storyId}`)
    for (const child of children) {
      if (record.pages.has(child.number)) throw new Error(`Page ${child.number} is already taken`)
    }
    const existing = record.pages.get(page.number)
    record.pages.set(page.number, { ...page, visits: existing?.visits ?? page.visits })
    for (const child of children) record.pages.set(child.number, { ...child })
    await this.persist(storyId)
  }

  async failPage(storyId: string, number: number, error: string) {
    await this.load()
    const page = this.stories.get(storyId)?.pages.get(number)
    if (!page) return
    page.status = 'failed'
    page.error = error
    delete page.claimedAt
    await this.persist(storyId)
  }

  async recordVisit(storyId: string, number: number) {
    await this.load()
    const page = this.stories.get(storyId)?.pages.get(number)
    if (!page) return
    page.visits += 1
    await this.persist(storyId)
  }

  async updateStory(storyId: string, patch: Partial<Story>) {
    await this.load()
    const record = this.stories.get(storyId)
    if (!record) return null
    record.story = { ...record.story, ...patch, id: record.story.id }
    await this.persist(storyId)
    return record.story
  }

  async recordUsage(storyId: string, usage: Usage, at = Date.now()) {
    await this.load()
    const record = this.stories.get(storyId)
    if (!record) return
    record.story = { ...record.story, cost: addUsage(record.story.cost, usage, at) }
    await this.persist(storyId)
  }

  getIllustration(storyId: string, number: number) {
    return this.getMedia('illustrations', storyId, number)
  }

  saveIllustration(storyId: string, number: number, illustration: Illustration) {
    return this.saveMedia('illustrations', storyId, number, illustration)
  }

  getNarration(storyId: string, number: number) {
    return this.getMedia('narrations', storyId, number)
  }

  saveNarration(storyId: string, number: number, narration: Narration) {
    return this.saveMedia('narrations', storyId, number, narration)
  }

  private async getMedia(kind: MediaKind, storyId: string, number: number): Promise<Media | null> {
    await this.load()
    const key = `${storyId}-${number}`
    const cached = this.media[kind].get(key)
    if (cached || !this.dir) return cached ?? null
    try {
      const meta = JSON.parse(await readFile(this.mediaPath(kind, key, 'json'), 'utf8')) as { mimeType: string }
      const data = new Uint8Array(await readFile(this.mediaPath(kind, key, 'bin')))
      const media = { mimeType: meta.mimeType, data }
      this.media[kind].set(key, media)
      return media
    } catch {
      return null
    }
  }

  private async saveMedia(kind: MediaKind, storyId: string, number: number, media: Media) {
    await this.load()
    const key = `${storyId}-${number}`
    this.media[kind].set(key, media)
    if (!this.dir) return
    await mkdir(path.join(this.dir, kind), { recursive: true })
    await writeFile(this.mediaPath(kind, key, 'bin'), media.data)
    await writeFile(this.mediaPath(kind, key, 'json'), JSON.stringify({ mimeType: media.mimeType }))
  }

  private mediaPath(kind: MediaKind, key: string, ext: string) {
    return path.join(this.dir!, kind, `${key}.${ext}`)
  }

  private load() {
    if (!this.loaded) this.loaded = this.dir ? this.readAll(this.dir) : Promise.resolve()
    return this.loaded
  }

  private async readAll(dir: string) {
    const storiesDir = path.join(dir, 'stories')
    let files: string[] = []
    try {
      files = await readdir(storiesDir)
    } catch {
      return
    }
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const saved = JSON.parse(await readFile(path.join(storiesDir, file), 'utf8')) as {
        story: Story
        pages: PageNode[]
      }
      // A page mid-generation when the server stopped will never finish.
      const pages = saved.pages.map((p): PageNode => (p.status === 'generating' ? { ...p, status: 'pending' } : p))
      this.stories.set(saved.story.id, { story: saved.story, pages: new Map(pages.map((p) => [p.number, p])) })
    }
  }

  /** Writes are chained per story so an older snapshot never lands after a newer one. */
  private persist(storyId: string) {
    if (!this.dir) return Promise.resolve()
    const dir = this.dir
    const previous = this.writes.get(storyId) ?? Promise.resolve()
    const next = previous.then(async () => {
      const record = this.stories.get(storyId)
      if (!record) return
      const storiesDir = path.join(dir, 'stories')
      await mkdir(storiesDir, { recursive: true })
      const body = JSON.stringify({ story: record.story, pages: [...record.pages.values()] })
      await writeFile(path.join(storiesDir, `${storyId}.json`), body)
    })
    this.writes.set(storyId, next.catch(() => {}))
    return next
  }
}
