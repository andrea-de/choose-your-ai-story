'use client'

import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react'

interface RevealTextProps {
  text: string
  /** Show everything at once (tapped, or the page was already read). */
  revealed: boolean
  /** Milliseconds between words. */
  pace?: number
  /** Rendered between paragraphs, after this paragraph index. */
  insertAfter?: { index: number; node: ReactNode }
  onDone?: () => void
}

/** Splits a passage into words that ink themselves onto the page one by one. */
export function RevealText({ text, revealed, pace = 120, insertAfter, onDone }: RevealTextProps) {
  const paragraphs = useMemo(() => text.split(/\n\s*\n/).map((p) => p.split(/\s+/).filter(Boolean)), [text])
  const total = paragraphs.reduce((n, p) => n + p.length, 0)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    if (revealed) {
      onDoneRef.current?.()
      return
    }
    // The last word starts at (total - 1) * pace and takes ~700ms to settle.
    const timer = setTimeout(() => onDoneRef.current?.(), Math.max(0, (total - 1) * pace) + 500)
    return () => clearTimeout(timer)
  }, [revealed, total, pace])

  let index = 0
  return (
    <div
      className={`prose${revealed ? ' revealed' : ''}`}
      style={{ ['--pace' as string]: `${pace}ms` }}
      data-testid="prose"
    >
      {paragraphs.map((words, p) => (
        <Fragment key={p}>
          <p>
            {words.map((word, w) => {
              const i = index++
              const isFirst = p === 0 && w === 0
              return (
                <Fragment key={w}>
                  {isFirst ? (
                    <>
                      <span className="drop-cap word" style={{ ['--i' as string]: i }} aria-hidden>
                        {word.charAt(0)}
                      </span>
                      <span className="word" style={{ ['--i' as string]: i }}>
                        <span className="sr-only">{word.charAt(0)}</span>
                        {word.slice(1)}
                      </span>
                    </>
                  ) : (
                    <span className="word" style={{ ['--i' as string]: i }}>
                      {word}
                    </span>
                  )}{' '}
                </Fragment>
              )
            })}
          </p>
          {insertAfter?.index === p && insertAfter.node}
        </Fragment>
      ))}
    </div>
  )
}
