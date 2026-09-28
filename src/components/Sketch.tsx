'use client'

import { useCallback, useRef, useState } from 'react'

interface SketchProps {
  src: string
  /** Milliseconds after mount at which the drawing should start appearing. */
  appearAfter: number
  /** Keep the space but show nothing yet. */
  hidden?: boolean
  /**
   * Varies how this page's sketch sits and arrives (placement, tilt, the direction
   * it is drawn in), so no two pages in a row look alike. Any number; the page's own is fine.
   */
  variant?: number
}

export const SKETCH_VARIANTS = 4

/**
 * A simple drawing that arrives in the theme's own way once loaded. The frame
 * around it (a clipped photo, a painted disc) arrives with it, never before.
 */
export function Sketch({ src, appearAfter, hidden = false, variant = 0 }: SketchProps) {
  const mountedAt = useRef<number | null>(null)
  const shown = useRef(false)
  /** Milliseconds between mount and the image finishing loading. */
  const [loadedAfter, setLoadedAfter] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  const show = useCallback(() => {
    if (shown.current) return
    shown.current = true
    setLoadedAfter(performance.now() - (mountedAt.current ?? performance.now()))
  }, [])

  // A server-rendered image can finish loading before React attaches onLoad,
  // so also check whether it is already complete when the element mounts.
  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return
      mountedAt.current ??= performance.now()
      if (img.complete && img.naturalWidth > 0) show()
    },
    [show],
  )

  if (failed) return null
  // Recomputed each render, so tapping to read ahead (appearAfter → 0) shows the sketch at once.
  const delay = loadedAfter === null || hidden ? null : Math.max(0, appearAfter - loadedAfter)
  return (
    <div
      className="sketch"
      data-variant={((variant % SKETCH_VARIANTS) + SKETCH_VARIANTS) % SKETCH_VARIANTS}
      data-shown={delay === null ? undefined : true}
      style={delay === null ? undefined : { ['--appear' as string]: `${delay}ms` }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- generated per page, served from our API */}
      <img ref={attach} src={src} alt="" decoding="async" onLoad={show} onError={() => setFailed(true)} />
    </div>
  )
}
