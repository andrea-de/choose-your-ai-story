'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { PageView } from '@/lib/story/types'
import { QuillWait } from './Quill'
import { RevealText } from './RevealText'
import { Sketch } from './Sketch'

export type LeafState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; page: PageView }

interface PageLeafProps {
  storyId: string
  storyTitle: string
  number: number
  state: LeafState
  alreadyRead: boolean
  onChoose: (page: number) => void
  onRetry: () => void
  onRead: (page: number) => void
}

const PACE_MS = 120

/** The contents of one page of the book. */
export function PageLeaf({ storyId, storyTitle, number, state, alreadyRead, onChoose, onRetry, onRead }: PageLeafProps) {
  return (
    <div className="leaf-inner">
      <p className="story-title">{storyTitle}</p>
      <p className="folio" aria-label={`Page ${number}`}>
        {number}
      </p>
      {state.kind === 'loading' && <QuillWait message="The ink is still wet on this page…" />}
      {state.kind === 'error' && (
        <div className="quill-wait">
          <p>{state.message}</p>
          <button type="button" className="choice" style={{ textAlign: 'center' }} onClick={onRetry}>
            <span className="choice-turn" style={{ justifyContent: 'center' }}>
              Try the page again
            </span>
          </button>
        </div>
      )}
      {state.kind === 'ready' && (
        <WrittenPage
          key={state.page.number}
          storyId={storyId}
          page={state.page}
          alreadyRead={alreadyRead}
          onChoose={onChoose}
          onRead={onRead}
        />
      )}
    </div>
  )
}

function WrittenPage({
  storyId,
  page,
  alreadyRead,
  onChoose,
  onRead,
}: {
  storyId: string
  page: PageView
  alreadyRead: boolean
  onChoose: (page: number) => void
  onRead: (page: number) => void
}) {
  const [revealed, setRevealed] = useState(alreadyRead)
  const [done, setDone] = useState(alreadyRead)
  const text = page.text ?? ''
  const paragraphs = text.split(/\n\s*\n/)
  const firstParagraphWords = paragraphs[0]?.split(/\s+/).length ?? 0

  const sketch = page.hasIllustration ? (
    <Sketch
      src={`/api/stories/${storyId}/pages/${page.number}/illustration`}
      appearAfter={revealed ? 0 : firstParagraphWords * PACE_MS}
    />
  ) : null

  return (
    <>
      <div
        onClick={() => setRevealed(true)}
        data-testid="page-text"
        aria-label={revealed ? undefined : 'Tap to reveal the whole page'}
      >
        <RevealText
          text={text}
          revealed={revealed}
          pace={PACE_MS}
          insertAfter={sketch ? { index: 0, node: sketch } : undefined}
          onDone={() => {
            setDone(true)
            onRead(page.number)
          }}
        />
        {!revealed && !done && <p className="tap-hint">tap to read ahead</p>}
      </div>

      {done && !page.isEnding && (
        <nav aria-label="Choices">
          <div className="fleuron" aria-hidden>
            ❦
          </div>
          <ul className="choices choices-enter">
            {page.choices?.map((choice) => (
              <li key={choice.page}>
                <button type="button" className="choice" onClick={() => onChoose(choice.page)}>
                  <span className="choice-text">{choice.text}</span>
                  <span className="choice-turn">
                    {!choice.explored && <span className="choice-unwritten">no one has gone this way</span>}
                    turn to <span className="page-no">{choice.page}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {done && page.isEnding && (
        <section className="finis choices-enter" aria-label="The end">
          <div className="fleuron" aria-hidden>
            ✠
          </div>
          <p className="finis-word">Finis</p>
          <p className="finis-title">{page.endingTitle}</p>
          <p className="finis-note">
            {page.visits <= 1 ? 'You are the first to find this ending' : `Found by ${page.visits} readers`}
          </p>
          <div className="finis-actions">
            {page.parent !== null && (
              <button type="button" className="choice" onClick={() => onChoose(page.parent!)}>
                <span className="choice-text">Go back and choose differently</span>
                <span className="choice-turn">
                  turn to <span className="page-no">{page.parent}</span>
                </span>
              </button>
            )}
            <button type="button" className="choice" onClick={() => onChoose(1)}>
              <span className="choice-text">Begin the tale again</span>
              <span className="choice-turn">
                turn to <span className="page-no">1</span>
              </span>
            </button>
            <Link href="/" className="choice">
              <span className="choice-text">Choose another book</span>
              <span className="choice-turn">return to the library</span>
            </Link>
          </div>
        </section>
      )}
    </>
  )
}
