import type { ThemeId } from './story/types'

export interface Theme {
  id: ThemeId
  name: string
  /** Voice and style the narrator writes in. */
  narration: string
  /** Style appended to every illustration prompt. */
  illustration: string
  heroes: readonly string[]
  settings: readonly string[]
  tones: readonly string[]
}

export const historicFantasy: Theme = {
  id: 'historic-fantasy',
  name: 'Historic Fantasy',
  narration:
    'Write like an old illuminated storybook read aloud by the fire: second person, present tense, ' +
    'concrete sensory detail, a faint archaic cadence without being hard to read. No modern words or ' +
    'references. Family-friendly: peril and mystery are welcome, gore and cruelty are not.',
  illustration:
    'Very simple black ink sketch, loose confident pen strokes like marginalia in a medieval manuscript. ' +
    'Pure white background, no color, no shading fills, no border, no text or lettering. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a lamplighter’s apprentice',
    'a disgraced royal cartographer',
    'a young falconer',
    'a wandering hedge-witch',
    'a monk who has lost their faith',
    'a blacksmith’s daughter',
    'a retired knight with one good eye',
    'a traveling puppeteer',
  ],
  settings: [
    'a walled town on the eve of a comet',
    'a monastery carved into sea cliffs',
    'a salt marsh where the old road sinks',
    'a winter fair on a frozen river',
    'a forest the king has forbidden',
    'a crumbling bridge-city between two kingdoms',
    'a vineyard at harvest with a sealed cellar',
    'a mountain pass guarded by a silent tower',
  ],
  tones: ['hopeful', 'perilous', 'whimsical', 'eerie', 'bittersweet'],
}

const themes: Record<ThemeId, Theme> = {
  'historic-fantasy': historicFantasy,
}

export function getTheme(id: ThemeId): Theme {
  return themes[id]
}

export const themeIds = Object.keys(themes) as ThemeId[]
