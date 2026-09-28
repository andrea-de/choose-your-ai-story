'use client'

import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react'

export interface FlowLayout {
  /** How many screens the content takes. */
  sheets: number
  /** For each word (by its data-w index), the sheet it lands on. */
  wordSheets: number[]
}

interface FlowProps {
  /** Which sheet to show. */
  sheet: number
  onLayout?: (layout: FlowLayout) => void
  /** Anything that changes the content's size, so the layout is measured again. */
  measureKey?: unknown
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLDivElement>) => void
  label?: string
  testId?: string
}

/**
 * Lays content out in columns exactly one screen wide (CSS does the pagination),
 * and shows one of them. Nothing scrolls: content that runs over continues on the
 * next sheet, and the reader turns to it.
 */
export function Flow({ sheet, onLayout, measureKey, children, onClick, label, testId }: FlowProps) {
  const windowRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const onLayoutRef = useRef(onLayout)
  useLayoutEffect(() => {
    onLayoutRef.current = onLayout
  })

  useLayoutEffect(() => {
    const win = windowRef.current
    const flow = flowRef.current
    const end = endRef.current
    if (!win || !flow || !end) return
    let last = ''
    const measure = () => {
      const width = win.clientWidth
      if (width === 0) return
      const gap = parseFloat(getComputedStyle(flow).columnGap) || 0
      // Layout offsets, not client rects: a leaf may be mid-turn, rotated in 3D, while it measures.
      const sheetOf = (el: HTMLElement) => Math.max(0, Math.floor((el.offsetLeft + gap / 2) / (width + gap)))
      const sheets = sheetOf(end) + 1
      const wordSheets: number[] = []
      flow.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
        wordSheets[Number(el.dataset.w)] = sheetOf(el)
      })
      const key = `${sheets}|${wordSheets.join(',')}`
      if (key === last) return
      last = key
      onLayoutRef.current?.({ sheets, wordSheets })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(win)
    // Web fonts change how much fits on a sheet.
    let live = true
    document.fonts?.ready.then(() => live && measure())
    return () => {
      live = false
      observer.disconnect()
    }
  }, [measureKey])

  return (
    <div className="flow-window" ref={windowRef} onClick={onClick} aria-label={label} data-testid={testId}>
      <div className="flow" ref={flowRef} style={{ ['--sheet' as string]: sheet }}>
        {children}
        <div className="flow-end" ref={endRef} aria-hidden />
      </div>
    </div>
  )
}
