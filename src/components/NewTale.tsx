'use client'

import { useRouter } from 'next/navigation'
import { useLayoutEffect, useRef, useState } from 'react'
import { getTheme, MAX_TONES } from '@/lib/themes'
import { playChoiceSound } from './sfx'
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

/** A one-line field that wraps onto more lines when its text is long, instead of cutting it off. */
function GrowingField({
  id,
  value,
  maxLength,
  onChange,
}: {
  id: string
  value: string
  maxLength: number
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      id={id}
      className="config-input"
      rows={1}
      value={value}
      maxLength={maxLength}
      // A line break is never part of a hero or a place; Enter begins the tale instead.
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.form?.requestSubmit()
        }
      }}
    />
  )
}

/**
 * Picks or unpicks a mood. At most MAX_TONES: a new pick past that replaces the
 * oldest. The last one cannot be unpicked, so a tale always has a mood.
 */
export function toggleTone(picked: readonly string[], tone: string): string[] {
  if (picked.includes(tone)) return picked.length > 1 ? picked.filter((t) => t !== tone) : [...picked]
  return [...picked, tone].slice(-MAX_TONES)
}

/** One or two moods at random, as the dice would pick them. */
export function rollTones(tones: readonly string[], random = Math.random): string[] {
  const first = tones[Math.floor(random() * tones.length)]
  if (random() < 0.5) return [first]
  const rest = tones.filter((t) => t !== first)
  return [first, rest[Math.floor(random() * rest.length)]]
}

/** The "begin a new tale" form: fill in the blanks, or roll the dice. */
export function NewTale({ theme }: NewTaleProps) {
  const { heroes, settings, tones, ui } = getTheme(theme)
  const router = useRouter()
  const [hero, setHero] = useState(heroes[0])
  const [setting, setSetting] = useState(settings[0])
  /** Up to two moods; the book's own first mood to start with. */
  const [picked, setPicked] = useState<string[]>([tones[0]])
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roll = () => {
    playChoiceSound(theme)
    setHero((h) => pickOther(heroes, h))
    setSetting((s) => pickOther(settings, s))
    setPicked(rollTones(tones))
    setRolling(true)
    setTimeout(() => setRolling(false), 600)
  }

  const begin = async () => {
    playChoiceSound(theme)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, hero, setting, tone: picked.join(' and ') }),
      })
      const body = (await res.json()) as { id?: string; firstPage?: number; error?: string }
      if (!res.ok || !body.id) throw new Error(body.error ?? 'The book would not open.')
      // New tales open on their cover.
      router.push(`/s/${body.id}`)
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
        <GrowingField id="hero" value={hero} maxLength={120} onChange={setHero} />
        <button type="button" className="icon-button" aria-label="Roll a different hero" onClick={() => setHero((h) => pickOther(heroes, h))}>
          <Die className="small-die" />
        </button>
      </div>
      <div className="config-row">
        <label htmlFor="setting">{ui.settingLabel}</label>
        <GrowingField id="setting" value={setting} maxLength={160} onChange={setSetting} />
        <button type="button" className="icon-button" aria-label="Roll a different place" onClick={() => setSetting((s) => pickOther(settings, s))}>
          <Die className="small-die" />
        </button>
      </div>
      <div className="config-row">
        <label id="tone-label">
          {ui.toneLabel} <span className="label-note">(up to two)</span>
        </label>
        <div className="tones" role="group" aria-labelledby="tone-label">
          {tones.map((t) => (
            <button
              key={t}
              type="button"
              className="tone"
              aria-pressed={picked.includes(t)}
              onClick={() => setPicked((p) => toggleTone(p, t))}
            >
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
      {/* Always there, so a message appearing never moves the form. */}
      <p className={`form-status${error ? ' form-error' : ''}`} role="status">
        {error ?? (busy ? ui.binding : '')}
      </p>
    </form>
  )
}
