import type { Fact, PageNode, Story } from './types'
import { createRng, hashString } from './random'

/**
 * Picks `count` unused page numbers between 2 and story.pageCount, the way a
 * gamebook scatters its passages. Seeded by story and parent page, so the same
 * branch gets the same numbers when replayed on an empty store.
 */
export function allocatePageNumbers(
  story: Pick<Story, 'seed' | 'pageCount' | 'firstPage'>,
  parentPage: number,
  used: ReadonlySet<number>,
  count: number,
): number[] {
  const free: number[] = []
  for (let n = 1; n <= story.pageCount; n++) {
    if (n !== story.firstPage && !used.has(n)) free.push(n)
  }
  if (free.length < count) {
    throw new Error(`Story is out of pages: needs ${count}, ${free.length} left`)
  }
  const rng = createRng(story.seed ^ hashString(`page:${parentPage}`))
  const picked: number[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor(rng() * free.length)
    picked.push(free[index])
    free.splice(index, 1)
  }
  return picked
}

/**
 * Whether the page at `depth` must be an ending. Below minDepth never; at
 * maxDepth always; in between, increasingly likely. Deterministic per page.
 */
export function shouldEnd(
  story: Pick<Story, 'seed' | 'minDepth' | 'maxDepth'>,
  pageNumber: number,
  depth: number,
): boolean {
  if (depth >= story.maxDepth) return true
  if (depth < story.minDepth) return false
  const chance = (depth - story.minDepth + 1) / (story.maxDepth - story.minDepth + 1)
  const roll = createRng(story.seed ^ hashString(`end:${pageNumber}`))()
  return roll < chance
}

/** Pages from the first page down to `page`, following parent links. */
export function pathTo(pages: ReadonlyMap<number, PageNode>, page: number): PageNode[] {
  const path: PageNode[] = []
  const seen = new Set<number>()
  let current = pages.get(page)
  while (current) {
    if (seen.has(current.number)) throw new Error(`Cycle in story tree at page ${current.number}`)
    seen.add(current.number)
    path.unshift(current)
    current = current.parent === null ? undefined : pages.get(current.parent)
  }
  return path
}

/** Facts that hold at the end of a path: every fact added along it, minus those retired. */
export function factsAlongPath(path: readonly PageNode[]): Fact[] {
  const facts = new Map<string, Fact>()
  for (const node of path) {
    for (const id of node.factsRetired ?? []) facts.delete(id)
    for (const fact of node.factsAdded ?? []) facts.set(fact.id, fact)
  }
  return [...facts.values()]
}

/** Which way the page turns when moving from one page number to another. */
export function turnDirection(from: number, to: number): 'forward' | 'backward' {
  return to >= from ? 'forward' : 'backward'
}
