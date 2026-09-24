import { describe, expect, it } from 'vitest'
import { biblePrompt, illustrationPrompt, pagePrompt, type PageRequest } from '@/lib/story/prompts'
import { bibleSchema, newStoryRequestSchema, pageDraftJsonSchema, pageDraftSchema } from '@/lib/story/schema'
import { historicFantasy } from '@/lib/themes'

const bible = {
  title: 'The Salt Crown',
  premise: 'A crown lies under the marsh.',
  world: 'A drowned kingdom of reeds and bells.',
  characters: [{ name: 'Isolde Vane', description: 'A ferrywoman who never smiles.' }],
  rules: ['The marsh gives nothing back for free.'],
}

const base: PageRequest = {
  bible,
  theme: historicFantasy,
  config: { theme: 'historic-fantasy', hero: 'a falconer', setting: 'a salt marsh', tone: 'eerie' },
  path: [],
  facts: [],
  choiceText: null,
  mustEnd: false,
  choicesCount: 2,
  depth: 0,
  maxDepth: 8,
}

describe('biblePrompt', () => {
  it('includes the reader’s choices and the theme voice', () => {
    const prompt = biblePrompt(base.config, historicFantasy)
    expect(prompt).toContain('a falconer')
    expect(prompt).toContain('a salt marsh')
    expect(prompt).toContain('eerie')
    expect(prompt).toContain('illuminated storybook')
  })
})

describe('pagePrompt', () => {
  it('asks for an opening on the first page', () => {
    const prompt = pagePrompt(base)
    expect(prompt).toContain('Write the opening page')
    expect(prompt).toContain('exactly 2 choices')
    expect(prompt).toContain('Isolde Vane')
    expect(prompt).toContain('The marsh gives nothing back for free.')
    expect(prompt).toContain('No facts have been established yet')
  })

  it('carries the path, the choice and the facts with their ids', () => {
    const prompt = pagePrompt({
      ...base,
      depth: 3,
      path: [
        { text: 'You wake in the reeds.', choiceText: null },
        { text: 'The bell tolls.', choiceText: 'Follow the bell' },
      ],
      facts: [{ id: 'p40.1', text: 'You carry a silver whistle.' }],
      choiceText: 'Blow the whistle',
    })
    expect(prompt).toContain('You wake in the reeds.')
    expect(prompt).toContain('(The reader chose: Follow the bell)')
    expect(prompt).toContain('[p40.1] You carry a silver whistle.')
    expect(prompt).toContain('The reader chose: Blow the whistle')
    expect(prompt).not.toContain('Write the opening page')
  })

  it('demands an ending with no choices when the page must end', () => {
    const prompt = pagePrompt({ ...base, mustEnd: true, depth: 8 })
    expect(prompt).toContain('This page is an ENDING')
    expect(prompt).not.toContain('exactly 2 choices')
  })

  it('lists the sketch library and discourages repeating the last sketch', () => {
    const prompt = pagePrompt({ ...base, previousSketch: 'lantern' })
    expect(prompt).toContain('- lighthouse: a lighthouse on rocks')
    expect(prompt).toContain('The previous page showed "lantern"')
    expect(pagePrompt(base)).not.toContain('The previous page showed')
  })

  it('raises the stakes near the end', () => {
    expect(pagePrompt({ ...base, depth: 6 })).toContain('nearing its end')
    expect(pagePrompt({ ...base, depth: 2 })).not.toContain('nearing its end')
  })
})

describe('illustrationPrompt', () => {
  it('adds the theme’s ink-sketch style to the subject', () => {
    const prompt = illustrationPrompt('a lantern on a branch', historicFantasy)
    expect(prompt.startsWith('a lantern on a branch.')).toBe(true)
    expect(prompt).toContain('black ink sketch')
    expect(prompt).toContain('no text')
  })
})

describe('schemas', () => {
  it('accepts a well-formed page draft', () => {
    const draft = pageDraftSchema.parse({
      text: 'You step into the fog.',
      choices: ['Go left', 'Go right'],
      newFacts: ['You are soaked.'],
      retiredFactIds: [],
      endingTitle: '',
      sketch: 'door',
      illustrationPrompt: 'a fogbound gate',
    })
    expect(draft.choices).toHaveLength(2)
  })

  it('rejects empty text and too many choices', () => {
    const good = {
      text: 'x',
      choices: [],
      newFacts: [],
      retiredFactIds: [],
      endingTitle: '',
      sketch: 'none',
      illustrationPrompt: 'y',
    }
    expect(() => pageDraftSchema.parse({ ...good, text: '  ' })).toThrow()
    expect(() => pageDraftSchema.parse({ ...good, choices: ['a', 'b', 'c', 'd', 'e'] })).toThrow()
  })

  it('requires at least one character and rule in a bible', () => {
    expect(() => bibleSchema.parse({ ...bible, characters: [] })).toThrow()
    expect(() => bibleSchema.parse({ ...bible, rules: [] })).toThrow()
    expect(bibleSchema.parse(bible).title).toBe('The Salt Crown')
  })

  it('exports a JSON schema the model can follow', () => {
    const schema = pageDraftJsonSchema as { type: string; required: string[] }
    expect(schema.type).toBe('object')
    expect(schema).not.toHaveProperty('$schema')
    expect(schema.required).toEqual(
      expect.arrayContaining(['text', 'choices', 'newFacts', 'retiredFactIds', 'sketch', 'illustrationPrompt']),
    )
  })

  it('validates new-story requests', () => {
    expect(newStoryRequestSchema.parse({})).toEqual({})
    expect(newStoryRequestSchema.parse({ hero: '  a bard  ' }).hero).toBe('a bard')
    expect(() => newStoryRequestSchema.parse({ theme: 'space-opera' })).toThrow()
    expect(() => newStoryRequestSchema.parse({ hero: 'x'.repeat(500) })).toThrow()
  })
})
