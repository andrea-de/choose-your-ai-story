import { beforeAll, describe, expect, it, vi } from 'vitest'

const afterCallbacks: (() => unknown)[] = []
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (cb: () => unknown) => afterCallbacks.push(cb),
}))

process.env.AI_PROVIDER = 'mock'
process.env.STORY_STORE = 'memory'
process.env.MOCK_AI_DELAY_MS = '0'

const stories = await import('@/app/api/stories/route')
const pages = await import('@/app/api/stories/[id]/pages/[page]/route')
const illustration = await import('@/app/api/stories/[id]/pages/[page]/illustration/route')

const ctx = (id: string, page: string) => ({ params: Promise.resolve({ id, page }) }) as never

async function createStory(body: object = {}) {
  const res = await stories.POST(new Request('http://x/api/stories', { method: 'POST', body: JSON.stringify(body) }))
  return { res, json: (await res.json()) as { id: string; firstPage: number; title: string } }
}

describe('POST /api/stories', () => {
  it('creates a story from the reader’s settings', async () => {
    const { res, json } = await createStory({ hero: 'a falconer', tone: 'eerie' })
    expect(res.status).toBe(201)
    expect(json.id).toBeTruthy()
    expect(json.firstPage).toBe(1)
  })

  it('rolls everything when the body is empty or missing', async () => {
    const res = await stories.POST(new Request('http://x/api/stories', { method: 'POST' }))
    expect(res.status).toBe(201)
  })

  it('rejects bad input with 400', async () => {
    const { res } = await createStory({ theme: 'cyberpunk' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/stories', () => {
  it('lists stories', async () => {
    await createStory()
    const res = await stories.GET()
    const json = (await res.json()) as { stories: { id: string }[] }
    expect(res.status).toBe(200)
    expect(json.stories.length).toBeGreaterThan(0)
  })
})

describe('GET /api/stories/:id/pages/:page', () => {
  let id: string
  beforeAll(async () => {
    id = (await createStory()).json.id
  })

  it('writes and returns the page, counts the visit, and schedules prefetching', async () => {
    afterCallbacks.length = 0
    const res = await pages.GET(new Request(`http://x/api/stories/${id}/pages/1`), ctx(id, '1'))
    const json = (await res.json()) as { page: { status: string; visits: number; choices: { explored: boolean }[] } }
    expect(res.status).toBe(200)
    expect(json.page.status).toBe('ready')
    expect(json.page.visits).toBe(1)
    expect(json.page.choices).toHaveLength(2)
    expect(json.page).not.toHaveProperty('factsAdded')
    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]()
  })

  it('does not count a visit with ?visit=0', async () => {
    const res = await pages.GET(new Request(`http://x/api/stories/${id}/pages/1?visit=0`), ctx(id, '1'))
    const json = (await res.json()) as { page: { visits: number } }
    expect(json.page.visits).toBe(1)
  })

  it('returns 400 for a malformed page number', async () => {
    for (const bad of ['0', '-1', 'abc', '1.5', '99999']) {
      const res = await pages.GET(new Request('http://x'), ctx(id, bad))
      expect(res.status).toBe(400)
    }
  })

  it('returns 404 for an unknown story or page', async () => {
    expect((await pages.GET(new Request('http://x'), ctx('missing', '1'))).status).toBe(404)
    expect((await pages.GET(new Request('http://x'), ctx(id, '1234'))).status).toBe(404)
  })
})

describe('GET /api/stories/:id/pages/:page/illustration', () => {
  it('serves the sketch with long-lived caching and safe headers', async () => {
    const { id } = (await createStory()).json
    await pages.GET(new Request('http://x'), ctx(id, '1'))
    const res = await illustration.GET(new Request('http://x'), ctx(id, '1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await res.text()).toContain('<svg')
  })

  it('404s for a page that has not been written', async () => {
    const { id } = (await createStory()).json
    expect((await illustration.GET(new Request('http://x'), ctx(id, '1'))).status).toBe(404)
  })
})
