import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_SPEECH_MODEL,
  DEFAULT_TEXT_MODEL,
  GeminiStoryTeller,
  withRetry,
  type GenAiClient,
} from '@/lib/ai/gemini'
import { historicFantasy } from '@/lib/themes'
import type { PageRequest } from '@/lib/story/prompts'

function fakeClient(response: object) {
  const generateContent = vi.fn(async () => response)
  return { client: { models: { generateContent } } as unknown as GenAiClient, generateContent }
}

const config = { theme: 'historic-fantasy' as const, hero: 'a bard', setting: 'a fair', tone: 'hopeful' }
const bible = {
  title: 'The Fair',
  premise: 'p',
  heart: 'h',
  goal: 'g',
  danger: 'd',
  world: 'w',
  characters: [{ name: 'Ann', description: 'd' }],
  rules: ['r'],
}

describe('GeminiStoryTeller', () => {
  it('needs a key or a client', () => {
    expect(() => new GeminiStoryTeller({})).toThrow()
  })

  it('asks for structured JSON and validates the bible', async () => {
    const { client, generateContent } = fakeClient({ text: JSON.stringify(bible) })
    const teller = new GeminiStoryTeller({ client })
    expect(await teller.writeBible(config, historicFantasy)).toEqual(bible)
    const call = (generateContent.mock.calls[0] as unknown[])[0] as {
      model: string
      config: { responseMimeType: string; responseJsonSchema: { type: string } }
    }
    expect(call.model).toBe(DEFAULT_TEXT_MODEL)
    expect(call.config.responseMimeType).toBe('application/json')
    expect(call.config.responseJsonSchema.type).toBe('object')
  })

  it('writes a page with the configured model', async () => {
    const draft = {
      text: 'You arrive.',
      choices: ['Sing', 'Dance'],
      newFacts: [],
      retiredFactIds: [],
      endingTitle: '',
      sketch: 'scroll',
      mood: 'mirth',
      illustrationPrompt: 'a lute',
    }
    const { client, generateContent } = fakeClient({ text: JSON.stringify(draft) })
    const teller = new GeminiStoryTeller({ client, textModel: 'custom-model' })
    const req: PageRequest = {
      bible,
      theme: historicFantasy,
      config,
      path: [],
      facts: [],
      choiceText: null,
      mustEnd: false,
      choicesCount: 2,
      depth: 0,
      maxDepth: 8,
    }
    expect(await teller.writePage(req)).toEqual(draft)
    expect((generateContent.mock.calls[0] as unknown[])[0]).toMatchObject({ model: 'custom-model' })
  })

  it('rejects output that breaks the schema or is empty', async () => {
    const bad = new GeminiStoryTeller({ client: fakeClient({ text: JSON.stringify({ title: 'x' }) }).client })
    await expect(bad.writeBible(config, historicFantasy)).rejects.toThrow()
    const empty = new GeminiStoryTeller({ client: fakeClient({ text: '' }).client })
    await expect(empty.writeBible(config, historicFantasy)).rejects.toThrow(/empty/)
  })

  it('returns the first inline image and asks for a square sketch', async () => {
    const data = Buffer.from([137, 80, 78, 71]).toString('base64')
    const { client, generateContent } = fakeClient({
      candidates: [{ content: { parts: [{ text: 'here you go' }, { inlineData: { mimeType: 'image/png', data } }] } }],
    })
    const teller = new GeminiStoryTeller({ client })
    const img = await teller.drawIllustration('a lute', historicFantasy)
    expect(img.mimeType).toBe('image/png')
    expect([...img.data]).toEqual([137, 80, 78, 71])
    const call = (generateContent.mock.calls[0] as unknown[])[0] as { model: string; contents: string; config: object }
    expect(call.model).toBe(DEFAULT_IMAGE_MODEL)
    expect(call.contents).toContain('black ink sketch')
    expect(call.config).toMatchObject({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } })
  })

  it('fails clearly when no image comes back', async () => {
    const teller = new GeminiStoryTeller({ client: fakeClient({ candidates: [] }).client })
    await expect(teller.drawIllustration('x', historicFantasy)).rejects.toThrow(/no image/)
  })

  /** A fake Interactions endpoint that streams these events as server-sent events, split across network chunks. */
  function fakeSpeech(events: object[]) {
    const text = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'
    const bytes = new TextEncoder().encode(text)
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37))
          c.close()
        },
      })
      return new Response(body)
    }) as unknown as typeof fetch
    return { fetchFn, calls }
  }
  const delta = (bytes: number[], mime = 'audio/l16') => ({
    event_type: 'step.delta',
    delta: { mime_type: mime, data: Buffer.from(bytes).toString('base64') },
  })
  const teller = (fetchFn: typeof fetch) => new GeminiStoryTeller({ apiKey: 'k', fetch: fetchFn })
  async function collect(chunks: AsyncIterable<Uint8Array>) {
    const out: number[] = []
    for await (const c of chunks) out.push(...c)
    return out
  }

  it('streams a page aloud with the cast voice and a short style, as Google’s speech guide recommends', async () => {
    const { fetchFn, calls } = fakeSpeech([{ event_type: 'step.start' }, delta([1, 2]), delta([3, 4])])
    expect(await collect(teller(fetchFn).narrate({ theme: 'noir', tone: 'hardboiled', mood: 'peril', text: 'Run.' }))).toEqual([1, 2, 3, 4])
    const { url, body } = calls[0]
    expect(url).toMatch(/\/interactions\?alt=sse$/)
    expect(body).toMatchObject({
      model: DEFAULT_SPEECH_MODEL,
      stream: true,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: 'en-us-storyteller-9' }] },
    })
    const content = (body.input as { content: { text: string; annotations: { style: string }[] }[] }[])[0].content[0]
    // The page itself is the text: no instructions in it to be read out.
    expect(content.text).toBe('Run.')
    expect(content.annotations[0]).toEqual({ type: 'speech_metadata', style: 'dry, world-weary, deadpan; hard, flat; urgent, quick' })
  })

  it('refuses audio at a rate the player does not expect', async () => {
    const { fetchFn } = fakeSpeech([delta([1, 2], 'audio/l16;rate=16000')])
    await expect(collect(teller(fetchFn).narrate({ theme: 'future', tone: 'cosmic', text: 'x' }))).rejects.toThrow(/rate/)
  })

  it('fails when no audio comes back, or the service says no', async () => {
    const { fetchFn } = fakeSpeech([{ event_type: 'step.start' }])
    await expect(collect(teller(fetchFn).narrate({ theme: 'future', tone: 'cosmic', text: 'x' }))).rejects.toThrow(/no audio/)
    const refused = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch
    await expect(collect(teller(refused).narrate({ theme: 'future', tone: 'cosmic', text: 'x' }))).rejects.toThrow(/429/)
  })

  it('suggests a person to read the tale, never a treated voice, with a short name', async () => {
    const { client } = fakeClient({ text: JSON.stringify({ label: 'a grizzled old harbour pilot', voice: 'en-gb-storyteller-4', style: 'gruff, amused' }) })
    const idea = await new GeminiStoryTeller({ client }).suggestVoice({
      theme: historicFantasy,
      config,
      premise: 'P',
      previous: [],
    })
    expect(idea).toEqual({ label: 'Grizzled old harbour', voice: 'en-gb-storyteller-4', style: 'gruff, amused', treatment: 'none' })
  })

  it('reports what each call cost in tokens, thinking included', async () => {
    const draft = { text: 'You arrive.', choices: ['Sing', 'Dance'], newFacts: [], retiredFactIds: [], endingTitle: '', sketch: 'none', mood: 'hush', illustrationPrompt: 'a lute' }
    const { client } = fakeClient({ text: JSON.stringify(draft), usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 400, thoughtsTokenCount: 250 } })
    const meter = vi.fn()
    const writer = new GeminiStoryTeller({ client })
    await writer.writePage({ bible, theme: historicFantasy, config, path: [], facts: [], choiceText: null, mustEnd: false, choicesCount: 2, depth: 0, maxDepth: 8 }, meter)
    expect(meter).toHaveBeenCalledWith({ kind: 'text', model: DEFAULT_TEXT_MODEL, inputTokens: 3000, outputTokens: 650 })

    const { fetchFn } = fakeSpeech([
      delta([1, 2]),
      { event_type: 'interaction.completed', interaction: { usage: { total_input_tokens: 90, total_output_tokens: 1500 } } },
    ])
    const speechMeter = vi.fn()
    await collect(teller(fetchFn).narrate({ theme: 'noir', tone: 'wry', text: 'Run.' }, speechMeter))
    expect(speechMeter).toHaveBeenCalledWith({ kind: 'speech', model: DEFAULT_SPEECH_MODEL, inputTokens: 90, outputTokens: 1500 })
  })
})

describe('withRetry', () => {
  it('tries again when Gemini is briefly overloaded, and gives up on anything else', async () => {
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls < 3) throw Object.assign(new Error('high demand'), { status: 503 })
      return 'ok'
    }
    expect(await withRetry(flaky, [0, 0])).toBe('ok')
    expect(calls).toBe(3)
    let bad = 0
    await expect(
      withRetry(async () => {
        bad++
        throw Object.assign(new Error('nope'), { status: 400 })
      }, [0, 0]),
    ).rejects.toThrow('nope')
    expect(bad).toBe(1)
  })
})
