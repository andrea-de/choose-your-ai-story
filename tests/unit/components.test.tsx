// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Book } from '@/components/Book'
import { PageLeaf } from '@/components/PageLeaf'
import { RevealText, splitInitial } from '@/components/RevealText'
import { Sketch } from '@/components/Sketch'
import type { NarrationHandlers } from '@/components/narrator'
import { markPageRead } from '@/components/readPages'
import { resetSettings, updateSettings } from '@/components/settings'
import {
  alignedTimes,
  estimateSpokenMs,
  findPauses,
  pacedTimes,
  paragraphStarts,
  retime,
  spokenTimes,
  wordAt,
} from '@/components/timing'
import { TurningBook } from '@/components/TurningBook'
import { StoryTree, layoutTree } from '@/components/StoryTree'
import type { PageView } from '@/lib/story/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

/** A stand-in narrator: tests play its part by calling the handlers Book gives it. */
const narrator = vi.hoisted(() => ({
  plays: [] as {
    url: string
    handlers: NarrationHandlers
    stopped: boolean
    paused: boolean
    position: number
    seeks: number[]
  }[],
}))
vi.mock('@/components/narrator', () => ({
  unlockNarration: () => {},
  playNarration: (url: string, handlers: NarrationHandlers) => {
    const play = { url, handlers, stopped: false, paused: false, position: 0, seeks: [] as number[] }
    narrator.plays.push(play)
    return {
      stop: () => {
        play.stopped = true
      },
      position: () => play.position,
      seek: (ms: number) => {
        play.seeks.push(ms)
      },
      samples: () => ({ data: new Float32Array(0), rate: 24000 }),
      pause: () => {
        play.paused = true
      },
      resume: () => {
        play.paused = false
      },
    }
  },
}))

const page = (extra: Partial<PageView> = {}): PageView => ({
  storyId: 's1',
  number: 1,
  parent: null,
  depth: 0,
  status: 'ready',
  text: 'The candle gutters.\n\nA door creaks.',
  choices: [
    { text: 'Climb the tower stair', page: 43, explored: false },
    { text: 'Hide and watch', page: 12, explored: true },
  ],
  sketchUrl: undefined,
  visits: 1,
  ...extra,
})

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  localStorage.clear()
  resetSettings()
  narrator.plays = []
  // jsdom lays nothing out, so every page measures as a single sheet.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('timing', () => {
  it('paces silent reading evenly', () => {
    expect(pacedTimes('one two\n\nthree', 100)).toEqual([0, 100, 200])
  })

  it('spreads spoken words across the recording, lingering after full stops', () => {
    const times = spokenTimes('Rain. It falls and falls, slowly.', 10_000)
    expect(times).toHaveLength(6)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
    expect(times[0]).toBeGreaterThan(0)
    expect(times.at(-1)!).toBeLessThan(10_000)
    // The pause after "Rain." is longer than the one after "It".
    expect(times[1] - times[0]).toBeGreaterThan(times[2] - times[1])
  })

  it('estimates a reading from its length, about 12 characters a second', () => {
    expect(estimateSpokenMs('a'.repeat(120))).toBe(10_000)
  })

  it('retimes the words still to come, never hiding one already shown', () => {
    expect(retime([0, 100, 200, 300], [0, 150, 300, 450], 120)).toEqual([0, 100, 300, 450])
    // A shorter reading than estimated: the rest follow straight on.
    expect(retime([0, 100, 200, 300], [0, 50, 90, 120], 120)).toEqual([0, 100, 180, 180])
  })

  it('finds the word being spoken', () => {
    expect(wordAt([0, 100, 200], -5)).toBe(-1)
    expect(wordAt([0, 100, 200], 150)).toBe(1)
    expect(wordAt([0, 100, 200], 999)).toBe(2)
  })
})

describe('RevealText', () => {
  it('hangs an opening quote beside the initial rather than enlarging it', () => {
    const { container } = render(<RevealText text={'“Stay back,” she says.'} times={[0, 1, 2, 3]} from={0} revealed />)
    const cap = container.querySelector('.drop-cap')!
    expect(cap.textContent).toBe('“S')
    expect(cap.querySelector('.drop-lead')!.textContent).toBe('“')
    expect(container.querySelector('.sr-only')!.textContent).toBe('“S')
    expect(splitInitial('“Stay')).toEqual({ lead: '“', letter: 'S', rest: 'tay' })
    expect(splitInitial('—')).toBeNull()
  })

  it('splits paragraphs into words with a drop cap, each keeping its time', () => {
    const { container } = render(<RevealText text={'Once upon\n\na time'} times={[0, 10, 20, 30]} from={0} revealed={false} />)
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(container.querySelector('.drop-cap')!.textContent).toBe('O')
    expect(container.querySelectorAll('.word')).toHaveLength(5) // drop cap + "nce", upon, a, time
    expect(container.querySelectorAll('[data-w]')).toHaveLength(4)
    expect((container.querySelector('[data-w="3"]') as HTMLElement).style.getPropertyValue('--t')).toBe('30')
    expect(container.querySelector('.prose')!.className).toBe('prose')
  })

  it('holds every word back while waiting for the narrator, unless revealed', () => {
    const { container, rerender } = render(<RevealText text="one two" times={[0, 1]} from={0} revealed={false} hold />)
    expect(container.querySelector('.prose')!.className).toContain('hold')
    rerender(<RevealText text="one two" times={[0, 1]} from={0} revealed hold />)
    expect(container.querySelector('.prose')!.className).toBe('prose revealed')
  })
})

describe('PageLeaf', () => {
  const noop = () => {}
  const props = {
    storyTitle: 'The Salt Crown',
    theme: 'historic-fantasy' as const,
    number: 1,
    sheet: 0,
    pageRead: false,
    seenThrough: -1,
    listening: { kind: 'off' } as const,
    onChoose: noop,
    onRetry: noop,
    onLayout: noop,
    onSheetDone: noop,
    onNext: noop,
    onPrev: noop,
  }

  it('shows the quill while the page is being written', () => {
    render(<PageLeaf {...props} state={{ kind: 'loading' }} />)
    expect(screen.getByRole('status').textContent).toContain('ink is still wet')
  })

  it('keeps the choices’ place but hides them until the text is read, then shows turn-to page numbers', () => {
    const onChoose = vi.fn()
    const onSheetDone = vi.fn()
    const { container } = render(
      <PageLeaf {...props} onSheetDone={onSheetDone} onChoose={onChoose} state={{ kind: 'ready', page: page() }} />,
    )
    const nav = container.querySelector('nav[aria-label="Choices"]')!
    expect(nav.className).not.toContain('shown')
    expect(nav.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('tap to read ahead')).toBeTruthy()

    fireEvent.click(screen.getByTestId('page-text'))
    expect(nav.className).toContain('shown')
    expect(nav.textContent).toContain('turn to 43')
    expect(nav.textContent).toContain('no one has gone this way')
    expect(onSheetDone).toHaveBeenCalledWith(1, 0, 0)
    fireEvent.click(screen.getByText('Climb the tower stair'))
    expect(onChoose).toHaveBeenCalledWith(43)
  })

  it('finishes the sheet by itself once the last word has appeared', () => {
    const onSheetDone = vi.fn()
    render(<PageLeaf {...props} onSheetDone={onSheetDone} state={{ kind: 'ready', page: page({ text: 'one two three' }) }} />)
    act(() => vi.advanceTimersByTime(2 * 120 + 1100))
    expect(onSheetDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(200))
    expect(onSheetDone).toHaveBeenCalledWith(1, 0, 0)
  })

  it('keeps the choices back while the narrator is still reading, and never hides them again', () => {
    const view = (narrating: boolean, pageRead = false) => (
      <PageLeaf {...props} pageRead={pageRead} narrating={narrating} state={{ kind: 'ready', page: page() }} />
    )
    const { container, rerender } = render(view(true))
    fireEvent.click(screen.getByTestId('page-text'))
    const nav = () => container.querySelector('nav[aria-label="Choices"]')!
    expect(nav().className).not.toContain('shown')
    rerender(view(false))
    expect(nav().className).toContain('shown')
    // Read aloud again later: the choices stay.
    rerender(view(true, true))
    expect(nav().className).toContain('shown')
  })

  it('waits for the narrator with every word in place but unseen', () => {
    const { container } = render(<PageLeaf {...props} listening={{ kind: 'waiting' }} state={{ kind: 'ready', page: page() }} />)
    expect(container.querySelector('.prose.hold')).toBeTruthy()
    expect(screen.getByText('The chronicler clears their throat…')).toBeTruthy()
  })

  it('reveals the words in time with the narrator once the reading starts', () => {
    const { container, rerender } = render(
      <PageLeaf {...props} listening={{ kind: 'waiting' }} state={{ kind: 'ready', page: page({ text: 'one two three' }) }} />,
    )
    rerender(
      <PageLeaf
        {...props}
        listening={{ kind: 'playing', startedAt: performance.now(), times: [250, 900, 1700] }}
        state={{ kind: 'ready', page: page({ text: 'one two three' }) }}
      />,
    )
    expect(container.querySelector('.prose.hold')).toBeNull()
    expect((container.querySelector('[data-w="2"]') as HTMLElement).style.getPropertyValue('--t')).toBe('1700')
  })

  it('shows a page already read with its choices at once', () => {
    render(<PageLeaf {...props} pageRead state={{ kind: 'ready', page: page() }} />)
    expect(screen.getByRole('navigation', { name: 'Choices' }).className).toContain('shown')
    expect(screen.getByTestId('prose').className).toContain('revealed')
  })

  it('has nowhere further to turn when the page fits one sheet, but back leads on from any first screen', () => {
    const { container, rerender } = render(<PageLeaf {...props} pageRead state={{ kind: 'ready', page: page() }} />)
    expect((container.querySelector('.sheet-next') as HTMLButtonElement).disabled).toBe(true)
    // Page 1's first screen goes back to the cover; a later page's to the page before it.
    expect((container.querySelector('.sheet-prev') as HTMLButtonElement).disabled).toBe(false)
    rerender(<PageLeaf {...props} number={43} pageRead state={{ kind: 'ready', page: page({ number: 43, parent: 1 }) }} />)
    expect((container.querySelector('.sheet-prev') as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the ending with ways back', () => {
    const onChoose = vi.fn()
    render(
      <PageLeaf
        {...props}
        number={77}
        pageRead
        state={{ kind: 'ready', page: page({ number: 77, parent: 43, isEnding: true, endingTitle: 'The Last Bell', choices: [], visits: 1 }) }}
        onChoose={onChoose}
      />,
    )
    expect(screen.getByText('Finis')).toBeTruthy()
    expect(screen.getByText('The Last Bell')).toBeTruthy()
    expect(screen.getByText('You are the first to find this ending')).toBeTruthy()
    fireEvent.click(screen.getByText('Go back and choose differently'))
    expect(onChoose).toHaveBeenCalledWith(43)
    // Beginning again goes to the cover, with its map, rather than straight to page 1.
    fireEvent.click(screen.getByText('Begin the tale again'))
    expect(onChoose).toHaveBeenCalledWith(0)
  })

  it('offers a retry when writing failed', () => {
    const onRetry = vi.fn()
    render(<PageLeaf {...props} onRetry={onRetry} state={{ kind: 'error', message: 'The quill slipped.' }} />)
    fireEvent.click(screen.getByText('Try the page again'))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('PageLeaf themes', () => {
  const noop = () => {}
  const base = {
    storyTitle: 'T',
    number: 1,
    sheet: 0,
    pageRead: true,
    seenThrough: -1,
    listening: { kind: 'off' } as const,
    onChoose: noop,
    onRetry: noop,
    onLayout: noop,
    onSheetDone: noop,
    onNext: noop,
    onPrev: noop,
  }

  it('speaks in the future theme’s idiom', () => {
    render(<PageLeaf {...base} theme="future" state={{ kind: 'ready', page: page() }} />)
    expect(screen.getByLabelText('Page 1').textContent).toBe('LOG 001')
    const nav = screen.getByRole('navigation', { name: 'Choices' })
    expect(nav.textContent).toContain('jump to LOG 043')
    expect(nav.textContent).toContain('uncharted')
  })

  it('closes a noir case with a stamp', () => {
    render(
      <PageLeaf
        {...base}
        theme="noir"
        number={9}
        state={{ kind: 'ready', page: page({ number: 9, isEnding: true, endingTitle: 'Rain Check', choices: [], visits: 4 }) }}
      />,
    )
    expect(screen.getByText('Case Closed')).toBeTruthy()
    expect(screen.getByText('4 detectives closed it this way')).toBeTruthy()
  })

  it('shows the theme’s waiting message', () => {
    render(<PageLeaf {...base} theme="pirate" number={3} pageRead={false} state={{ kind: 'loading' }} />)
    expect(screen.getByRole('status').textContent).toContain('Charting the course')
  })
})

describe('TurningBook', () => {
  it('turns between leaves in the given direction, then settles on one', () => {
    const { container, rerender } = render(
      <TurningBook theme="noir" at="a" direction="forward" renderLeaf={(k) => <p>{k}</p>} />,
    )
    expect(container.querySelector('.desk')!.getAttribute('data-theme')).toBe('noir')
    rerender(<TurningBook theme="noir" at="b" direction="forward" renderLeaf={(k) => <p>{k}</p>} />)
    expect(container.querySelector('.leaf.turning.forward')!.textContent).toBe('a')
    expect(container.querySelector('.leaf.under')!.textContent).toBe('b')
    expect(screen.getByTestId('current-page').textContent).toBe('b')
    act(() => vi.advanceTimersByTime(800))
    expect(container.querySelectorAll('.leaf')).toHaveLength(1)
    rerender(<TurningBook theme="noir" at="a" direction="backward" renderLeaf={(k) => <p>{k}</p>} />)
    expect(container.querySelector('.leaf.turning.backward')!.textContent).toBe('a')
  })

  it('turns with arrow keys and swipes', () => {
    const onNext = vi.fn()
    const onPrev = vi.fn()
    const { container } = render(
      <TurningBook theme="dream" at="a" direction="forward" renderLeaf={(k) => <p>{k}</p>} onNext={onNext} onPrev={onPrev} />,
    )
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const book = container.querySelector('.book')!
    fireEvent.pointerDown(book, { clientX: 300, clientY: 100 })
    fireEvent.pointerUp(book, { clientX: 100, clientY: 110 })
    // A mostly vertical drag is not a swipe.
    fireEvent.pointerDown(book, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(book, { clientX: 160, clientY: 400 })
    expect(onNext).toHaveBeenCalledTimes(2)
    expect(onPrev).toHaveBeenCalledTimes(1)
  })
})

describe('Sketch', () => {
  const sketch = (container: HTMLElement) => container.querySelector('.sketch') as HTMLElement

  it('reveals an image that finished loading before hydration', () => {
    // jsdom never loads images; fake one that is already complete, then restore jsdom's getters.
    const proto = HTMLImageElement.prototype
    const saved = ['complete', 'naturalWidth'].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const)
    Object.defineProperty(proto, 'complete', { configurable: true, get: () => true })
    Object.defineProperty(proto, 'naturalWidth', { configurable: true, get: () => 150 })
    try {
      const { container } = render(<Sketch src="/x.svg" appearAfter={0} />)
      expect(sketch(container).dataset.shown).toBe('true')
    } finally {
      for (const [k, d] of saved) {
        if (d) Object.defineProperty(proto, k, d)
        else delete (proto as unknown as Record<string, unknown>)[k]
      }
    }
  })

  it('keeps its place unseen until the image loads, then appears with the frame', () => {
    const { container } = render(<Sketch src="/x.svg" appearAfter={0} />)
    expect(sketch(container).dataset.shown).toBeUndefined()
    fireEvent.load(container.querySelector('img')!)
    expect(sketch(container).dataset.shown).toBe('true')
    expect(sketch(container).style.getPropertyValue('--appear')).toMatch(/ms$/)
  })

  it('stays unseen while held back for the narrator', () => {
    const { container } = render(<Sketch src="/x.svg" appearAfter={0} hidden />)
    fireEvent.load(container.querySelector('img')!)
    expect(sketch(container).dataset.shown).toBeUndefined()
  })

  it('varies from page to page', () => {
    const variants = [1, 2, 3, 4, 43, 44].map((n) => {
      const { container, unmount } = render(<Sketch src="/x.svg" appearAfter={0} variant={n} />)
      const v = sketch(container).dataset.variant
      unmount()
      return v
    })
    expect(new Set(variants).size).toBe(4)
  })

  it('disappears if the image fails', () => {
    const { container } = render(<Sketch src="/x.svg" appearAfter={0} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('.sketch')).toBeNull()
  })
})

describe('Book', () => {
  function stubFetch(pages: Record<number, PageView>) {
    const fetchMock = vi.fn(async (url: string) => {
      const n = Number(url.split('?')[0].split('/').pop())
      return new Response(JSON.stringify({ page: pages[n] }), { status: pages[n] ? 200 : 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('turns forward to a later page, updating the URL, then settles', async () => {
    stubFetch({ 1: page(), 43: page({ number: 43, parent: 1, text: 'You climb.' }) })
    const push = vi.spyOn(window.history, 'pushState')
    markPageRead('s1', 1)
    const { container } = render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={1} initialPage={page()} />)
    await act(async () => {})
    fireEvent.click(screen.getByText('Climb the tower stair'))
    expect(push).toHaveBeenCalledWith(null, '', '/s/s1/43')
    expect(container.querySelector('.leaf.turning.forward')!.getAttribute('data-page')).toBe('1')
    expect(container.querySelector('.leaf.under')!.getAttribute('data-page')).toBe('43')
    await act(async () => vi.advanceTimersByTime(800))
    expect(container.querySelectorAll('.leaf')).toHaveLength(1)
    expect(screen.getByTestId('current-page').getAttribute('data-page')).toBe('43')
  })

  it('turns backward when the chosen page number is lower', async () => {
    const from = page({ number: 43, parent: 1 })
    stubFetch({ 43: from, 12: page({ number: 12, parent: 43 }) })
    markPageRead('s1', 43)
    const { container } = render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={43} initialPage={from} />)
    await act(async () => {})
    fireEvent.click(screen.getByText('Hide and watch'))
    // The earlier page swings in over the current one.
    expect(container.querySelector('.leaf.turning.backward')!.getAttribute('data-page')).toBe('12')
    expect(container.querySelector('.leaf.under')!.getAttribute('data-page')).toBe('43')
  })

  it('handles the browser back button with a backward turn', async () => {
    stubFetch({ 1: page(), 43: page({ number: 43, parent: 1 }) })
    markPageRead('s1', 43)
    const { container } = render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={43} initialPage={page({ number: 43 })} />)
    await act(async () => {})
    window.history.replaceState(null, '', '/s/s1/1')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(container.querySelector('.leaf.turning.backward')!.getAttribute('data-page')).toBe('1')
  })

  it('loads a page that was not ready on the server, showing the quill meanwhile', async () => {
    const fetchMock = stubFetch({ 5: page({ number: 5 }) })
    render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={5} initialPage={null} />)
    expect(screen.getByRole('status')).toBeTruthy()
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledWith('/api/stories/s1/pages/5')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('offers reading aloud only where pages can be read aloud', async () => {
    stubFetch({ 1: page() })
    render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={1} initialPage={page()} />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull()
  })

  it('shows an error with retry when the page cannot be written', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'The quill slipped.' }), { status: 502 })))
    render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={9} initialPage={null} />)
    await act(async () => {})
    expect(screen.getByText('The quill slipped.')).toBeTruthy()
  })

  async function listeningBook() {
    const narrationUrl = '/api/stories/s1/pages/43/narration'
    const first = page({ narrationUrl: '/api/stories/s1/pages/1/narration' })
    const text = 'You climb the stair. It creaks.'
    stubFetch({ 1: first, 43: page({ number: 43, parent: 1, text, narrationUrl }) })
    markPageRead('s1', 1)
    updateSettings({ narration: true })
    const view = render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={1} initialPage={first} />)
    await act(async () => {})
    fireEvent.click(screen.getByText('Climb the tower stair'))
    await act(async () => {})
    await act(async () => {})
    const leaf = () => view.container.querySelector('[data-page="43"]')!
    const play = narrator.plays.find((p) => p.url === narrationUrl)!
    return { ...view, text, leaf, play }
  }

  it('reads aloud: the next page waits for the narrator, then reveals its words in time', async () => {
    const { text, leaf, play } = await listeningBook()
    expect(play).toBeTruthy()
    expect(leaf().querySelector('.prose.hold')).toBeTruthy()
    expect(leaf().textContent).toContain('The chronicler clears their throat…')

    // The first audio arrives: words start, timed from an estimate of the reading's length.
    act(() => play.handlers.onStart(performance.now()))
    expect(leaf().querySelector('.prose.hold')).toBeNull()
    const word = (i: number) => (leaf().querySelector(`[data-w="${i}"]`) as HTMLElement).style.getPropertyValue('--t')
    const estimated = spokenTimes(text, estimateSpokenMs(text))
    expect(word(5)).toBe(String(estimated[5]))
    expect(screen.getByRole('button', { name: 'Pause the narrator' }).dataset.speaking).toBe('true')

    // The recording finishes: the words still to come move to the real timings.
    act(() => play.handlers.onDuration(9000))
    expect(word(5)).toBe(String(spokenTimes(text, 9000)[5]))
  })

  it('stops the narrator and shows the rest of the sheet when narration is switched off', async () => {
    const { leaf, play } = await listeningBook()
    act(() => play.handlers.onStart(performance.now()))
    act(() => updateSettings({ narration: false }))
    expect(play.stopped).toBe(true)
    expect(leaf().querySelector('.prose')!.className).toContain('revealed')
    expect(screen.queryByRole('button', { name: /the narrator/ })).toBeNull()
  })

  it('pauses and resumes with the ribbon, keeping its place', async () => {
    const { leaf, play } = await listeningBook()
    act(() => play.handlers.onStart(performance.now()))
    fireEvent.click(screen.getByRole('button', { name: 'Pause the narrator' }))
    expect(play.paused).toBe(true)
    expect(play.stopped).toBe(false)
    // Paused mid-page: the rest of the page shows.
    expect(leaf().querySelector('.prose')!.className).toContain('revealed')
    fireEvent.click(screen.getByRole('button', { name: 'Play the narrator' }))
    expect(play.paused).toBe(false)
    expect(narrator.plays.filter((p) => p.url === play.url)).toHaveLength(1)
  })

  it('reads the page silently if the narrator fails', async () => {
    const { leaf, play } = await listeningBook()
    act(() => play.handlers.onError(new Error('blocked')))
    expect(leaf().querySelector('.prose.hold')).toBeNull()
    expect(leaf().querySelector('.prose')!.className).not.toContain('revealed')
  })

  it('stops reading a page when the reader turns to another', async () => {
    const { play } = await listeningBook()
    act(() => play.handlers.onStart(performance.now()))
    window.history.replaceState(null, '', '/s/s1/1')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(play.stopped).toBe(true)
  })
})

describe('settings', () => {
  it('reveals every word at once when the reader asks for it', () => {
    updateSettings({ pace: 'instant' })
    render(
      <PageLeaf
        storyTitle="T"
        theme="historic-fantasy"
        number={1}
        sheet={0}
        pageRead={false}
        seenThrough={-1}
        listening={{ kind: 'off' }}
        state={{ kind: 'ready', page: page() }}
        onChoose={() => {}}
        onRetry={() => {}}
        onLayout={() => {}}
        onSheetDone={() => {}}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    )
    expect(screen.getByTestId('prose').className).toContain('revealed')
  })

  it('slows or speeds the words', () => {
    updateSettings({ pace: 'slow' })
    const { container } = render(
      <PageLeaf
        storyTitle="T"
        theme="historic-fantasy"
        number={1}
        sheet={0}
        pageRead={false}
        seenThrough={-1}
        listening={{ kind: 'off' }}
        state={{ kind: 'ready', page: page({ text: 'one two three' }) }}
        onChoose={() => {}}
        onRetry={() => {}}
        onLayout={() => {}}
        onSheetDone={() => {}}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    )
    // Historic fantasy's pace is 120ms a word; slowly is half as slow again.
    expect((container.querySelector('[data-w="2"]') as HTMLElement).style.getPropertyValue('--t')).toBe('360')
  })

  it('sizes the whole book and remembers the choice', () => {
    updateSettings({ textSize: 'large', motion: 'reduced' })
    expect(document.documentElement.style.fontSize).toBe('115%')
    expect(document.documentElement.dataset.motion).toBe('reduced')
    expect(JSON.parse(localStorage.getItem('tales:settings')!)).toMatchObject({ textSize: 'large', motion: 'reduced' })
  })
})

describe('StoryTree', () => {
  const nodes = [
    { number: 1, parent: null, written: true, isEnding: false },
    { number: 43, parent: 1, written: true, isEnding: false },
    { number: 12, parent: 1, written: false, isEnding: false },
    { number: 7, parent: 43, written: true, isEnding: true },
    { number: 90, parent: 43, written: false, isEnding: false },
  ]

  it('lays out a tidy tree: leaves side by side, parents centred over their children', () => {
    const { placed, columns, rows } = layoutTree(nodes)
    const at = Object.fromEntries(placed.map((p) => [p.number, p]))
    expect(columns).toBe(3)
    expect(rows).toBe(3)
    expect(at[1].depth).toBe(0)
    expect(at[7].depth).toBe(2)
    expect(at[43].x).toBe((at[7].x + at[90].x) / 2)
    expect(at[1].x).toBe((at[12].x + at[43].x) / 2)
  })

  it('marks pages read by you, written by others, unwritten, and endings; only yours can be opened', () => {
    const onOpen = vi.fn()
    const { container } = render(<StoryTree nodes={nodes} read={new Set([1, 43])} onOpen={onOpen} />)
    const kind = (n: number) => container.querySelector(`[data-page="${n}"]`)?.getAttribute('class')
    expect(kind(1)).toBe('tree-node yours')
    expect(kind(43)).toBe('tree-node yours')
    expect(container.querySelectorAll('.tree-node.written')).toHaveLength(1)
    expect(container.querySelectorAll('.tree-node.unwritten')).toHaveLength(2)
    // Page 7 is an ending, but you have not reached it: it must not give itself away.
    expect(container.querySelectorAll('.tree-node rect')).toHaveLength(0)
    expect(container.querySelectorAll('.tree-edge.yours')).toHaveLength(1)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      '3 pages written, 2 read by you, 2 still unwritten, 0 endings found by you',
    )
    fireEvent.click(container.querySelector('[data-page="43"]')!)
    expect(onOpen).toHaveBeenCalledWith(43)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('shows an ending as one once you have reached it', () => {
    const { container } = render(<StoryTree nodes={nodes} read={new Set([1, 43, 7])} onOpen={() => {}} />)
    expect(container.querySelectorAll('.tree-node rect')).toHaveLength(1)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/1 ending found by you$/)
  })
})

/** jsdom delivers history.back() as a popstate a moment later. */
async function waitForPopstate() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      vi.advanceTimersByTime(50)
      await Promise.resolve()
    })
  }
}

describe('Book cover and settings', () => {
  const map = [
    { number: 1, parent: null, written: true, isEnding: false },
    { number: 43, parent: 1, written: false, isEnding: false },
  ]
  function stub() {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/map')) return new Response(JSON.stringify({ pages: map }))
      const n = Number(url.split('/').pop())
      return new Response(JSON.stringify({ page: page({ number: n }) }))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('opens on the cover with the title, premise and map, then turns to page 1', async () => {
    const fetchMock = stub()
    const push = vi.spyOn(window.history, 'pushState')
    const { container } = render(
      <Book storyId="s1" storyTitle="The Salt Crown" premise="A crown lies under the marsh." theme="historic-fantasy" initialNumber={0} initialPage={null} />,
    )
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'The Salt Crown' })).toBeTruthy()
    expect(screen.getByText('A crown lies under the marsh.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/stories/s1/map')
    expect(container.querySelectorAll('.tree-node')).toHaveLength(2)
    fireEvent.click(screen.getByText('Begin'))
    expect(push).toHaveBeenCalledWith(null, '', '/s/s1/1')
    expect(screen.getByTestId('current-page').getAttribute('data-page')).toBe('1')
  })

  it('turns back to the cover from the first sheet of page 1', async () => {
    stub()
    const push = vi.spyOn(window.history, 'pushState')
    render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={1} initialPage={page()} />)
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(push).toHaveBeenCalledWith(null, '', '/s/s1')
    expect(screen.getByTestId('current-page').getAttribute('data-leaf')).toBe('cover')
  })

  it('opens the settings from the menu ribbon, and goes back to the same place', async () => {
    stub()
    render(<Book storyId="s1" storyTitle="T" premise="P" theme="noir" initialNumber={1} initialPage={page()} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByTestId('current-page').getAttribute('data-leaf')).toBe('settings')
    expect(screen.getByRole('heading', { name: 'House Rules' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Sound effects' })).getByRole('radio', { name: 'off' }))
    expect(JSON.parse(localStorage.getItem('tales:settings')!).sfx).toBe(false)
    // The chosen option shows as chosen.
    expect(within(screen.getByRole('radiogroup', { name: 'Sound effects' })).getByRole('radio', { name: 'off' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('link', { name: /Pull another file/ }).getAttribute('href')).toBe('/')
    // Closing the settings goes back through history, like the phone's back button.
    fireEvent.click(screen.getByText('Back to the story'))
    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })
    await waitForPopstate()
    expect(screen.getByTestId('current-page').getAttribute('data-page')).toBe('1')
  })
})

describe('the narrator', () => {
  const narrationUrl = (n: number) => `/api/stories/s1/pages/${n}/narration`
  function stub(pages: Record<number, PageView>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const n = Number(url.split('/').pop())
        return new Response(JSON.stringify({ page: pages[n] }))
      }),
    )
  }

  it('offers play and pause only while narration is active; activating it starts nothing by itself', async () => {
    const first = page({ narrationUrl: narrationUrl(1) })
    stub({ 1: first })
    markPageRead('s1', 1)
    render(<Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={1} initialPage={first} />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /the narrator/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('radio', { name: 'active' }))
    expect(screen.getByRole('radio', { name: 'active' }).getAttribute('aria-checked')).toBe('true')
    expect(narrator.plays).toHaveLength(0)
    fireEvent.click(screen.getByText('Back to the story'))

    // Nothing loaded yet: play reads the page from the top of the screen.
    fireEvent.click(screen.getByRole('button', { name: 'Play the narrator' }))
    expect(narrator.plays).toHaveLength(1)
    act(() => narrator.plays[0].handlers.onStart(performance.now()))
    expect(screen.getByRole('button', { name: 'Pause the narrator' }).getAttribute('aria-pressed')).toBe('true')
    // Finished: play starts it again.
    act(() => narrator.plays[0].handlers.onEnd())
    fireEvent.click(screen.getByRole('button', { name: 'Play the narrator' }))
    expect(narrator.plays).toHaveLength(2)
  })

  it('reads from a tapped paragraph, and marks the paragraph being read', async () => {
    const text = 'One two three.\n\nFour five six.\n\nSeven eight nine.'
    const first = page({ text, narrationUrl: narrationUrl(1) })
    stub({ 1: first })
    markPageRead('s1', 1)
    updateSettings({ narration: true })
    const { container } = render(
      <Book storyId="s1" storyTitle="T" premise="P" theme="historic-fantasy" initialNumber={1} initialPage={first} />,
    )
    await act(async () => {})
    // A page read before is not read again by itself; tapping a paragraph reads from there.
    expect(narrator.plays).toHaveLength(0)
    expect(container.querySelector('[data-page="1"] .tap-hint')!.textContent).toBe('tap a paragraph to hear it')
    const estimated = spokenTimes(text, estimateSpokenMs(text))
    fireEvent.click(container.querySelector('[data-page="1"] p[data-p="2"] .word')!)
    const play = narrator.plays[0]
    expect(play.seeks).toEqual([estimated[6] - 150])
    act(() => play.handlers.onStart(performance.now()))

    // With the reading under way, another paragraph jumps within it.
    fireEvent.click(container.querySelector('[data-page="1"] p[data-p="1"] .word')!)
    expect(play.seeks.at(-1)).toBe(estimated[3] - 150)
    expect(narrator.plays).toHaveLength(1)
    expect(container.querySelector('[data-page="1"] p[data-p="1"]')!.className).toBe('speaking')
  })
})

describe('paragraph alignment', () => {
  /** A fake recording: a burst of "speech" for each span, silence between. */
  function recording(spans: [number, number][], totalMs: number, rate = 8000) {
    const data = new Float32Array(Math.round((totalMs / 1000) * rate))
    for (const [from, to] of spans) {
      for (let i = Math.round((from / 1000) * rate); i < Math.round((to / 1000) * rate); i++) data[i] = Math.sin(i / 3) * 0.5
    }
    return { data, rate }
  }

  it('finds the narrator’s pauses', () => {
    const { data, rate } = recording([[300, 2000], [2100, 4000], [4900, 7000]], 7400)
    const pauses = findPauses(data, rate)
    // The 100ms breath is too short to count; the opening, the 900ms gap and the tail are pauses.
    expect(pauses.map((p) => [p.start, p.end])).toEqual([[0, 300], [4000, 4900], [7000, 7400]])
  })

  it('snaps each paragraph to the pause nearest its estimate, and times words within paragraphs', () => {
    const text = 'Alpha beta gamma delta.\n\nEpsilon zeta eta theta.'
    // The second paragraph really starts at 5s, later than an even estimate would say.
    const { data, rate } = recording([[300, 3900], [3950, 4200], [5000, 8000]], 8500)
    const starts = paragraphStarts(text, data, rate)
    expect(starts[0]).toBe(220)
    expect(starts[1]).toBe(4920)
    const times = alignedTimes(text, starts, 8500)
    expect(times[4]).toBe(4980)
    expect(times[3]).toBeLessThan(4920)
  })
})

describe('the cover’s voice choice', () => {
  const seed = { label: 'an old sea dog', style: 'Growl it.', voice: 'fenrir', treatment: 'none' as const }
  function stub(locked = false) {
    const posts: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/map'))
          return new Response(JSON.stringify({ pages: [], canNarrate: true, voice: { chosen: 'suggested', suggestion: seed, locked } }))
        if (url.endsWith('/voice')) {
          const body = JSON.parse(String(init?.body))
          posts.push(body)
          const suggestion = body.action ? { ...seed, label: 'a grand old actor' } : seed
          return new Response(JSON.stringify({ voice: { chosen: body.choose ?? 'suggested', suggestion, locked: false } }))
        }
        return new Response('{}')
      }),
    )
    return posts
  }
  const cover = () => render(<Book storyId="s1" storyTitle="T" premise="P" theme="pirate" initialNumber={0} initialPage={null} />)

  it('lets the reader hear the standard and suggested narrators read the summary, choose one, or ask for another idea', async () => {
    const posts = stub()
    cover()
    await act(async () => {})
    expect(screen.getByRole('radio', { name: 'an old sea dog' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Growl it.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Hear Standard narrator' }))
    expect(narrator.plays.at(-1)!.url).toBe('/api/stories/s1/voice/preview?which=standard')
    fireEvent.click(screen.getByRole('button', { name: 'Hear an old sea dog' }))
    expect(narrator.plays.at(-2)!.stopped).toBe(true)
    expect(narrator.plays.at(-1)!.url).toBe('/api/stories/s1/voice/preview?which=suggested')

    fireEvent.click(screen.getByRole('radio', { name: 'Standard narrator' }))
    expect(screen.getByRole('radio', { name: 'Standard narrator' }).getAttribute('aria-checked')).toBe('true')
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'another idea' }))
    await act(async () => {})
    expect(posts).toEqual([{ choose: 'standard' }, { action: 'suggest' }])
    expect(screen.getByRole('radio', { name: 'a grand old actor' })).toBeTruthy()
  })

  it('reads the summary aloud in the chosen voice when it is tapped, and stops on a second tap', async () => {
    stub()
    cover()
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Read the summary aloud' }))
    expect(narrator.plays.at(-1)!.url).toBe('/api/stories/s1/voice/preview?which=suggested')
    fireEvent.click(screen.getByRole('button', { name: 'Stop reading the summary' }))
    expect(narrator.plays.at(-1)!.stopped).toBe(true)
  })

  it('stays on the cover when swiped until Begin confirms the voice', async () => {
    const posts = stub()
    cover()
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await act(async () => {})
    expect(document.querySelector('[data-testid=current-page]')!.getAttribute('data-leaf')).toBe('cover')
    expect(posts).toEqual([])
    fireEvent.click(document.querySelector('.cover-begin')!)
    await act(async () => {})
    expect(posts).toEqual([{ action: 'confirm' }])
  })

  it('once the tale has been read aloud, just says who reads it', async () => {
    stub(true)
    cover()
    await act(async () => {})
    expect(screen.queryByRole('radio', { name: 'an old sea dog' })).toBeNull()
    expect(screen.getByText('Read aloud by an old sea dog')).toBeTruthy()
    // The summary still reads itself aloud, in the voice the tale has.
    fireEvent.click(screen.getByRole('button', { name: 'Read the summary aloud' }))
    expect(narrator.plays.at(-1)!.url).toBe('/api/stories/s1/voice/preview?which=suggested')
  })
})
