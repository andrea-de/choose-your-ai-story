'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { getTheme } from '@/lib/themes'
import type { ThemeId } from '@/lib/story/types'

interface NewTaleProps {
  theme: ThemeId
}

function pickOther<T>(items: readonly T[], current: T): T {
  const others = items.filter((i) => i !== current)
  return others[Math.floor(Math.random() * others.length)] ?? current
}

function Die({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M24 4 42 14v20L24 44 6 34V14z" />
      <path d="M6 14l18 10 18-10M24 24v20" />
      <circle cx="24" cy="13" r="1.8" fill="currentColor" />
      <circle cx="13" cy="24" r="1.6" fill="currentColor" />
      <circle cx="16" cy="32" r="1.6" fill="currentColor" />
      <circle cx="31" cy="27" r="1.6" fill="currentColor" />
      <circle cx="36" cy="33" r="1.6" fill="currentColor" />
      <circle cx="33" cy="21" r="1.6" fill="currentColor" />
    </svg>
  )
}

/** The "begin a new tale" form: fill in the blanks, or roll the dice. */
export function NewTale({ theme }: NewTaleProps) {
  const { heroes, settings, tones, ui } = getTheme(theme)
  const router = useRouter()
  const [hero, setHero] = useState(heroes[0])
  const [setting, setSetting] = useState(settings[0])
  const [tone, setTone] = useState(tones[0])
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roll = () => {
    setHero((h) => pickOther(heroes, h))
    setSetting((s) => pickOther(settings, s))
    setTone((t) => pickOther(tones, t))
    setRolling(true)
    setTimeout(() => setRolling(false), 600)
  }

  const begin = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, hero, setting, tone }),
      })
      const body = (await res.json()) as { id?: string; firstPage?: number; error?: string }
      if (!res.ok || !body.id) throw new Error(body.error ?? 'The book would not open.')
      router.push(`/s/${body.id}/${body.firstPage ?? 1}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The book would not open.')
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void begin()
      }}
      aria-label="Begin a new tale"
    >
      <div className="config-row">
        <label htmlFor="hero">{ui.heroLabel}</label>
        <input id="hero" className="config-input" value={hero} maxLength={120} onChange={(e) => setHero(e.target.value)} />
        <button type="button" className="icon-button" aria-label="Roll a different hero" onClick={() => setHero((h) => pickOther(heroes, h))}>
          <Die className="small-die" />
        </button>
      </div>
      <div className="config-row">
        <label htmlFor="setting">{ui.settingLabel}</label>
        <input id="setting" className="config-input" value={setting} maxLength={160} onChange={(e) => setSetting(e.target.value)} />
        <button type="button" className="icon-button" aria-label="Roll a different place" onClick={() => setSetting((s) => pickOther(settings, s))}>
          <Die className="small-die" />
        </button>
      </div>
      <div className="config-row">
        <label id="tone-label">{ui.toneLabel}</label>
        <div className="tones" role="group" aria-labelledby="tone-label">
          {tones.map((t) => (
            <button key={t} type="button" className="tone" aria-pressed={t === tone} onClick={() => setTone(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="begin-row">
        <button type="button" className={`dice-button${rolling ? ' rolling' : ''}`} onClick={roll} disabled={busy}>
          <Die />
          {ui.roll}
        </button>
        <button type="submit" className="seal" disabled={busy || !hero.trim() || !setting.trim()}>
          {busy ? '…' : ui.begin}
        </button>
      </div>
      {busy && <p className="form-error" style={{ color: 'var(--ink-soft)' }}>{ui.binding}</p>}
      {error && <p className="form-error">{error}</p>}
    </form>
  )
}
