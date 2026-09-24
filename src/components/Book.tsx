'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { turnDirection } from '@/lib/story/tree'
import type { PageView } from '@/lib/story/types'
import { PageLeaf, type LeafState } from './PageLeaf'
import { markPageRead, useReadPages } from './readPages'

interface BookProps {
  storyId: string
  storyTitle: string
  initialNumber: number
  initialPage: PageView | null
}

interface Turn {
  from: number
  to: number
  direction: 'forward' | 'backward'
}

const TURN_MS = 760

/** Fetches a page; the server writes it first if nobody has turned to it yet. */
async function fetchPage(storyId: string, number: number): Promise<LeafState> {
  try {
    const res = await fetch(`/api/stories/${storyId}/pages/${number}`)
    const body = (await res.json()) as { page?: PageView; error?: string }
    if (!res.ok || !body.page) return { kind: 'error', message: body.error ?? 'The page could not be found.' }
    return { kind: 'ready', page: body.page }
  } catch {
    return { kind: 'error', message: 'The page could not be reached. Check your connection.' }
  }
}

function pageFromPath(storyId: string): number | null {
  const match = window.location.pathname.match(new RegExp(`^/s/${storyId}/(\\d+)$`))
  return match ? Number(match[1]) : null
}

/** A book whose pages turn forward or back depending on where the choice leads. */
export function Book({ storyId, storyTitle, initialNumber, initialPage }: BookProps) {
  const [current, setCurrent] = useState(initialNumber)
  const [turn, setTurn] = useState<Turn | null>(null)
  const [leaves, setLeaves] = useState<Record<number, LeafState>>(() =>
    initialPage?.status === 'ready' ? { [initialNumber]: { kind: 'ready', page: initialPage } } : {},
  )
  const read = useReadPages(storyId)
  const currentRef = useRef(current)
  const turnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const settle = useCallback((number: number, state: LeafState) => {
    // Never replace a page already shown with an error from a later retry.
    setLeaves((prev) => (state.kind === 'error' && prev[number]?.kind === 'ready' ? prev : { ...prev, [number]: state }))
  }, [])

  const load = useCallback(
    (number: number) => fetchPage(storyId, number).then((state) => settle(number, state)),
    [settle, storyId],
  )

  const goTo = useCallback(
    (to: number, { push = true } = {}) => {
      const from = currentRef.current
      if (to === from) return
      currentRef.current = to
      clearTimeout(turnTimer.current)
      setTurn({ from, to, direction: turnDirection(from, to) })
      setCurrent(to)
      turnTimer.current = setTimeout(() => setTurn(null), TURN_MS)
      if (push) window.history.pushState(null, '', `/s/${storyId}/${to}`)
      setLeaves((prev) => (prev[to]?.kind === 'ready' ? prev : { ...prev, [to]: { kind: 'loading' } }))
      void load(to)
    },
    [load, storyId],
  )

  // Count the visit (and start writing the next pages) for the page we opened on.
  useEffect(() => {
    fetchPage(storyId, initialNumber).then((state) => settle(initialNumber, state))
  }, [initialNumber, settle, storyId])

  useEffect(() => {
    const onPop = () => {
      const n = pageFromPath(storyId)
      if (n !== null) goTo(n, { push: false })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [goTo, storyId])

  useEffect(() => () => clearTimeout(turnTimer.current), [])

  const markRead = useCallback((n: number) => markPageRead(storyId, n), [storyId])

  const retry = (n: number) => {
    setLeaves((prev) => ({ ...prev, [n]: { kind: 'loading' } }))
    void load(n)
  }

  const renderLeaf = (number: number, role: 'top' | 'under' | 'only') => {
    const classes = ['leaf', 'parchment']
    if (turn && role === 'top') classes.push('turning', turn.direction)
    if (turn && role === 'under') classes.push('under', 'shadowed', turn.direction)
    return (
      <article
        key={number}
        className={classes.join(' ')}
        aria-hidden={number !== current}
        data-page={number}
        data-testid={number === current ? 'current-page' : undefined}
      >
        <PageLeaf
          storyId={storyId}
          storyTitle={storyTitle}
          number={number}
          state={leaves[number] ?? { kind: 'loading' }}
          alreadyRead={read.has(number)}
          onChoose={(n) => goTo(n)}
          onRetry={() => retry(number)}
          onRead={markRead}
        />
      </article>
    )
  }

  // Always an array, so React keeps each leaf (keyed by page) mounted as it starts turning.
  let leafNodes
  if (!turn) {
    leafNodes = [renderLeaf(current, 'only')]
  } else if (turn.direction === 'forward') {
    // The old page lifts away to the left, uncovering the new one beneath.
    leafNodes = [renderLeaf(turn.to, 'under'), renderLeaf(turn.from, 'top')]
  } else {
    // An earlier page swings back over from the left.
    leafNodes = [renderLeaf(turn.from, 'under'), renderLeaf(turn.to, 'top')]
  }

  return (
    <main className="book">
      {leafNodes}
      <Link href="/" className="ribbon" aria-label="Return to the library">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <path d="M2 3h4a1 1 0 0 1 1 1v8a1 1 0 0 0-1-1H2zM12 3H8a1 1 0 0 0-1 1v8a1 1 0 0 1 1-1h4z" />
        </svg>
      </Link>
    </main>
  )
}
