import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Illustration } from '../ai/types'
import type { PageNode, Story } from '../story/types'
import type { StoryStore } from './types'

interface StoryRecord {
  story: Story
  pages: Map<number, PageNode>
}

/**
 * Keeps everything in memory. With `dir` set, it also writes each story to
 * `<dir>/stories/<id>.json` and each illustration to `<dir>/illustrations/`,
 * and reloads them on first use. Good for local play and a single server;
 * a multi-instance deploy needs a database-backed StoryStore.
 */
export class MemoryStore implements StoryStore {
  private stories = new Map<string, StoryRecord>()
  private illustrations = new Map<string, Illustration>()
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

  async getIllustration(storyId: string, number: number) {
    await this.load()
    const key = `${storyId}-${number}`
    const cached = this.illustrations.get(key)
    if (cached || !this.dir) return cached ?? null
    try {
      const meta = JSON.parse(await readFile(this.illustrationPath(key, 'json'), 'utf8')) as { mimeType: string }
      const data = new Uint8Array(await readFile(this.illustrationPath(key, 'bin')))
      const illustration = { mimeType: meta.mimeType, data }
      this.illustrations.set(key, illustration)
      return illustration
    } catch {
      return null
    }
  }

  async saveIllustration(storyId: string, number: number, illustration: Illustration) {
    await this.load()
    const key = `${storyId}-${number}`
    this.illustrations.set(key, illustration)
    if (!this.dir) return
    await mkdir(path.join(this.dir, 'illustrations'), { recursive: true })
    await writeFile(this.illustrationPath(key, 'bin'), illustration.data)
    await writeFile(this.illustrationPath(key, 'json'), JSON.stringify({ mimeType: illustration.mimeType }))
  }

  private illustrationPath(key: string, ext: string) {
    return path.join(this.dir!, 'illustrations', `${key}.${ext}`)
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
