// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Book } from '@/components/Book'
import { PageLeaf } from '@/components/PageLeaf'
import { RevealText } from '@/components/RevealText'
import { Sketch } from '@/components/Sketch'
import { markPageRead } from '@/components/readPages'
import type { PageView } from '@/lib/story/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RevealText', () => {
  it('splits paragraphs into words with a drop cap on the first letter', () => {
    const { container } = render(<RevealText text={'Once upon\n\na time'} revealed={false} />)
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(container.querySelector('.drop-cap')!.textContent).toBe('O')
    expect(container.querySelectorAll('.word')).toHaveLength(5) // drop cap + "nce", upon, a, time
    expect(container.querySelector('.prose')!.className).not.toContain('revealed')
  })

  it('calls onDone after the last word has had time to appear', () => {
    const onDone = vi.fn()
    render(<RevealText text="one two three" revealed={false} pace={100} onDone={onDone} />)
    act(() => vi.advanceTimersByTime(600))
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(200))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('finishes at once when revealed', () => {
    const onDone = vi.fn()
    const { container } = render(<RevealText text="one two" revealed onDone={onDone} />)
    expect(onDone).toHaveBeenCalled()
    expect(container.querySelector('.prose')!.className).toContain('revealed')
  })
})

describe('PageLeaf', () => {
  const noop = () => {}
  const props = { storyId: 's1', storyTitle: 'The Salt Crown', theme: 'historic-fantasy' as const, number: 1, onRetry: noop, onRead: noop }

  it('shows the quill while the page is being written', () => {
    render(<PageLeaf {...props} state={{ kind: 'loading' }} alreadyRead={false} onChoose={noop} />)
    expect(screen.getByRole('status').textContent).toContain('ink is still wet')
  })

  it('hides choices until the text is read, then shows turn-to page numbers', () => {
    const onChoose = vi.fn()
    const onRead = vi.fn()
    render(
      <PageLeaf {...props} onRead={onRead} state={{ kind: 'ready', page: page() }} alreadyRead={false} onChoose={onChoose} />,
    )
    expect(screen.queryByRole('navigation', { name: 'Choices' })).toBeNull()
    fireEvent.click(screen.getByTestId('page-text'))
    const nav = screen.getByRole('navigation', { name: 'Choices' })
    expect(nav.textContent).toContain('turn to 43')
    expect(nav.textContent).toContain('no one has gone this way')
    expect(onRead).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByText('Climb the tower stair'))
    expect(onChoose).toHaveBeenCalledWith(43)
  })

  it('shows the ending with ways back', () => {
    const onChoose = vi.fn()
    render(
      <PageLeaf
        {...props}
        number={77}
        state={{ kind: 'ready', page: page({ number: 77, parent: 43, isEnding: true, endingTitle: 'The Last Bell', choices: [], visits: 1 }) }}
        alreadyRead
        onChoose={onChoose}
      />,
    )
    expect(screen.getByText('Finis')).toBeTruthy()
    expect(screen.getByText('The Last Bell')).toBeTruthy()
    expect(screen.getByText('You are the first to find this ending')).toBeTruthy()
    fireEvent.click(screen.getByText('Go back and choose differently'))
    expect(onChoose).toHaveBeenCalledWith(43)
    fireEvent.click(screen.getByText('Begin the tale again'))
    expect(onChoose).toHaveBeenCalledWith(1)
  })

  it('offers a retry when writing failed', () => {
    const onRetry = vi.fn()
    render(<PageLeaf {...props} onRetry={onRetry} state={{ kind: 'error', message: 'The quill slipped.' }} alreadyRead={false} onChoose={noop} />)
    fireEvent.click(screen.getByText('Try the page again'))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('PageLeaf themes', () => {
  const noop = () => {}

  it('speaks in the future theme’s idiom', () => {
    render(
      <PageLeaf
        storyId="s1"
        storyTitle="T"
        theme="future"
        number={1}
        state={{ kind: 'ready', page: page() }}
        alreadyRead
        onChoose={noop}
        onRetry={noop}
        onRead={noop}
      />,
    )
    expect(screen.getByLabelText('Page 1').textContent).toBe('LOG 001')
    const nav = screen.getByRole('navigation', { name: 'Choices' })
    expect(nav.textContent).toContain('jump to LOG 043')
    expect(nav.textContent).toContain('uncharted')
  })

  it('closes a noir case with a stamp', () => {
    render(
      <PageLeaf
        storyId="s1"
        storyTitle="T"
        theme="noir"
        number={9}
        state={{ kind: 'ready', page: page({ number: 9, isEnding: true, endingTitle: 'Rain Check', choices: [], visits: 4 }) }}
        alreadyRead
        onChoose={noop}
        onRetry={noop}
        onRead={noop}
      />,
    )
    expect(screen.getByText('Case Closed')).toBeTruthy()
    expect(screen.getByText('4 detectives closed it this way')).toBeTruthy()
  })

  it('shows the theme’s waiting message', () => {
    render(
      <PageLeaf storyId="s1" storyTitle="T" theme="pirate" number={3} state={{ kind: 'loading' }} alreadyRead={false} onChoose={noop} onRetry={noop} onRead={noop} />,
    )
    expect(screen.getByRole('status').textContent).toContain('Charting the course')
  })
})

describe('Sketch', () => {
  it('reveals an image that finished loading before hydration', () => {
    // jsdom never loads images; fake one that is already complete, then restore jsdom's getters.
    const proto = HTMLImageElement.prototype
    const saved = ['complete', 'naturalWidth'].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const)
    Object.defineProperty(proto, 'complete', { configurable: true, get: () => true })
    Object.defineProperty(proto, 'naturalWidth', { configurable: true, get: () => 150 })
    try {
      const { container } = render(<Sketch src="/x.svg" appearAfter={0} />)
      expect((container.querySelector('img') as HTMLImageElement).style.visibility).toBe('')
    } finally {
      for (const [k, d] of saved) {
        if (d) Object.defineProperty(proto, k, d)
        else delete (proto as unknown as Record<string, unknown>)[k]
      }
    }
  })

  it('stays hidden until the image loads, then appears', () => {
    const { container } = render(<Sketch src="/x.svg" appearAfter={0} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.style.visibility).toBe('hidden')
    fireEvent.load(img)
    expect(img.style.visibility).toBe('')
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
      const n = Number(url.split('/').pop())
      return new Response(JSON.stringify({ page: pages[n] }), { status: pages[n] ? 200 : 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('turns forward to a later page, updating the URL, then settles', async () => {
    stubFetch({ 1: page(), 43: page({ number: 43, parent: 1, text: 'You climb.' }) })
    const push = vi.spyOn(window.history, 'pushState')
    markPageRead('s1', 1)
    const { container } = render(<Book storyId="s1" storyTitle="T" theme="historic-fantasy" initialNumber={1} initialPage={page()} />)
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
    const { container } = render(<Book storyId="s1" storyTitle="T" theme="historic-fantasy" initialNumber={43} initialPage={from} />)
    await act(async () => {})
    fireEvent.click(screen.getByText('Hide and watch'))
    // The earlier page swings in over the current one.
    expect(container.querySelector('.leaf.turning.backward')!.getAttribute('data-page')).toBe('12')
    expect(container.querySelector('.leaf.under')!.getAttribute('data-page')).toBe('43')
  })

  it('handles the browser back button with a backward turn', async () => {
    stubFetch({ 1: page(), 43: page({ number: 43, parent: 1 }) })
    markPageRead('s1', 43)
    const { container } = render(<Book storyId="s1" storyTitle="T" theme="historic-fantasy" initialNumber={43} initialPage={page({ number: 43 })} />)
    await act(async () => {})
    window.history.replaceState(null, '', '/s/s1/1')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(container.querySelector('.leaf.turning.backward')!.getAttribute('data-page')).toBe('1')
  })

  it('loads a page that was not ready on the server, showing the quill meanwhile', async () => {
    const fetchMock = stubFetch({ 5: page({ number: 5 }) })
    render(<Book storyId="s1" storyTitle="T" theme="historic-fantasy" initialNumber={5} initialPage={null} />)
    expect(screen.getByRole('status')).toBeTruthy()
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledWith('/api/stories/s1/pages/5')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows an error with retry when the page cannot be written', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'The quill slipped.' }), { status: 502 })))
    render(<Book storyId="s1" storyTitle="T" theme="historic-fantasy" initialNumber={9} initialPage={null} />)
    await act(async () => {})
    expect(screen.getByText('The quill slipped.')).toBeTruthy()
  })
})
