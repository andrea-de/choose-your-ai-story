'use client'

import { useCallback, useRef, useState } from 'react'

interface SketchProps {
  src: string
  /** Milliseconds after mount at which the drawing should start appearing. */
  appearAfter: number
}

/** A simple ink drawing that draws itself onto the page once loaded. */
export function Sketch({ src, appearAfter }: SketchProps) {
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
  const delay = loadedAfter === null ? null : Math.max(0, appearAfter - loadedAfter)
  return (
    <div className="sketch" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated per page, served from our API */}
      <img
        ref={attach}
        src={src}
        alt=""
        decoding="async"
        style={delay === null ? { visibility: 'hidden' } : { animationDelay: `${delay}ms` }}
        onLoad={show}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
