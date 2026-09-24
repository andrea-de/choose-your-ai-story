'use client'

import { useEffect, useRef, useState } from 'react'

interface SketchProps {
  src: string
  /** Milliseconds after mount at which the drawing should start appearing. */
  appearAfter: number
}

/** A simple ink drawing that draws itself onto the page once loaded. */
export function Sketch({ src, appearAfter }: SketchProps) {
  const mountedAt = useRef(0)
  const [delay, setDelay] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    mountedAt.current = performance.now()
  }, [])

  if (failed) return null
  return (
    <div className="sketch" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated per page, served from our API */}
      <img
        src={src}
        alt=""
        decoding="async"
        style={delay === null ? { visibility: 'hidden' } : { animationDelay: `${delay}ms` }}
        onLoad={() => setDelay(Math.max(0, appearAfter - (performance.now() - mountedAt.current)))}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
