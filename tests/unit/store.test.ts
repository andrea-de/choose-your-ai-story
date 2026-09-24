import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '@/lib/store/memory'
import type { PageNode, Story } from '@/lib/story/types'

const story: Story = {
  id: 'abc',
  config: { theme: 'historic-fantasy', hero: 'h', setting: 's', tone: 't' },
  bible: { title: 'T', premise: 'P', world: 'W', characters: [{ name: 'n', description: 'd' }], rules: ['r'] },
  seed: 1,
  createdAt: 5,
  firstPage: 1,
  pageCount: 400,
  choicesPerPage: 2,
  minDepth: 4,
  maxDepth: 8,
}

const page = (number: number, extra: Partial<PageNode> = {}): PageNode => ({
  storyId: 'abc',
  number,
  parent: number === 1 ? null : 1,
  depth: number === 1 ? 0 : 1,
  choiceText: null,
  status: 'pending',
  visits: 0,
  createdAt: 5,
  ...extra,
})

let dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
  dirs = []
})

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tales-'))
  dirs.push(dir)
  return dir
}

describe('MemoryStore', () => {
  it('refuses duplicate stories', async () => {
    const store = new MemoryStore()
    await store.createStory(story, page(1))
    await expect(store.createStory(story, page(1))).rejects.toThrow(/already exists/)
  })

  it('claims only pending, failed or stale pages', async () => {
    const store = new MemoryStore()
    await store.createStory(story, page(1))
    expect(await store.claimPage('abc', 1, 100, 0)).toBe(true)
    expect(await store.claimPage('abc', 1, 101, 0)).toBe(false) // fresh claim
    expect(await store.claimPage('abc', 1, 500, 200)).toBe(true) // stale: claimed at 100 < 200
    await store.failPage('abc', 1, 'boom')
    expect((await store.getPage('abc', 1))!.error).toBe('boom')
    expect(await store.claimPage('abc', 1, 600, 0)).toBe(true)
    expect((await store.getPage('abc', 1))!.error).toBeUndefined()
    expect(await store.claimPage('abc', 99, 600, 0)).toBe(false)
  })

  it('never claims a ready page', async () => {
    const store = new MemoryStore()
    await store.createStory(story, page(1))
    await store.completePage('abc', page(1, { status: 'ready', text: 'x' }), [])
    expect(await store.claimPage('abc', 1, 1e12, 1e12)).toBe(false)
  })

  it('refuses to create a child on a page number already in use', async () => {
    const store = new MemoryStore()
    await store.createStory(story, page(1))
    await expect(store.completePage('abc', page(1, { status: 'ready' }), [page(1)])).rejects.toThrow(/already taken/)
  })

  it('keeps visits counted while a page was being written', async () => {
    const store = new MemoryStore()
    await store.createStory(story, page(1))
    await store.recordVisit('abc', 1)
    await store.completePage('abc', page(1, { status: 'ready', visits: 0 }), [])
    expect((await store.getPage('abc', 1))!.visits).toBe(1)
  })

  it('returns copies, so callers cannot mutate stored pages', async () => {
    const store = new MemoryStore()
    await store.createStory(story, page(1))
    const copy = (await store.getPage('abc', 1))!
    copy.status = 'ready'
    expect((await store.getPage('abc', 1))!.status).toBe('pending')
  })

  it('persists stories and illustrations to disk and reloads them', async () => {
    const dir = await tempDir()
    const first = new MemoryStore(dir)
    await first.createStory(story, page(1))
    await first.completePage('abc', page(1, { status: 'ready', text: 'Once' }), [page(7, { choiceText: 'Go' })])
    await first.saveIllustration('abc', 1, { mimeType: 'image/png', data: new Uint8Array([1, 2, 3]) })
    expect(await readdir(path.join(dir, 'stories'))).toEqual(['abc.json'])

    const second = new MemoryStore(dir)
    expect((await second.getStory('abc'))!.bible.title).toBe('T')
    expect((await second.getPage('abc', 1))!.text).toBe('Once')
    expect((await second.getPage('abc', 7))!.choiceText).toBe('Go')
    const img = await second.getIllustration('abc', 1)
    expect(img!.mimeType).toBe('image/png')
    expect([...img!.data]).toEqual([1, 2, 3])
    expect(await second.getIllustration('abc', 2)).toBeNull()
  })

  it('resets pages that were mid-generation when the server stopped', async () => {
    const dir = await tempDir()
    const first = new MemoryStore(dir)
    await first.createStory(story, page(1))
    await first.claimPage('abc', 1, 10, 0)
    await first.recordVisit('abc', 1) // persists the generating state
    const second = new MemoryStore(dir)
    expect((await second.getPage('abc', 1))!.status).toBe('pending')
  })

  it('lists stories newest first, up to the limit', async () => {
    const store = new MemoryStore()
    await store.createStory({ ...story, id: 'a', createdAt: 1 }, { ...page(1), storyId: 'a' })
    await store.createStory({ ...story, id: 'b', createdAt: 3 }, { ...page(1), storyId: 'b' })
    await store.createStory({ ...story, id: 'c', createdAt: 2 }, { ...page(1), storyId: 'c' })
    expect((await store.listStories(2)).map((s) => s.id)).toEqual(['b', 'c'])
  })
})
