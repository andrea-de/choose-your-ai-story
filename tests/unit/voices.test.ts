import { describe, expect, it } from 'vitest'
import { pagePrompt, voicePrompt } from '@/lib/story/prompts'
import { LABEL_MAX, pageDraftJsonSchema, shortLabel } from '@/lib/story/schema'
import { getTheme, themeIds } from '@/lib/themes'
import { castIds } from '@/lib/voiceCast'
import {
  isMood,
  moods,
  narrationStyle,
  narratorTreatment,
  narratorVoice,
  PLAIN_NARRATOR,
  presetFor,
  seedSuggestion,
  TREATED_NARRATORS,
  type VoiceSuggestion,
} from '@/lib/voices'

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

describe('narrators', () => {
  it.each(themeIds)('%s has its own narrator and treated ones, all short, all cast from the voice list', (id) => {
    const all: VoiceSuggestion[] = [seedSuggestion(id), ...TREATED_NARRATORS[id]]
    for (const n of all) {
      expect(words(n.label), n.label).toBeLessThanOrEqual(3)
      expect(n.label.length, n.label).toBeLessThanOrEqual(LABEL_MAX)
      expect(words(n.style), n.style).toBeLessThanOrEqual(6)
      expect(castIds, `${id}: ${n.voice}`).toContain(n.voice)
    }
    for (const n of TREATED_NARRATORS[id]) expect(n.treatment, n.label).not.toBe('none')
  })

  it('makes every other new idea one of the book’s treated voices, round and round', () => {
    expect(presetFor('future', 1)).toBeNull()
    expect(presetFor('future', 2)?.label).toBe('Repair droid')
    expect(presetFor('future', 3)).toBeNull()
    expect(presetFor('future', 4)?.label).toBe('Station AI')
    expect(presetFor('future', 6)?.label).toBe('Mission control')
    // Back to the ship's computer, the book's own.
    expect(presetFor('future', 8)).toEqual(seedSuggestion('future'))
    expect(seedSuggestion('future').treatment).toBe('robot')
  })

  it('reads in a short style: the narrator’s own, the tale’s moods and the page’s, each word once', () => {
    const narrator = { kind: 'suggested' as const, suggestion: seedSuggestion('pirate') }
    expect(narrationStyle({ theme: 'pirate', tone: 'funny and spooky', mood: 'peril', narrator })).toBe(
      'gruff, swaggering, amused; eerie; urgent, quick',
    )
    expect(narrationStyle({ theme: 'pirate', tone: 'epic', isEnding: true, narrator: { kind: 'standard' } })).toBe(
      'warm, clear; grand; slowing to a close',
    )
    // Tales from before styles fall back to their book's own.
    const old = { kind: 'suggested' as const, suggestion: { ...seedSuggestion('noir'), style: '' } }
    expect(narrationStyle({ theme: 'noir', tone: 'a mood nobody offers', narrator: old })).toBe(seedSuggestion('noir').style)
  })

  it('casts the right voice, and copes with older tales’ capitalised studio voices', () => {
    const suggested = (voice: string) => ({ kind: 'suggested' as const, suggestion: { ...seedSuggestion('pirate'), voice } })
    expect(narratorVoice('pirate', { kind: 'standard' })).toBe(PLAIN_NARRATOR.voice)
    expect(narratorVoice('pirate')).toBe('en-gb-storyteller-4')
    expect(narratorVoice('pirate', suggested('Fenrir'))).toBe('fenrir')
    expect(narratorVoice('pirate', suggested('nobody'))).toBe('en-gb-storyteller-4')
  })

  it('gives treated narrators their sound, and the standard one none', () => {
    expect(narratorTreatment('future')).toBe('robot')
    expect(narratorTreatment('future', { kind: 'standard' })).toBe('none')
  })

  it('asks for a short name, a cast voice and a few words of sound, and nothing about origins', () => {
    const prompt = voicePrompt({
      theme: getTheme('pirate'),
      config: { theme: 'pirate', hero: 'h', setting: 's', tone: 'funny' },
      premise: 'P.',
      previous: [seedSuggestion('pirate')],
    })
    expect(prompt).toContain('two or three words, at most 20 characters')
    expect(prompt).toContain('- en-gb-storyteller-4: Bristol English, male, 56, low pitch')
    expect(prompt).toMatch(/Never where they are from, their history/)
    expect(prompt).toContain('- Old sea dog (gruff, swaggering, amused)')
    expect(shortLabel('a very old and grizzled sea captain')).toBe('Very old and')
    // Three words can still be too long for a chip: words go until it fits.
    expect(shortLabel('Interplanetary communications officer')).toBe('Interplanetary')
    expect(shortLabel('Weary salvage engineer')).toBe('Weary salvage')
    expect(shortLabel('the ghost captain')).toBe('Ghost captain')
  })
})

describe('moods', () => {
  it('asks the model for a mood on every page', () => {
    const mood = (pageDraftJsonSchema as { properties: { mood: { enum: string[] } } }).properties.mood
    expect(mood.enum).toEqual([...moods])
    const prompt = pagePrompt({
      bible: { title: 'T', premise: 'P', heart: 'H', goal: 'G', danger: 'D', world: 'W', characters: [{ name: 'n', description: 'd' }], rules: ['r'] },
      theme: getTheme('dream'),
      config: { theme: 'dream', hero: 'h', setting: 's', tone: 'tender' },
      path: [],
      facts: [],
      choiceText: null,
      mustEnd: false,
      choicesCount: 2,
      depth: 0,
      maxDepth: 8,
    })
    for (const m of moods) expect(prompt).toContain(`- ${m}:`)
    expect(isMood('peril')).toBe(true)
    expect(isMood('angry')).toBe(false)
  })
})
