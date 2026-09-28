'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { hashString } from '@/lib/story/random'
import { getTheme, type ThemeUi } from '@/lib/themes'
import type { PageView, ThemeId } from '@/lib/story/types'
import { Flow, type FlowLayout } from './Flow'
import { QuillWait } from './Quill'
import { PACE_FACTOR, useSettings } from './settings'
import { playChoiceSound } from './sfx'
import { RevealText } from './RevealText'
import { Sketch } from './Sketch'
import { pacedTimes, splitWords } from './timing'

export type LeafState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; page: PageView }

/** Whether this page is being read aloud, and where the reading has got to. */
export type Listening =
  | { kind: 'off' }
  | { kind: 'waiting' }
  /** The narrator is speaking: audio time 0 was at `startedAt` (performance.now), each word at `times`. */
  | { kind: 'playing'; startedAt: number; times: readonly number[] }

interface PageLeafProps {
  storyTitle: string
  theme: ThemeId
  number: number
  state: LeafState
  /** Which sheet of the page to show; -1 means the last. */
  sheet: number
  /** The reader has read this whole page before. */
  pageRead: boolean
  /** Sheets of this page up to this one have already been revealed. */
  seenThrough: number
  listening: Listening
  onChoose: (page: number) => void
  onRetry: () => void
  onLayout: (page: number, layout: FlowLayout) => void
  onSheetDone: (page: number, sheet: number, lastTextSheet: number) => void
  onNext: () => void
  onPrev: () => void
  /** While the narrator is on: the paragraph being read, and a way to jump to another. */
  speakingParagraph?: number
  onParagraph?: (page: number, paragraph: number) => void
  /** The narrator is reading this page right now (not paused). */
  narrating?: boolean
}

const SINGLE: FlowLayout = { sheets: 1, wordSheets: [] }

/** One screen of a page of the book. A page too long for the screen runs on over several sheets. */
export function PageLeaf(props: PageLeafProps) {
  const { storyTitle, theme, number, state } = props
  const { ui } = getTheme(theme)
  return (
    <div className="leaf-inner">
      <header className="running-head">
        <p className="story-title">{storyTitle}</p>
        <p className="folio" aria-label={`Page ${number}`}>
          {ui.pageLabel(number)}
        </p>
      </header>
      {state.kind === 'ready' ? (
        <WrittenPage key={state.page.number} {...props} ui={ui} page={state.page} />
      ) : (
        <>
          <Flow sheet={0}>
            {state.kind === 'loading' ? (
              <QuillWait message={ui.waiting} theme={theme} />
            ) : (
              <div className="quill-wait">
                <p>{state.message}</p>
                <button type="button" className="choice retry" onClick={props.onRetry}>
                  <span className="choice-turn">Try the page again</span>
                </button>
              </div>
            )}
          </Flow>
          <nav className="sheet-nav" aria-hidden />
        </>
      )}
    </div>
  )
}

function WrittenPage({
  ui,
  theme,
  page,
  sheet,
  pageRead,
  seenThrough,
  listening,
  onChoose,
  onLayout,
  onSheetDone,
  onNext,
  onPrev,
  speakingParagraph,
  onParagraph,
  narrating = false,
}: PageLeafProps & { ui: ThemeUi; page: PageView }) {
  const text = page.text ?? ''
  const [layout, setLayout] = useState<FlowLayout>(SINGLE)
  const sheetIndex = sheet < 0 ? layout.sheets - 1 : Math.min(sheet, layout.sheets - 1)

  const settings = useSettings()
  // Decided when the leaf appears, so revealing it later never replays the words.
  const [alreadyShown] = useState(() => pageRead || (sheet >= 0 && sheet <= seenThrough))
  const [tapped, setTapped] = useState(false)
  const revealed = alreadyShown || tapped || settings.pace === 'instant'

  // Spoken pages keep time with the narrator; silent ones reveal at the theme's pace.
  const playing = listening.kind === 'playing' ? listening : null
  const pace = ui.pace * PACE_FACTOR[settings.pace]
  const paced = useMemo(() => pacedTimes(text, pace), [text, pace])
  const times = playing ? playing.times : paced
  // Where the narrator had got to when this leaf came into view (0 if it came first and waited).
  const [mountedAt] = useState(() => performance.now())
  const playFrom = playing ? Math.max(0, mountedAt - playing.startedAt) : 0

  // If the narrator stops mid-page, show the rest of the sheet at once.
  const wasSpoken = useRef(false)
  useEffect(() => {
    if (playing) wasSpoken.current = true
    else if (wasSpoken.current && listening.kind === 'off') setTapped(true)
  }, [playing, listening.kind])

  // Until the layout is measured, every word counts as on the first sheet.
  const wordSheets = times.map((_, i) => layout.wordSheets[i] ?? 0)
  const firstOnSheet = wordSheets.indexOf(sheetIndex)
  const lastOnSheet = wordSheets.lastIndexOf(sheetIndex)
  const lastTextSheet = wordSheets.at(-1) ?? 0
  const hold = !revealed && listening.kind === 'waiting'
  const from = playing ? playFrom : firstOnSheet >= 0 ? times[firstOnSheet] : 0

  const [doneSheet, setDoneSheet] = useState(-1)
  const sheetDone = revealed || doneSheet === sheetIndex || lastOnSheet < 0
  useEffect(() => {
    if (hold || sheetDone) return
    // The last word on the sheet starts at its time and takes up to ~1.1s to settle (Dreamscape's is slowest).
    const timer = setTimeout(() => setDoneSheet(sheetIndex), Math.max(0, times[lastOnSheet] - from) + 1200)
    return () => clearTimeout(timer)
  }, [hold, sheetDone, sheetIndex, times, lastOnSheet, from])

  const onSheetDoneRef = useRef(onSheetDone)
  useEffect(() => {
    onSheetDoneRef.current = onSheetDone
  })
  useEffect(() => {
    if (sheetDone) onSheetDoneRef.current(page.number, sheetIndex, lastTextSheet)
  }, [sheetDone, page.number, sheetIndex, lastTextSheet])

  // The text is all there once every sheet of it has been drawn (a sheet turned past counts as read).
  const textRead = pageRead || seenThrough >= lastTextSheet || (sheetDone && sheetIndex === lastTextSheet)
  // Choices wait for the narrator to finish reading the page too; once shown, they stay.
  const [textDone, setTextDone] = useState(alreadyShown)
  if (!textDone && textRead && !narrating) setTextDone(true)

  const paragraphs = splitWords(text)
  const firstParagraphEnd = Math.max(0, (paragraphs[0]?.length ?? 1) - 1)
  const sketch = page.sketchUrl ? (
    <Sketch
      key={hold ? 'held' : 'shown'}
      src={page.sketchUrl}
      hidden={hold}
      variant={hashString(`${page.storyId}:${page.number}`)}
      appearAfter={revealed ? 0 : Math.max(0, (times[firstParagraphEnd] ?? 0) - from)}
    />
  ) : null

  const hasMore = sheetIndex < layout.sheets - 1
  let hint: string | null = null
  if (hold && listening.kind === 'waiting') hint = ui.narratorWait
  else if (!sheetDone && !playing) hint = ui.tapHint
  else if (onParagraph && speakingParagraph === undefined) hint = 'tap a paragraph to hear it'

  return (
    <>
      <Flow
        sheet={sheetIndex}
        // A new text size re-flows the page onto a different number of sheets.
        measureKey={`${text}|${settings.textSize}`}
        onLayout={(l) => {
          setLayout(l)
          onLayout(page.number, l)
        }}
        onClick={(e) => {
          setTapped(true)
          // With the narrator on, a tapped paragraph is read from its start.
          const paragraph = (e.target as Element).closest?.('[data-p]')?.getAttribute('data-p')
          if (onParagraph && paragraph != null) onParagraph(page.number, Number(paragraph))
        }}
        label={revealed ? undefined : 'Tap to reveal the whole page'}
        testId="page-text"
      >
        <RevealText
          text={text}
          times={times}
          from={from}
          revealed={revealed}
          hold={hold}
          insertAfter={sketch ? { index: 0, node: sketch } : undefined}
          speaking={speakingParagraph}
        />

        {!page.isEnding && (
          <nav aria-label="Choices" aria-hidden={!textDone} className={`after-text${textDone ? ' shown' : ''}`}>
            <div className="fleuron" aria-hidden>
              {ui.fleuron}
            </div>
            <ul className="choices">
              {page.choices?.map((choice) => (
                <li key={choice.page}>
                  <button
                    type="button"
                    className="choice"
                    data-target={choice.page}
                    tabIndex={textDone ? undefined : -1}
                    onClick={(e) => {
                      e.stopPropagation()
                      playChoiceSound(theme)
                      onChoose(choice.page)
                    }}
                  >
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

        {page.isEnding && (
          <section className={`finis after-text${textDone ? ' shown' : ''}`} aria-label="The end" aria-hidden={!textDone}>
            <div className="fleuron" aria-hidden>
              {ui.endMark}
            </div>
            <p className="finis-word">{ui.finis}</p>
            <p className="finis-title">{page.endingTitle}</p>
            <p className="finis-note">{page.visits <= 1 ? ui.firstToEnd : ui.foundBy(page.visits)}</p>
            <div
              className="finis-actions"
              onClick={(e) => {
                e.stopPropagation()
                if ((e.target as HTMLElement).closest('.choice')) playChoiceSound(theme)
              }}
            >
              {page.parent !== null && (
                <button type="button" className="choice" onClick={() => onChoose(page.parent!)}>
                  <span className="choice-text">{ui.goBack}</span>
                  <span className="choice-turn">
                    {ui.turnTo} <span className="page-no">{ui.pageLabel(page.parent)}</span>
                  </span>
                </button>
              )}
              {/* Back to the start is the cover, with the map of every path so far. */}
              <button type="button" className="choice" onClick={() => onChoose(0)}>
                <span className="choice-text">{ui.beginAgain}</span>
                <span className="choice-turn">{ui.turnTo} the cover</span>
              </button>
              <Link href="/" className="choice">
                <span className="choice-text">{ui.anotherBook}</span>
                <span className="choice-turn">{ui.toLibrary}</span>
              </Link>
            </div>
          </section>
        )}
      </Flow>

      <SheetNav
        ui={ui}
        // Back works from the first screen too: to the page before, or the cover from page 1.
        canPrev={sheetIndex > 0 || page.parent !== null || page.number === 1}
        canNext={hasMore && sheetDone}
        hint={hint}
        sheet={sheetIndex}
        sheets={layout.sheets}
        onPrev={onPrev}
        onNext={onNext}
      />
    </>
  )
}

/** The foot of every sheet: back, a hint or where you are, and on to the rest of the page. */
export function SheetNav({
  ui,
  canPrev,
  canNext,
  hint,
  sheet,
  sheets,
  nextLabel,
  onPrev,
  onNext,
}: {
  ui: ThemeUi
  canPrev: boolean
  canNext: boolean
  hint?: string | null
  sheet: number
  sheets: number
  nextLabel?: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <nav className="sheet-nav" aria-label="Turn">
      <button type="button" className="sheet-prev" aria-label="Back" disabled={!canPrev} onClick={onPrev}>
        <Arrow back />
      </button>
      <span className="sheet-middle">
        {hint ? (
          <span className="tap-hint" key={hint}>
            {hint}
          </span>
        ) : sheets > 1 ? (
          <span className="sheet-dots" aria-label={`Sheet ${sheet + 1} of ${sheets}`}>
            {Array.from({ length: sheets }, (_, i) => (
              <span key={i} className={i === sheet ? 'on' : undefined} />
            ))}
          </span>
        ) : null}
      </span>
      <button type="button" className="sheet-next" disabled={!canNext} onClick={onNext}>
        {nextLabel ?? ui.more}
        <Arrow />
      </button>
    </nav>
  )
}

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      {back ? <path d="M17 6H2M6 1.5 1.5 6 6 10.5" /> : <path d="M1 6h15M12 1.5 16.5 6 12 10.5" />}
    </svg>
  )
}
