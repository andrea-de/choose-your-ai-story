'use client'

import { Fragment, useMemo, type ReactNode } from 'react'
import { splitWords } from './timing'

interface RevealTextProps {
  text: string
  /** When each word appears, in milliseconds on the page's clock (see timing.ts). */
  times: readonly number[]
  /** The page's clock when this leaf came into view; words before it are already there. */
  from: number
  /** Show everything at once (tapped, or the page was already read). */
  revealed: boolean
  /** Keep every word hidden, e.g. while waiting for the narrator. */
  hold?: boolean
  /** Rendered between paragraphs, after this paragraph index. */
  insertAfter?: { index: number; node: ReactNode }
  /** The paragraph the narrator is reading, marked in the margin. */
  speaking?: number
}

/**
 * Splits a passage into words that ink themselves onto the page. Every word
 * takes its place in the layout from the start, so nothing moves as it appears.
 */
export function RevealText({ text, times, from, revealed, hold = false, insertAfter, speaking }: RevealTextProps) {
  const paragraphs = useMemo(() => splitWords(text), [text])
  const initial = splitInitial(paragraphs[0]?.[0] ?? '')

  let index = 0
  const className = ['prose', revealed && 'revealed', hold && !revealed && 'hold'].filter(Boolean).join(' ')
  return (
    <div className={className} style={{ ['--from' as string]: from }} data-testid="prose">
      {paragraphs.map((words, p) => (
        <Fragment key={p}>
          <p data-p={p} className={p === speaking ? 'speaking' : undefined}>
            {words.map((word, w) => {
              const i = index++
              const style = { ['--t' as string]: times[i] ?? 0 }
              const isFirst = p === 0 && w === 0
              return (
                <Fragment key={w}>
                  {isFirst && initial ? (
                    <>
                      <span className="drop-cap word" style={style} aria-hidden>
                        {/* An opening quote hangs outside the initial, at text size. */}
                        {initial.lead && <span className="drop-lead">{initial.lead}</span>}
                        {initial.letter}
                      </span>
                      <span className="word" data-w={i} style={style}>
                        <span className="sr-only">{initial.lead + initial.letter}</span>
                        {initial.rest}
                      </span>
                    </>
                  ) : (
                    <span className="word" data-w={i} style={style}>
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

/**
 * The first word's initial: its first letter or digit, with any opening punctuation
 * before it ("“Stay" → “ + S + tay). None if the word has no letter at all.
 */
export function splitInitial(word: string): { lead: string; letter: string; rest: string } | null {
  const at = word.search(/[\p{L}\p{N}]/u)
  if (at < 0) return null
  return { lead: word.slice(0, at), letter: word.charAt(at), rest: word.slice(at + 1) }
}
