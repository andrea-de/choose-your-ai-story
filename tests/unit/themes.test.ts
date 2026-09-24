import { describe, expect, it } from 'vitest'
import { MockStoryTeller, PHRASEBOOKS, SKETCHES } from '@/lib/ai/mock'
import { pagePrompt } from '@/lib/story/prompts'
import { newStoryRequestSchema } from '@/lib/story/schema'
import { allThemes, getTheme, themeIds, toRoman } from '@/lib/themes'

describe('themes', () => {
  it('offers the five kinds of book', () => {
    expect(themeIds).toEqual(['historic-fantasy', 'future', 'noir', 'pirate', 'ancient'])
  })

  it('writes Roman numerals', () => {
    expect([1, 4, 9, 14, 40, 43, 90, 99, 198, 383, 400].map(toRoman)).toEqual([
      'I', 'IV', 'IX', 'XIV', 'XL', 'XLIII', 'XC', 'XCIX', 'CXCVIII', 'CCCLXXXIII', 'CD',
    ])
  })

  it.each(allThemes.map((t) => [t.id, t] as const))('%s is complete', (_id, theme) => {
    expect(theme.name).toBeTruthy()
    expect(theme.tagline).toBeTruthy()
    expect(theme.narration).toMatch(/second person/i)
    expect(theme.narration).toMatch(/family-friendly/i)
    expect(theme.illustration).toMatch(/white background/i)
    expect(theme.illustration).toMatch(/no text/i)
    expect(theme.heroes.length).toBeGreaterThanOrEqual(6)
    expect(theme.settings.length).toBeGreaterThanOrEqual(6)
    expect(theme.tones.length).toBeGreaterThanOrEqual(4)
    for (const value of Object.values(theme.ui)) {
      if (typeof value === 'string') expect(value.trim()).not.toBe('')
    }
    expect(theme.ui.pace).toBeGreaterThan(0)
    expect(theme.ui.foundBy(3)).toContain('3')
  })

  it('writes page numbers in each theme’s idiom', () => {
    expect(getTheme('historic-fantasy').ui.pageLabel(43)).toBe('43')
    expect(getTheme('future').ui.pageLabel(7)).toBe('LOG 007')
    expect(getTheme('future').ui.pageLabel(312)).toBe('LOG 312')
    expect(getTheme('noir').ui.pageLabel(43)).toBe('No. 43')
    expect(getTheme('pirate').ui.pageLabel(43)).toBe('43')
    expect(getTheme('ancient').ui.pageLabel(43)).toBe('XLIII')
  })

  it('shows symbols as text, not colour emoji', () => {
    for (const theme of allThemes) {
      for (const mark of [theme.ui.fleuron, theme.ui.endMark]) {
        // Code points that default to emoji presentation must carry VS15.
        if (/[⚓☠]/.test(mark)) expect(mark).toContain('︎')
      }
    }
  })

  it('falls back to historic fantasy for an unknown id', () => {
    expect(getTheme('nope' as never).id).toBe('historic-fantasy')
  })

  it('accepts every theme when starting a story', () => {
    for (const id of themeIds) expect(newStoryRequestSchema.parse({ theme: id }).theme).toBe(id)
  })

  it('puts the theme’s voice into the page prompt', () => {
    const theme = getTheme('noir')
    const prompt = pagePrompt({
      bible: { title: 'T', premise: 'P', world: 'W', characters: [{ name: 'n', description: 'd' }], rules: ['r'] },
      theme,
      config: { theme: 'noir', hero: 'h', setting: 's', tone: 't' },
      path: [],
      facts: [],
      choiceText: null,
      mustEnd: false,
      choicesCount: 2,
      depth: 0,
      maxDepth: 8,
    })
    expect(prompt).toContain('hardboiled')
  })
})

describe('mock storyteller per theme', () => {
  it('has a sketch for every item it can name', () => {
    for (const [id, book] of Object.entries(PHRASEBOOKS)) {
      for (const item of book.items) {
        expect(Object.keys(SKETCHES).some((k) => item.includes(k)), `${id}: ${item}`).toBe(true)
      }
    }
  })

  it.each(themeIds)('writes %s pages from its own phrasebook', async (id) => {
    const teller = new MockStoryTeller()
    const theme = getTheme(id)
    const config = { theme: id, hero: theme.heroes[0], setting: theme.settings[0], tone: theme.tones[0] }
    const bible = await teller.writeBible(config)
    expect(bible.premise).toContain(PHRASEBOOKS[id].premiseHook)
    const page = await teller.writePage({
      bible,
      theme,
      config,
      path: [],
      facts: [],
      choiceText: null,
      mustEnd: false,
      choicesCount: 2,
      depth: 0,
      maxDepth: 8,
    })
    expect(PHRASEBOOKS[id].openings.some((o) => page.text.startsWith(o))).toBe(true)
    for (const c of page.choices) expect(PHRASEBOOKS[id].choices).toContain(c)
  })
})
