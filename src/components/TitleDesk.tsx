'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { allThemes, getTheme, libraryUi, type DeskTheme } from '@/lib/themes'
import type { StorySummary, ThemeId } from '@/lib/story/types'
import { useAmbience } from './ambience'
import { MenuRibbon } from './Book'
import { SettingsExit, SettingsSheet } from './Covers'
import { Flow } from './Flow'
import { NewTale } from './NewTale'
import { playChoiceSound } from './sfx'
import { SheetNav } from './PageLeaf'
import { TurningBook, type Direction } from './TurningBook'

interface TitleDeskProps {
  stories: StorySummary[]
  usingMock: boolean
}

function Ornament() {
  return (
    <svg className="title-ornament" viewBox="0 0 160 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
      <path d="M4 12h52M104 12h52" />
      <path d="M56 12c6-8 14-8 18 0-4 8-12 8-18 0zM104 12c-6-8-14-8-18 0 4 8 12 8 18 0z" />
      <circle cx="80" cy="12" r="3.4" fill="currentColor" />
      <path d="M20 12c4-4 8-4 10 0M140 12c-4-4-8-4-10 0" />
    </svg>
  )
}

/**
 * The front of the book, one screen at a time: the title page, the choice of
 * book, the new tale, and the tales already begun. Picking a kind of book
 * restyles everything to match, including how the leaves turn.
 */
export function TitleDesk({ stories, usingMock }: TitleDeskProps) {
  const [theme, setTheme] = useState<ThemeId>('historic-fantasy')
  const [at, setAt] = useState('cover')
  const [direction, setDirection] = useState<Direction>('forward')
  const [shelfSheets, setShelfSheets] = useState(1)
  /** How deep into the title pages we are, in browser history (the cover is 0). */
  const depth = useRef(0)
  const { ui: bookUi, name } = getTheme(theme)
  // The library pages are neutral; only the new tale's own sheet takes on its book's look.
  const inBook = at === 'begin'
  const desk: DeskTheme = inBook ? theme : 'library'
  const ui = inBook ? bookUi : libraryUi
  // The chosen book's background plays while choosing it and on its sheet; the library is quiet.
  useAmbience(at === 'books' || inBook ? theme : null)

  /**
   * Each title page is a history entry, so the phone's back button steps back
   * through them (instead of leaving the site), and the back arrows use it too.
   */
  const go = (to: string) => {
    depth.current += 1
    window.history.pushState({ title: to, depth: depth.current }, '', window.location.href)
    setDirection('forward')
    setAt(to)
  }
  const back = () => {
    if (depth.current > 0) window.history.back()
  }
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { title?: string; depth?: number } | null
      const to = state?.title ?? 'cover'
      const toDepth = state?.depth ?? 0
      setDirection(toDepth < depth.current ? 'backward' : 'forward')
      depth.current = toDepth
      setAt(to)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  /** A menu choice: the book's own sound, then the turn. */
  const choose = (to: string) => {
    playChoiceSound(to === 'begin' ? theme : 'library')
    go(to)
  }
  const shelf = at.startsWith('shelf:') ? Number(at.slice(6)) : -1

  const onward = () => {
    if (at === 'cover') go('books')
    else if (at === 'books') go('begin')
    else if (shelf >= 0 && shelf < shelfSheets - 1) go(`shelf:${shelf + 1}`)
  }

  const toggleSettings = () => {
    if (at === 'settings') back()
    else go('settings')
  }

  const renderLeaf = (key: string) => {
    if (key === 'settings') {
      // Nothing is read aloud on the title pages; that switch lives in the story itself.
      return (
        <SettingsSheet theme="library" ui={libraryUi} canReadAloud={false}>
          <SettingsExit label="Back" note={ui.toLibrary} onClick={toggleSettings} />
        </SettingsSheet>
      )
    }
    if (key === 'cover') {
      return (
        <div className="leaf-inner cover">
          <div className="cover-body">
            <Ornament />
            <h1 className="book-title">Tales Unwritten</h1>
            <p className="book-subtitle">
              A gamebook that writes itself as you read. Every page you turn is kept, for the next reader to find.
            </p>
            <div className="cover-menu">
              <button type="button" className="choice" onClick={() => choose('books')}>
                <span className="choice-text">Begin a new tale</span>
                <span className="choice-turn">{ui.turnTo} the first page</span>
              </button>
              {stories.length > 0 && (
                <button type="button" className="choice" onClick={() => choose('shelf:0')}>
                  <span className="choice-text">Tales already begun</span>
                  <span className="choice-turn">
                    {stories.length} {stories.length === 1 ? 'book' : 'books'} on the shelf
                  </span>
                </button>
              )}
            </div>
          </div>
          <p className="colophon">
            {usingMock ? 'Set in practice ink · no storyteller key configured' : 'Written as you read'}
          </p>
        </div>
      )
    }

    if (key === 'books') {
      return (
        <div className="leaf-inner">
          <h2 className="section-heading">Choose your book</h2>
          <div className="theme-picker" role="radiogroup" aria-label="Kind of story">
            {allThemes.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === theme}
                className="theme-tile"
                onClick={() => {
                  // Each book answers in its own sound as it is picked.
                  playChoiceSound(t.id)
                  setTheme(t.id)
                }}
              >
                {/* Each tile is a small sample of its own theme's paper and type. */}
                <span className="desk theme-sample" data-theme={t.id}>
                  <span className="paper theme-sample-page">
                    <span className="theme-sample-name">{t.name}</span>
                    <span className="theme-sample-tagline">{t.tagline}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <SheetNav ui={ui} canPrev canNext sheet={0} sheets={1} nextLabel={`Open ${name}`} onPrev={back} onNext={() => choose('begin')} />
        </div>
      )
    }

    if (key === 'begin') {
      return (
        <div className="leaf-inner">
          <h2 className="section-heading">Begin a new tale</h2>
          <div className="begin-body">
            <NewTale key={theme} theme={theme} />
          </div>
          <SheetNav ui={ui} canPrev canNext={false} sheet={0} sheets={1} nextLabel="" onPrev={back} onNext={onward} />
        </div>
      )
    }

    const sheet = Number(key.slice(6))
    return (
      <div className="leaf-inner">
        <h2 className="section-heading">Tales already begun</h2>
        <Flow sheet={sheet} measureKey={stories.length} onLayout={(l) => setShelfSheets(l.sheets)}>
          <ul className="contents">
            {stories.map((s) => (
              <li key={s.id}>
                <Link href={`/s/${s.id}`}>
                  <span className="contents-line">
                    {/* Each title in a touch of its own book's type and colour. */}
                    <span className="contents-title" data-kind={s.theme}>
                      {s.title}
                    </span>
                    <span className="leader" />
                    <span className="count">
                      {s.pagesWritten} {s.pagesWritten === 1 ? 'page' : 'pages'}
                    </span>
                  </span>
                  <span className="contents-premise">
                    <span className="contents-theme" data-kind={s.theme}>
                      {getTheme(s.theme).name}
                    </span>{' '}
                    {s.premise}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Flow>
        <SheetNav
          ui={ui}
          canPrev
          canNext={sheet < shelfSheets - 1}
          sheet={sheet}
          sheets={shelfSheets}
          onPrev={back}
          onNext={onward}
        />
      </div>
    )
  }

  return (
    <TurningBook
      theme={desk}
      at={at}
      direction={direction}
      className="title-page"
      renderLeaf={renderLeaf}
      onNext={at === 'begin' || at === 'settings' ? undefined : onward}
      onPrev={at === 'cover' || at === 'settings' ? undefined : back}
    >
      <div className="ribbons">
        <MenuRibbon open={at === 'settings'} onClick={toggleSettings} />
      </div>
    </TurningBook>
  )
}
