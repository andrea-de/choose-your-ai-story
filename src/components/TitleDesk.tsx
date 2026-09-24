'use client'

import Link from 'next/link'
import { useState } from 'react'
import { allThemes, getTheme } from '@/lib/themes'
import type { StorySummary, ThemeId } from '@/lib/story/types'
import { NewTale } from './NewTale'

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

/** The title page. Picking a kind of book restyles the whole page to match. */
export function TitleDesk({ stories, usingMock }: TitleDeskProps) {
  const [theme, setTheme] = useState<ThemeId>('historic-fantasy')

  return (
    <div className="desk" data-theme={theme}>
      <main className="book title-page">
        <article className="leaf paper">
          <div className="leaf-inner">
            <Ornament />
            <h1 className="book-title">Tales Unwritten</h1>
            <p className="book-subtitle">
              A gamebook that writes itself as you read. Every page you turn is kept, for the next reader to find.
            </p>

            <h2 className="section-heading">Choose your book</h2>
            <div className="theme-picker" role="radiogroup" aria-label="Kind of story">
              {allThemes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={t.id === theme}
                  className="theme-tile"
                  onClick={() => setTheme(t.id)}
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

            <h2 className="section-heading">Begin a new tale</h2>
            <NewTale key={theme} theme={theme} />

            {stories.length > 0 && (
              <>
                <div className="fleuron" aria-hidden>
                  {getTheme(theme).ui.fleuron}
                </div>
                <h2 className="section-heading">Tales already begun</h2>
                <ul className="contents">
                  {stories.map((s) => (
                    <li key={s.id}>
                      <Link href={`/s/${s.id}/1`}>
                        <span className="contents-line">
                          <span>{s.title}</span>
                          <span className="leader" />
                          <span className="count">
                            {s.pagesWritten} {s.pagesWritten === 1 ? 'page' : 'pages'}
                          </span>
                        </span>
                        <span className="contents-premise">
                          <span className="contents-theme">{getTheme(s.theme).name}</span> {s.premise}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="colophon">
              {usingMock ? 'Set in practice ink · no storyteller key configured' : 'Written as you read'}
            </p>
          </div>
        </article>
      </main>
    </div>
  )
}
