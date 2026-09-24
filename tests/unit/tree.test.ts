import { describe, expect, it } from 'vitest'
import { createRng, hashString, pick } from '@/lib/story/random'
import { allocatePageNumbers, factsAlongPath, pathTo, shouldEnd, turnDirection } from '@/lib/story/tree'
import type { PageNode } from '@/lib/story/types'

const story = { seed: 1234, pageCount: 400, firstPage: 1, minDepth: 4, maxDepth: 8 }

function node(number: number, parent: number | null, extra: Partial<PageNode> = {}): PageNode {
  return {
    storyId: 's',
    number,
    parent,
    depth: 0,
    choiceText: null,
    status: 'ready',
    visits: 0,
    createdAt: 0,
    ...extra,
  }
}

describe('random', () => {
  it('is reproducible for the same seed', () => {
    const a = createRng(7)
    const b = createRng(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('stays within [0, 1)', () => {
    const rng = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('hashes strings stably and differently', () => {
    expect(hashString('page:1')).toBe(hashString('page:1'))
    expect(hashString('page:1')).not.toBe(hashString('page:2'))
  })

  it('pick() refuses an empty list', () => {
    expect(() => pick([], Math.random)).toThrow()
  })
})

describe('allocatePageNumbers', () => {
  it('never hands out the first page or a used page', () => {
    const used = new Set([1, 2, 3, 50])
    const numbers = allocatePageNumbers(story, 1, used, 3)
    expect(numbers).toHaveLength(3)
    for (const n of numbers) {
      expect(used.has(n)).toBe(false)
      expect(n).toBeGreaterThanOrEqual(2)
      expect(n).toBeLessThanOrEqual(400)
    }
    expect(new Set(numbers).size).toBe(3)
  })

  it('is deterministic per story and parent page', () => {
    const used = new Set([1])
    expect(allocatePageNumbers(story, 5, used, 2)).toEqual(allocatePageNumbers(story, 5, used, 2))
    expect(allocatePageNumbers(story, 5, used, 2)).not.toEqual(allocatePageNumbers(story, 6, used, 2))
  })

  it('scatters pages both before and after the parent, like a gamebook', () => {
    const numbers = new Set<number>()
    for (let parent = 1; parent < 60; parent++) {
      for (const n of allocatePageNumbers(story, parent, new Set([1]), 2)) numbers.add(n)
    }
    expect(Math.min(...numbers)).toBeLessThan(100)
    expect(Math.max(...numbers)).toBeGreaterThan(300)
  })

  it('fills the book exactly and then refuses', () => {
    const tiny = { ...story, pageCount: 5 }
    const used = new Set([1])
    for (const n of allocatePageNumbers(tiny, 1, used, 4)) used.add(n)
    expect([...used].sort()).toEqual([1, 2, 3, 4, 5])
    expect(() => allocatePageNumbers(tiny, 2, used, 1)).toThrow(/out of pages/)
  })
})

describe('shouldEnd', () => {
  it('never ends before minDepth', () => {
    for (let page = 1; page < 200; page++) {
      for (let depth = 0; depth < story.minDepth; depth++) {
        expect(shouldEnd(story, page, depth)).toBe(false)
      }
    }
  })

  it('always ends at maxDepth and beyond', () => {
    for (let page = 1; page < 200; page++) {
      expect(shouldEnd(story, page, story.maxDepth)).toBe(true)
      expect(shouldEnd(story, page, story.maxDepth + 3)).toBe(true)
    }
  })

  it('grows likelier with depth in between', () => {
    const rate = (depth: number) => {
      let ends = 0
      for (let page = 1; page <= 400; page++) if (shouldEnd(story, page, depth)) ends++
      return ends / 400
    }
    expect(rate(4)).toBeLessThan(rate(6))
    expect(rate(6)).toBeLessThan(rate(7))
    expect(rate(4)).toBeGreaterThan(0.05)
  })

  it('gives the same answer for the same page', () => {
    expect(shouldEnd(story, 77, 6)).toBe(shouldEnd(story, 77, 6))
  })
})

describe('pathTo', () => {
  it('walks from the first page down to the target', () => {
    const pages = new Map([
      [1, node(1, null)],
      [40, node(40, 1)],
      [12, node(12, 40)],
      [99, node(99, 1)],
    ])
    expect(pathTo(pages, 12).map((p) => p.number)).toEqual([1, 40, 12])
    expect(pathTo(pages, 1).map((p) => p.number)).toEqual([1])
    expect(pathTo(pages, 1234)).toEqual([])
  })

  it('detects a corrupt cycle instead of looping forever', () => {
    const pages = new Map([
      [2, node(2, 3)],
      [3, node(3, 2)],
    ])
    expect(() => pathTo(pages, 2)).toThrow(/Cycle/)
  })
})

describe('factsAlongPath', () => {
  it('accumulates facts and drops retired ones, in order', () => {
    const path = [
      node(1, null, { factsAdded: [{ id: 'p1.1', text: 'You carry a lantern.' }] }),
      node(40, 1, { factsAdded: [{ id: 'p40.1', text: 'The guard is asleep.' }] }),
      node(12, 40, {
        factsRetired: ['p40.1'],
        factsAdded: [{ id: 'p12.1', text: 'The guard is awake and angry.' }],
      }),
    ]
    expect(factsAlongPath(path).map((f) => f.id)).toEqual(['p1.1', 'p12.1'])
  })

  it('ignores retirements of facts that never existed on this path', () => {
    const path = [node(1, null, { factsAdded: [{ id: 'p1.1', text: 'x' }] }), node(2, 1, { factsRetired: ['p9.9'] })]
    expect(factsAlongPath(path)).toHaveLength(1)
  })

  it('keeps branches separate: a fact on one branch is absent on its sibling', () => {
    const root = node(1, null)
    const left = node(10, 1, { factsAdded: [{ id: 'p10.1', text: 'You took the key.' }] })
    const right = node(20, 1)
    expect(factsAlongPath([root, left])).toHaveLength(1)
    expect(factsAlongPath([root, right])).toHaveLength(0)
  })
})

describe('turnDirection', () => {
  it('turns forward to a later page and backward to an earlier one', () => {
    expect(turnDirection(12, 43)).toBe('forward')
    expect(turnDirection(43, 12)).toBe('backward')
  })
})
