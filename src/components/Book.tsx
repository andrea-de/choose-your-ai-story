'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getTheme } from '@/lib/themes'
import { turnDirection } from '@/lib/story/tree'
import type { StoryCost } from '@/lib/ai/pricing'
import type { StoryVoice } from '@/lib/voices'
import type { MapNode, PageView, ThemeId } from '@/lib/story/types'
import { SettingsExit, SettingsSheet, StoryCover } from './Covers'
import type { FlowLayout } from './Flow'
import { PageLeaf, type LeafState, type Listening } from './PageLeaf'
import { markPageRead, useReadPages } from './readPages'
import { useAmbience } from './ambience'
import { playNarration, unlockNarration, type Playback } from './narrator'
import { onSettingsChange, useSettings } from './settings'
import {
  alignedTimes,
  estimateSpokenMs,
  firstWords,
  paragraphOfWord,
  paragraphStarts,
  retime,
  spokenTimes,
  wordAt,
} from './timing'
import { TurningBook, type Direction } from './TurningBook'

interface BookProps {
  storyId: string
  storyTitle: string
  /** Two sentences for the cover. */
  premise: string
  theme: ThemeId
  /** The page to open on; 0 opens on the cover. */
  initialNumber: number
  initialPage: PageView | null
}

/** A place in the book: a page, and which screenful of it. Sheet -1 is the page's last; page 0 is the cover. */
interface Position {
  page: number
  sheet: number
}

interface Narration {
  page: number
  /** The page's words are revealed in time with the narrator. */
  sync: boolean
  listening: Listening
  /** When each word is spoken (estimated, then aligned to the recording). */
  times: number[]
  /** Where each paragraph starts in the recording, once it has all arrived. */
  starts?: number[]
}

/** The paragraph being read aloud. */
interface Spoken {
  page: number
  paragraph: number
}

const OFF: Listening = { kind: 'off' }
const WAITING: Listening = { kind: 'waiting' }
/** How long to wait for a narration before reading the page silently. */
const NARRATION_TIMEOUT_MS = 15_000

/** Fetches a page; the server writes it first if nobody has turned to it yet. */
async function fetchPage(storyId: string, number: number): Promise<LeafState> {
  try {
    const res = await fetch(`/api/stories/${storyId}/pages/${number}`)
    const body = (await res.json()) as { page?: PageView; error?: string }
    if (!res.ok || !body.page) return { kind: 'error', message: body.error ?? 'The page could not be found.' }
    return { kind: 'ready', page: body.page }
  } catch {
    return { kind: 'error', message: 'The page could not be reached. Check your connection.' }
  }
}

function pageFromPath(storyId: string): number | null {
  const match = window.location.pathname.match(new RegExp(`^/s/${storyId}(?:/(\\d+))?$`))
  return match ? Number(match[1] ?? 0) : null
}

interface CoverData {
  pages: MapNode[]
  cost?: StoryCost
  voice?: StoryVoice
  canNarrate?: boolean
}

async function fetchMap(storyId: string): Promise<CoverData | null> {
  try {
    const res = await fetch(`/api/stories/${storyId}/map`)
    if (!res.ok) return null
    return (await res.json()) as CoverData
  } catch {
    return null
  }
}

const COVER = 0
const SETTINGS = 'settings'

const keyOf = (p: Position) => `${p.page}:${p.sheet}`
const parseKey = (key: string): Position => {
  const [page, sheet] = key.split(':').map(Number)
  return { page, sheet }
}

/**
 * A book whose pages turn forward or back depending on where the choice leads.
 * A page longer than the screen runs over several sheets, turned the same way.
 */
export function Book({ storyId, storyTitle, premise, theme, initialNumber, initialPage }: BookProps) {
  const { ui } = getTheme(theme)
  const [pos, setPos] = useState<Position>({ page: initialNumber, sheet: 0 })
  const [direction, setDirection] = useState<Direction>('forward')
  const [leaves, setLeaves] = useState<Record<number, LeafState>>(() =>
    initialPage?.status === 'ready' ? { [initialNumber]: { kind: 'ready', page: initialPage } } : {},
  )
  const [layouts, setLayouts] = useState<Record<number, FlowLayout>>({})
  const [seen, setSeen] = useState<Record<number, number>>({})
  const [narration, setNarration] = useState<Narration | null>(null)
  /** A page the reader just turned to with sound on, whose words should wait for the narrator. */
  const [pendingSync, setPendingSync] = useState<number | null>(null)
  const read = useReadPages(storyId)
  /** Narration is active: new pages are read aloud as they are turned to, and tapped paragraphs from their start. */
  const { narration: sound, voiceSpeed } = useSettings()
  /** The reader paused the narrator with the ribbon. */
  const [paused, setPaused] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [map, setMap] = useState<MapNode[] | null>(null)
  const [cost, setCost] = useState<StoryCost | null>(null)
  /** Who reads the tale aloud (for the cover); null where nothing can be read aloud. */
  const [voice, setVoice] = useState<StoryVoice | null>(null)
  /** The paragraph being read aloud, for the marker in the margin. */
  const [spoken, setSpoken] = useState<Spoken | null>(null)
  /** The narrator's voice is playing right now. */
  const [speaking, setSpeaking] = useState(false)

  // Latest values for event handlers.
  const live = useRef({ pos, read, sound, layouts, narration, leaves, settingsOpen, spoken: null as Spoken | null })
  useEffect(() => {
    live.current = { pos, read, sound, layouts, narration, leaves, settingsOpen, spoken }
  })
  /** Pages visited this visit, in history order, so the back arrow can use real history when it matches. */
  const trail = useRef<number[]>([initialNumber])

  const settle = useCallback((number: number, state: LeafState) => {
    // Never replace a page already shown with an error from a later retry.
    setLeaves((prev) => (state.kind === 'error' && prev[number]?.kind === 'ready' ? prev : { ...prev, [number]: state }))
  }, [])

  const load = useCallback(
    (number: number) => fetchPage(storyId, number).then((state) => settle(number, state)),
    [settle, storyId],
  )

  const move = useCallback((to: Position, dir: Direction) => {
    live.current.pos = to
    setDirection(dir)
    setPos(to)
  }, [])

  /** Inside a tap, so browsers allow narration to start later without one. */
  const unlockAudio = useCallback(() => {
    if (live.current.sound) unlockNarration()
  }, [])

  const goTo = useCallback(
    (to: number, { push = true } = {}) => {
      const { pos: from, read: readPages, sound: listening } = live.current
      setSettingsOpen(false)
      if (to === from.page) return
      if (to === COVER) {
        move({ page: COVER, sheet: 0 }, 'backward')
        if (push) {
          window.history.pushState(null, '', `/s/${storyId}`)
          trail.current.push(COVER)
        }
        return
      }
      unlockAudio()
      const again = readPages.has(to)
      // Back on a page already read, open it where the choices are.
      move({ page: to, sheet: again ? -1 : 0 }, turnDirection(from.page, to))
      setPendingSync(listening && !again ? to : null)
      if (push) {
        window.history.pushState(null, '', `/s/${storyId}/${to}`)
        trail.current.push(to)
      }
      setLeaves((prev) => (prev[to]?.kind === 'ready' ? prev : { ...prev, [to]: { kind: 'loading' } }))
      void load(to)
    },
    [load, move, storyId, unlockAudio],
  )

  const sheetNow = useCallback(() => {
    const { pos: p, layouts: l } = live.current
    const sheets = l[p.page]?.sheets ?? 1
    return { index: p.sheet < 0 ? sheets - 1 : Math.min(p.sheet, sheets - 1), sheets }
  }, [])

  const next = useCallback(() => {
    const { index, sheets } = sheetNow()
    const page = live.current.pos.page
    if (index >= sheets - 1) return
    // A sheet the reader turns past counts as read, so the choices can come once the rest is.
    setSeen((prev) => ((prev[page] ?? -1) >= index ? prev : { ...prev, [page]: index }))
    move({ page, sheet: index + 1 }, 'forward')
  }, [move, sheetNow])

  /**
   * Back: the previous screen of this page; from a page's first screen, the page
   * before it (open at its choices), or the cover from page 1. Uses the browser's
   * own history when that is where it leads, so the phone's back button agrees.
   */
  const prev = useCallback(() => {
    const { index } = sheetNow()
    const { pos: p, leaves: l } = live.current
    if (index > 0) {
      move({ page: p.page, sheet: index - 1 }, 'backward')
      return
    }
    const state = l[p.page]
    const before = p.page === 1 ? COVER : state?.kind === 'ready' ? state.page.parent : null
    if (before === null) return
    if (trail.current.at(-2) === before) window.history.back()
    else goTo(before)
  }, [goTo, move, sheetNow])

  // Count the visit (and start writing the next pages) for the page we opened on.
  useEffect(() => {
    if (initialNumber === COVER) return
    fetchPage(storyId, initialNumber).then((state) => settle(initialNumber, state))
  }, [initialNumber, settle, storyId])

  // The cover's map is fetched each time the cover is shown, so it includes the latest pages.
  const onCover = pos.page === COVER && !settingsOpen
  useEffect(() => {
    if (!onCover) return
    let live = true
    void fetchMap(storyId).then((found) => {
      if (!live || !found) return
      setMap(found.pages)
      setCost(found.cost ?? null)
      setVoice(found.canNarrate && found.voice ? found.voice : null)
    })
    return () => {
      live = false
    }
  }, [onCover, storyId])

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      // Back with the settings open closes them.
      if (live.current.settingsOpen && !(e.state as { settings?: boolean } | null)?.settings) {
        setDirection('backward')
        setSettingsOpen(false)
        return
      }
      const n = pageFromPath(storyId)
      if (n === null) return
      if (trail.current.at(-2) === n) trail.current.pop()
      else trail.current.push(n)
      goTo(n, { push: false })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [goTo, storyId])

  // ---------- Reading aloud ----------

  const current = leaves[pos.page]
  const narrationUrl = current?.kind === 'ready' ? current.page.narrationUrl : undefined
  const pageText = current?.kind === 'ready' ? (current.page.text ?? '') : ''
  /** The page the narrator has started on, so each page is read once per arrival. */
  const narrated = useRef<number | null>(null)
  /** Read this page even though it was read before, from this paragraph. */
  const replayFrom = useRef<number | null>(null)
  /** Bumped to start the narrator again on the current page. */
  const [restart, setRestart] = useState(0)

  const playback = useRef<Playback | null>(null)

  /** Where a paragraph starts in the recording: aligned to the audio if it has all arrived, else estimated. */
  const paragraphStart = (n: Narration, text: string, paragraph: number) =>
    n.starts?.[paragraph] ?? Math.max(0, (n.times[firstWords(text)[paragraph]] ?? 0) - 150)

  // Narration switched off in the settings: stop reading, and show whatever the narrator had not reached.
  // A new pace mid-page carries on from the paragraph being read, at the new speed.
  useEffect(
    () =>
      onSettingsChange((next, previous) => {
        if (next.voiceSpeed !== previous.voiceSpeed && playback.current) {
          const at = live.current.spoken
          replayFrom.current = at && at.page === live.current.pos.page ? at.paragraph : 0
          narrated.current = null
          return
        }
        if (!previous.narration || next.narration) return
        playback.current?.stop()
        setSpeaking(false)
        setPaused(false)
        setSpoken(null)
        narrated.current = null
        setNarration((n) => (n ? { ...n, listening: OFF } : n))
      }),
    [],
  )

  useEffect(() => {
    if (!sound || !narrationUrl || narrated.current === pos.page) return
    const page = pos.page
    const from = replayFrom.current
    if (live.current.read.has(page) && from === null) return
    replayFrom.current = null
    narrated.current = page
    // In time with the words only when the reader arrived on a new page with the narrator on.
    const sync = pendingSync === page && !from
    setPendingSync(null)
    const estimated = spokenTimes(pageText, estimateSpokenMs(pageText))
    setNarration({ page, sync, listening: sync ? WAITING : OFF, times: estimated })

    let active = true
    let startedAt: number | null = null
    const fail = () => {
      if (!active) return
      setSpeaking(false)
      setNarration((n) => (n?.page === page ? { ...n, listening: OFF } : n))
    }
    const timeout = setTimeout(fail, NARRATION_TIMEOUT_MS)
    const play = playNarration(voiceSpeed === 1 ? narrationUrl : `${narrationUrl}?speed=${voiceSpeed}`, {
      onStart: (at) => {
        if (!active) return
        clearTimeout(timeout)
        startedAt = at
        setSpeaking(true)
        setNarration((n) => {
          if (n?.page !== page || !n.sync) return n
          return { ...n, listening: { kind: 'playing', startedAt: at, times: n.times } }
        })
      },
      onDuration: (ms) => {
        if (!active) return
        // The whole recording is here (well before the narrator reaches its end): find each
        // paragraph's real start in it, and time the words paragraph by paragraph.
        const { data, rate } = play.samples()
        const complete = data.length >= (ms / 1000) * rate * 0.98
        const starts = complete ? paragraphStarts(pageText, data, rate) : undefined
        const next = starts ? alignedTimes(pageText, starts, ms) : spokenTimes(pageText, ms)
        const elapsed = startedAt === null ? 0 : performance.now() - startedAt
        setNarration((n) => {
          if (n?.page !== page) return n
          const times = n.listening.kind === 'playing' ? retime(n.times, next, elapsed) : next
          const listening: Listening = n.listening.kind === 'playing' ? { ...n.listening, times } : n.listening
          return { ...n, times, starts, listening }
        })
      },
      onEnd: () => {
        if (!active) return
        setSpeaking(false)
        setSpoken(null)
      },
      onError: fail,
    })
    playback.current = play
    if (from) play.seek(Math.max(0, (estimated[firstWords(pageText)[from]] ?? 0) - 150))

    return () => {
      active = false
      clearTimeout(timeout)
      play.stop()
      setSpeaking(false)
      setPaused(false)
      setSpoken(null)
      if (playback.current === play) playback.current = null
    }
    // pendingSync is read once, when the narration for this page begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound, narrationUrl, pos.page, pageText, restart, voiceSpeed])

  // Follow the reading: mark the paragraph being read, and turn to the next sheet as it gets there.
  useEffect(() => {
    if (!speaking) return
    /** The sheet the narrator was on at the last check. */
    let spokenSheet = -1
    const paragraphs = paragraphOfWord(pageText)
    const timer = setInterval(() => {
      const { narration: n, pos: p, layouts: l } = live.current
      const play = playback.current
      if (!play || !n || n.page !== p.page) return
      const word = wordAt(n.times, play.position() + 150)
      const paragraph = paragraphs[Math.max(0, word)] ?? 0
      setSpoken((s) => (s?.page === n.page && s.paragraph === paragraph ? s : { page: n.page, paragraph }))
      const layout = l[p.page]
      if (!layout) return
      const sheet = word < 0 ? 0 : (layout.wordSheets[word] ?? 0)
      const { index } = sheetNow()
      // Only when the reading crosses from this sheet to the next, never to drag a reader back.
      if (spokenSheet === index && sheet === index + 1) next()
      spokenSheet = sheet
    }, 200)
    return () => clearInterval(timer)
  }, [speaking, next, sheetNow, pageText])

  /** The first paragraph on the sheet the reader is looking at. */
  const paragraphOnScreen = () => {
    const { pos: p, layouts: l } = live.current
    const layout = l[p.page]
    if (!layout) return 0
    const { index } = sheetNow()
    const word = layout.wordSheets.indexOf(index)
    return word < 0 ? 0 : (paragraphOfWord(pageText)[word] ?? 0)
  }

  /** The ribbon: pause the narrator, carry on, or (with nothing loaded) read from the top of this screen. */
  const togglePlay = () => {
    unlockNarration()
    const play = playback.current
    if (play && speaking && !paused) {
      play.pause()
      setPaused(true)
      // Paused mid-page: show the rest rather than leave words waiting for a voice.
      setNarration((n) => (n ? { ...n, sync: false, listening: OFF } : n))
      return
    }
    if (play && paused) {
      play.resume()
      setPaused(false)
      return
    }
    replayFrom.current = paragraphOnScreen()
    narrated.current = null
    setRestart((r) => r + 1)
  }

  /** A tapped paragraph, with the narrator on: read from its start. */
  const readFrom = (page: number, paragraph: number) => {
    unlockNarration()
    const n = live.current.narration
    const play = playback.current
    if (play && n?.page === page) {
      if (paused) {
        play.resume()
        setPaused(false)
      }
      play.seek(paragraphStart(n, pageText, paragraph))
      // Jumping about: show the page whole rather than keeping the words in step.
      setNarration((m) => (m?.page === page ? { ...m, sync: false, listening: OFF } : m))
      setSpoken({ page, paragraph })
      return
    }
    replayFrom.current = paragraph
    narrated.current = null
    setRestart((r) => r + 1)
  }

  /** Begin from the cover: the voice as chosen is fixed (the first recording will use it), then page 1. */
  const beginTale = () => {
    if (voice && !voice.locked) {
      setVoice({ ...voice, locked: true })
      void fetch(`/api/stories/${storyId}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      }).catch(() => {})
    }
    goTo(1)
  }

  /** Settings are a history entry too, so back (or the phone's back button) closes them. */
  const toggleSettings = () => {
    if (settingsOpen) {
      if ((window.history.state as { settings?: boolean } | null)?.settings) window.history.back()
      else {
        setDirection('backward')
        setSettingsOpen(false)
      }
      return
    }
    window.history.pushState({ settings: true }, '', window.location.href)
    setDirection('forward')
    setSettingsOpen(true)
  }

  // ---------- Pages ----------

  const onLayout = useCallback((page: number, layout: FlowLayout) => {
    setLayouts((prev) => {
      const old = prev[page]
      if (old && old.sheets === layout.sheets && old.wordSheets.join() === layout.wordSheets.join()) return prev
      return { ...prev, [page]: layout }
    })
  }, [])

  const onSheetDone = useCallback(
    (page: number, sheet: number, lastTextSheet: number) => {
      setSeen((prev) => ((prev[page] ?? -1) >= sheet ? prev : { ...prev, [page]: sheet }))
      if (sheet >= lastTextSheet) markPageRead(storyId, page)
    },
    [storyId],
  )

  const retry = (n: number) => {
    setLeaves((prev) => ({ ...prev, [n]: { kind: 'loading' } }))
    void load(n)
  }

  useAmbience(theme, speaking && !paused)

  /** Whether this server reads pages aloud: any page that offers a narration says so. */
  const canNarrate = Object.values(leaves).some((l) => l.kind === 'ready' && Boolean(l.page.narrationUrl))

  const listeningFor = (page: number): Listening => {
    if (narration?.page === page) return narration.listening
    return sound && pendingSync === page ? WAITING : OFF
  }

  return (
    <TurningBook
      theme={theme}
      at={settingsOpen ? SETTINGS : keyOf(pos)}
      direction={direction}
      // From the cover, only the Begin button goes on while the voice is still open: it confirms the voice.
      onNext={settingsOpen ? undefined : onCover ? (voice && !voice.locked ? undefined : () => goTo(1)) : next}
      onPrev={settingsOpen || onCover ? undefined : prev}
      leafAttributes={(key): Record<string, string | number> => {
        if (key === SETTINGS) return { 'data-leaf': 'settings' }
        const { page } = parseKey(key)
        return page === COVER ? { 'data-leaf': 'cover' } : { 'data-page': page }
      }}
      renderLeaf={(key) => {
        if (key === SETTINGS) {
          return (
            <SettingsSheet theme={theme} ui={ui} canReadAloud={canNarrate}>
              <SettingsExit label="Back to the story" note={ui.turnTo + ' ' + (pos.page === COVER ? 'the cover' : ui.pageLabel(pos.page))} onClick={toggleSettings} />
              {pos.page !== COVER && <SettingsExit label="The cover and map" note="every path so far" onClick={() => goTo(COVER)} />}
              <SettingsExit label={ui.anotherBook} note={ui.toLibrary} href="/" />
            </SettingsSheet>
          )
        }
        const { page, sheet } = parseKey(key)
        if (page === COVER) {
          return (
            <StoryCover
              storyId={storyId}
              voice={voice}
              onVoice={setVoice}
              theme={theme}
              ui={ui}
              title={storyTitle}
              premise={premise}
              map={map}
              cost={cost}
              read={read}
              onBegin={beginTale}
              onOpen={goTo}
            />
          )
        }
        return (
          <PageLeaf
            storyTitle={storyTitle}
            theme={theme}
            number={page}
            sheet={sheet}
            state={leaves[page] ?? { kind: 'loading' }}
            pageRead={read.has(page)}
            seenThrough={seen[page] ?? -1}
            listening={listeningFor(page)}
            speakingParagraph={spoken?.page === page ? spoken.paragraph : undefined}
            narrating={speaking && !paused && narration?.page === page}
            onParagraph={sound ? readFrom : undefined}
            onChoose={goTo}
            onRetry={() => retry(page)}
            onLayout={onLayout}
            onSheetDone={onSheetDone}
            onNext={() => {
              unlockAudio()
              next()
            }}
            onPrev={prev}
          />
        )
      }}
    >
      <div className="ribbons">
        <MenuRibbon open={settingsOpen} onClick={toggleSettings} />
        {/* A second ribbon, only where pages can be read aloud; pulled down further while it is on. */}
        {/* Narration's play and pause, while narration is active. Hangs lower while the narrator speaks. */}
        {sound && canNarrate && (
          <button
            type="button"
            className="ribbon sound-ribbon"
            aria-pressed={speaking && !paused}
            data-speaking={(speaking && !paused) || undefined}
            aria-label={speaking && !paused ? 'Pause the narrator' : 'Play the narrator'}
            onClick={togglePlay}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              {speaking && !paused ? (
                <>
                  <rect x="3" y="2.5" width="2.6" height="9" rx="0.6" />
                  <rect x="8.4" y="2.5" width="2.6" height="9" rx="0.6" />
                </>
              ) : (
                <path d="M4 2.5v9l7.5-4.5z" />
              )}
            </svg>
          </button>
        )}
      </div>
    </TurningBook>
  )
}

/** The ribbon that opens the settings, and closes them again. */
export function MenuRibbon({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ribbon menu-ribbon" aria-pressed={open} aria-label={open ? 'Close settings' : 'Settings'} onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
        <path d="M2 4h10M2 7h10M2 10h10" />
        <circle cx="5" cy="4" r="1.3" fill="currentColor" />
        <circle cx="9" cy="7" r="1.3" fill="currentColor" />
        <circle cx="4" cy="10" r="1.3" fill="currentColor" />
      </svg>
    </button>
  )
}
