'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DeskTheme, ThemeUi } from '@/lib/themes'
import type { MapNode } from '@/lib/story/types'
import { unlockNarration } from './narrator'
import { playChoiceSound } from './sfx'
import { updateSettings, useSettings, type Settings } from './settings'
import { StoryTree } from './StoryTree'
import { playNarration, type Playback } from './narrator'
import { PLAIN_NARRATOR, type StoryVoice } from '@/lib/voices'
import { totalUsd, type StoryCost } from '@/lib/ai/pricing'
import type { ThemeId } from '@/lib/story/types'

interface StoryCoverProps {
  storyId: string
  theme: ThemeId
  ui: ThemeUi
  title: string
  premise: string
  /** The story's tree; null while it loads. */
  map: readonly MapNode[] | null
  /** What the story has cost so far; shown only when the server shares it. */
  cost?: StoryCost | null
  /** Who reads the tale aloud, while it can still be chosen; null where nothing is read aloud. */
  voice?: StoryVoice | null
  onVoice?: (voice: StoryVoice) => void
  read: ReadonlySet<number>
  onBegin: () => void
  onOpen: (page: number) => void
}

/** A story's cover: its title, what it is about, and a map of every path so far. */
export function StoryCover({ storyId, theme, ui, title, premise, map, cost, voice, onVoice, read, onBegin, onOpen }: StoryCoverProps) {
  const listen = useSummaryReading(storyId)
  // The summary reads itself aloud in the chosen voice when tapped, before or after the tale begins.
  const readSummary = voice ? () => listen.hear(voice.chosen) : undefined
  const reading = voice && listen.hearing?.which === voice.chosen ? listen.hearing.state : undefined
  return (
    <div className="leaf-inner story-cover">
      <p className="cover-kicker">{ui.fleuron}</p>
      <h1 className="cover-title">{title}</h1>
      {readSummary ? (
        <p
          className="cover-premise readable"
          role="button"
          tabIndex={0}
          aria-label={reading ? 'Stop reading the summary' : 'Read the summary aloud'}
          data-state={reading}
          onClick={readSummary}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              readSummary()
            }
          }}
        >
          {premise}
        </p>
      ) : (
        <p className="cover-premise">{premise}</p>
      )}
      {voice && onVoice && <VoicePanel storyId={storyId} theme={theme} voice={voice} onVoice={onVoice} listen={listen} />}
      <div className="cover-map">{map ? <StoryTree nodes={map} read={read} onOpen={onOpen} /> : null}</div>
      {cost && <CostLine cost={cost} />}
      <button
        type="button"
        className="choice cover-begin"
        onClick={() => {
          playChoiceSound(theme)
          onBegin()
        }}
      >
        <span className="choice-text">{ui.begin}</span>
        <span className="choice-turn">
          {ui.turnTo} <span className="page-no">{ui.pageLabel(1)}</span>
        </span>
      </button>
    </div>
  )
}

type Which = StoryVoice['chosen']

interface SummaryReading {
  hearing: { which: Which; state: 'loading' | 'playing' } | null
  /** Read the summary in this voice; asking for the one already reading stops it. */
  hear: (which: Which) => void
  stop: () => void
}

/** The tale's summary read aloud by one narrator or the other, one reading at a time. */
function useSummaryReading(storyId: string): SummaryReading {
  const { voiceSpeed } = useSettings()
  const [hearing, setHearing] = useState<SummaryReading['hearing']>(null)
  const playback = useRef<Playback | null>(null)

  const stop = () => {
    playback.current?.stop()
    playback.current = null
    setHearing(null)
  }
  useEffect(() => () => playback.current?.stop(), [])

  const hear = (which: Which) => {
    unlockNarration()
    const again = hearing?.which === which
    stop()
    if (again) return
    setHearing({ which, state: 'loading' })
    const speed = voiceSpeed === 1 ? '' : `&speed=${voiceSpeed}`
    playback.current = playNarration(`/api/stories/${storyId}/voice/preview?which=${which}${speed}`, {
      onStart: () => setHearing({ which, state: 'playing' }),
      onDuration: () => {},
      onEnd: () => setHearing(null),
      onError: () => setHearing(null),
    })
  }
  return { hearing, hear, stop }
}

/**
 * Who reads the tale aloud, chosen on its cover before anything is recorded: the
 * standard narrator, or a suggested character (with another idea on request).
 * Each can be heard reading the summary first.
 */
function VoicePanel({
  storyId,
  theme,
  voice,
  onVoice,
  listen,
}: {
  storyId: string
  theme: ThemeId
  voice: StoryVoice
  onVoice: (voice: StoryVoice) => void
  listen: SummaryReading
}) {
  const { hearing, hear, stop } = listen
  const [thinking, setThinking] = useState(false)

  if (voice.locked) {
    return (
      <p className="voice-locked">
        Read aloud by {voice.chosen === 'standard' ? PLAIN_NARRATOR.label : voice.suggestion.label}
      </p>
    )
  }

  const send = async (payload: object) => {
    const res = await fetch(`/api/stories/${storyId}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as { voice?: StoryVoice }
    if (body.voice) onVoice(body.voice)
    // Someone started reading it aloud meanwhile: the voice is fixed now.
    else if (res.status === 409) onVoice({ ...voice, locked: true })
  }

  const choose = (which: Which) => {
    playChoiceSound(theme)
    onVoice({ ...voice, chosen: which })
    void send({ choose: which })
  }

  const anotherIdea = async () => {
    playChoiceSound(theme)
    stop()
    setThinking(true)
    try {
      await send({ action: 'suggest' })
    } finally {
      setThinking(false)
    }
  }

  const option = (which: Which, label: string) => (
    <div className="voice-option">
      <button type="button" role="radio" className="tone" aria-checked={voice.chosen === which} onClick={() => choose(which)}>
        {label}
      </button>
      <button
        type="button"
        className="voice-play"
        aria-label={hearing?.which === which ? `Stop ${label}` : `Hear ${label}`}
        data-state={hearing?.which === which ? hearing.state : undefined}
        onClick={() => hear(which)}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          {hearing?.which === which ? <rect x="3" y="3" width="8" height="8" rx="1" /> : <path d="M4 2.5v9l7.5-4.5z" />}
        </svg>
      </button>
    </div>
  )

  return (
    <div className="voice-panel">
      <span className="setting-label" id="voice-label">
        Read aloud by
      </span>
      <div role="radiogroup" aria-labelledby="voice-label" className="voice-options">
        {option('standard', PLAIN_NARRATOR.label)}
        <div className="voice-suggested">
          {option('suggested', voice.suggestion.label)}
          <button type="button" className="voice-new" onClick={() => void anotherIdea()} disabled={thinking}>
            {thinking ? 'thinking…' : 'another idea'}
          </button>
        </div>
      </div>
      <p className="voice-direction">{voice.suggestion.style}</p>
    </div>
  )
}

const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`

/** The story's running cost, for whoever runs the server (SHOW_COSTS=false hides it). */
function CostLine({ cost }: { cost: StoryCost }) {
  const parts = [
    ['writing', cost.text],
    ['narration', cost.speech],
    ['sketches', cost.image],
  ] as const
  return (
    <p className="cover-cost" data-testid="story-cost">
      Cost {usd(totalUsd(cost))}
      {parts
        .filter(([, line]) => line.calls > 0)
        .map(([label, line]) => ` · ${label} ${usd(line.usd)} (${line.calls})`)
        .join('')}
    </p>
  )
}

function Option<K extends keyof Settings>({
  theme,
  label,
  name,
  choices,
}: {
  theme: DeskTheme
  label: string
  name: K
  choices: readonly (readonly [Settings[K], string])[]
}) {
  const settings = useSettings()
  const id = `setting-${name}`
  return (
    <div className="setting-row">
      <span className="setting-label" id={id}>
        {label}
      </span>
      {/* A segmented switch, in the interface's own look rather than the book's, so settings read as settings. */}
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {choices.map(([value, text]) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            className="segment"
            aria-checked={settings[name] === value}
            onClick={() => {
              // A tap, so sound can start: the effects, or the narrator.
              unlockNarration()
              updateSettings({ [name]: value } as Partial<Settings>)
              // After the change, so switching sound effects on is heard and switching them off is not.
              playChoiceSound(theme)
            }}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

interface SettingsSheetProps {
  theme: DeskTheme
  ui: ThemeUi
  /** Ways out of the settings, as choice-styled buttons and links. */
  children: ReactNode
  /** Read aloud needs a speech model on the server; hide it where it cannot work. */
  canReadAloud?: boolean
}

/** The reader's settings, one sheet, in the book's own style. */
export function SettingsSheet({ theme, ui, children, canReadAloud = true }: SettingsSheetProps) {
  return (
    <div className="leaf-inner settings-sheet">
      <h2 className="section-heading">{ui.settings}</h2>
      <div className="settings-body">
        <Option theme={theme} label="Sound effects" name="sfx" choices={[[true, 'on'], [false, 'off']]} />
        <Option theme={theme} label="Background sound" name="ambience" choices={[[true, 'on'], [false, 'off']]} />
        {canReadAloud && <Option theme={theme} label="Narration" name="narration" choices={[[true, 'active'], [false, 'inactive']]} />}
        {canReadAloud && (
          <Option
            theme={theme}
            label="Narrator’s pace"
            name="voiceSpeed"
            choices={[[0.85, 'slower'], [1, 'normal'], [1.2, 'faster'], [1.4, 'fastest']]}
          />
        )}
        <Option theme={theme} label="Text size" name="textSize" choices={[['small', 'smaller'], ['medium', 'normal'], ['large', 'larger']]} />
        <Option
          theme={theme}
          label="Words appear"
          name="pace"
          choices={[['slow', 'slowly'], ['normal', 'as usual'], ['fast', 'quickly'], ['instant', 'all at once']]}
        />
        <Option theme={theme} label="Pages turn" name="motion" choices={[['full', 'with a flourish'], ['reduced', 'simply']]} />
      </div>
      <nav className="settings-exits">{children}</nav>
      <p className="settings-credits">
        <a href="/ambience/CREDITS.md" target="_blank" rel="noreferrer">
          Background sounds: credits
        </a>
      </p>
    </div>
  )
}

/** A way out of the settings sheet, styled like a choice. */
export function SettingsExit({ label, note, onClick, href }: { label: string; note: string; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <span className="choice-text">{label}</span>
      <span className="choice-turn">{note}</span>
    </>
  )
  if (href) {
    return (
      <Link href={href} className="choice">
        {body}
      </Link>
    )
  }
  return (
    <button type="button" className="choice" onClick={onClick}>
      {body}
    </button>
  )
}
