'use client'

import Link from 'next/link'
import { useState } from 'react'
import { getTheme, type ThemeUi } from '@/lib/themes'
import type { PageView, ThemeId } from '@/lib/story/types'
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
  theme: ThemeId
  number: number
  state: LeafState
  alreadyRead: boolean
  onChoose: (page: number) => void
  onRetry: () => void
  onRead: (page: number) => void
}

/** The contents of one page of the book. */
export function PageLeaf({
  storyId,
  storyTitle,
  theme,
  number,
  state,
  alreadyRead,
  onChoose,
  onRetry,
  onRead,
}: PageLeafProps) {
  const { ui } = getTheme(theme)
  return (
    <div className="leaf-inner">
      <p className="story-title">{storyTitle}</p>
      <p className="folio" aria-label={`Page ${number}`}>
        {ui.pageLabel(number)}
      </p>
      {state.kind === 'loading' && <QuillWait message={ui.waiting} theme={theme} />}
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
          ui={ui}
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
  ui,
  page,
  alreadyRead,
  onChoose,
  onRead,
}: {
  storyId: string
  ui: ThemeUi
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
      appearAfter={revealed ? 0 : firstParagraphWords * ui.pace}
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
          pace={ui.pace}
          insertAfter={sketch ? { index: 0, node: sketch } : undefined}
          onDone={() => {
            setDone(true)
            onRead(page.number)
          }}
        />
        {!revealed && !done && <p className="tap-hint">{ui.tapHint}</p>}
      </div>

      {done && !page.isEnding && (
        <nav aria-label="Choices">
          <div className="fleuron" aria-hidden>
            {ui.fleuron}
          </div>
          <ul className="choices choices-enter">
            {page.choices?.map((choice) => (
              <li key={choice.page}>
                <button type="button" className="choice" data-target={choice.page} onClick={() => onChoose(choice.page)}>
                  <span className="choice-text">{choice.text}</span>
                  <span className="choice-turn">
                    {!choice.explored && <span className="choice-unwritten">{ui.unwritten}</span>}
                    {ui.turnTo} <span className="page-no">{ui.pageLabel(choice.page)}</span>
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
            {ui.endMark}
          </div>
          <p className="finis-word">{ui.finis}</p>
          <p className="finis-title">{page.endingTitle}</p>
          <p className="finis-note">{page.visits <= 1 ? ui.firstToEnd : ui.foundBy(page.visits)}</p>
          <div className="finis-actions">
            {page.parent !== null && (
              <button type="button" className="choice" onClick={() => onChoose(page.parent!)}>
                <span className="choice-text">{ui.goBack}</span>
                <span className="choice-turn">
                  {ui.turnTo} <span className="page-no">{ui.pageLabel(page.parent)}</span>
                </span>
              </button>
            )}
            <button type="button" className="choice" onClick={() => onChoose(1)}>
              <span className="choice-text">{ui.beginAgain}</span>
              <span className="choice-turn">
                {ui.turnTo} <span className="page-no">{ui.pageLabel(1)}</span>
              </span>
            </button>
            <Link href="/" className="choice">
              <span className="choice-text">{ui.anotherBook}</span>
              <span className="choice-turn">{ui.toLibrary}</span>
            </Link>
          </div>
        </section>
      )}
    </>
  )
}
