'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DeskTheme } from '@/lib/themes'

export type Direction = 'forward' | 'backward'

interface Turn {
  from: string
  to: string
  direction: Direction
}

interface TurningBookProps {
  theme: DeskTheme
  /** The leaf on show. Changing it turns to the new leaf in `direction`, in the theme's own way. */
  at: string
  direction: Direction
  renderLeaf: (key: string, current: boolean) => ReactNode
  /** Extra attributes for a leaf's element. */
  leafAttributes?: (key: string) => Record<string, string | number>
  /** Swipes and arrow keys. */
  onNext?: () => void
  onPrev?: () => void
  className?: string
  children?: ReactNode
}

/** How long the leaving leaf stays mounted; the longest theme transition. */
export const TURN_MS = 760

/**
 * A book of leaves that each fill the screen. Only the leaf on show is mounted,
 * plus the one leaving while it turns; theme CSS decides how a turn looks.
 */
export function TurningBook({
  theme,
  at,
  direction,
  renderLeaf,
  leafAttributes,
  onNext,
  onPrev,
  className,
  children,
}: TurningBookProps) {
  const [shown, setShown] = useState(at)
  const [turn, setTurn] = useState<Turn | null>(null)
  if (at !== shown) {
    setShown(at)
    setTurn({ from: shown, to: at, direction })
  }
  useEffect(() => {
    if (!turn) return
    const timer = setTimeout(() => setTurn(null), TURN_MS)
    return () => clearTimeout(timer)
  }, [turn])

  const nav = useRef({ onNext, onPrev })
  useEffect(() => {
    nav.current = { onNext, onPrev }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.altKey || e.metaKey || e.ctrlKey) return
      if (e.key === 'ArrowRight') nav.current.onNext?.()
      if (e.key === 'ArrowLeft') nav.current.onPrev?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const swipe = useRef<{ x: number; y: number } | null>(null)

  const leaf = (key: string, role: 'top' | 'under' | 'only') => {
    const classes = ['leaf', 'paper']
    if (turn && role === 'top') classes.push('turning', turn.direction)
    if (turn && role === 'under') classes.push('under', 'shadowed', turn.direction)
    const current = key === at
    return (
      <article
        key={key}
        className={classes.join(' ')}
        aria-hidden={!current}
        inert={!current}
        data-testid={current ? 'current-page' : undefined}
        {...leafAttributes?.(key)}
      >
        {renderLeaf(key, current)}
      </article>
    )
  }

  // Always an array, so React keeps each leaf mounted as it starts turning.
  let leaves
  if (!turn) leaves = [leaf(at, 'only')]
  else if (turn.direction === 'forward') leaves = [leaf(turn.to, 'under'), leaf(turn.from, 'top')]
  else leaves = [leaf(turn.from, 'under'), leaf(turn.to, 'top')]

  return (
    <div className="desk" data-theme={theme}>
      <main
        className={['book', className].filter(Boolean).join(' ')}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const start = swipe.current
          swipe.current = null
          if (!start) return
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
          if (dx < 0) onNext?.()
          else onPrev?.()
        }}
        onPointerCancel={() => {
          swipe.current = null
        }}
      >
        {leaves}
        {children}
      </main>
    </div>
  )
}
