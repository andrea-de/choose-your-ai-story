import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, GeminiStoryTeller, type GenAiClient } from '@/lib/ai/gemini'
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
})
