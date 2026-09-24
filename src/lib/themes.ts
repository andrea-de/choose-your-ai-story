import type { ThemeId } from './story/types'

/** Words the interface uses, so each theme can speak in its own voice. */
export interface ThemeUi {
  /** Label before a page number on a choice, e.g. "turn to". */
  turnTo: string
  /** How a page number is written on the page and on choices. */
  pageLabel: (n: number) => string
  finis: string
  unwritten: string
  waiting: string
  tapHint: string
  goBack: string
  beginAgain: string
  anotherBook: string
  toLibrary: string
  firstToEnd: string
  foundBy: (readers: number) => string
  heroLabel: string
  settingLabel: string
  toneLabel: string
  begin: string
  roll: string
  binding: string
  fleuron: string
  endMark: string
  /** Milliseconds between words as the page reveals itself. */
  pace: number
}

export interface Theme {
  id: ThemeId
  name: string
  /** One line shown on the theme picker. */
  tagline: string
  /** Voice and style the narrator writes in. */
  narration: string
  /** Style appended to every illustration prompt. Always black lines on white; CSS recolours per theme. */
  illustration: string
  heroes: readonly string[]
  settings: readonly string[]
  tones: readonly string[]
  ui: ThemeUi
}

const plain = (n: number) => String(n)

export const historicFantasy: Theme = {
  id: 'historic-fantasy',
  name: 'Historic Fantasy',
  tagline: 'Parchment, candlelight and old magic',
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
  ui: {
    turnTo: 'turn to',
    pageLabel: plain,
    finis: 'Finis',
    unwritten: 'no one has gone this way',
    waiting: 'The ink is still wet on this page…',
    tapHint: 'tap to read ahead',
    goBack: 'Go back and choose differently',
    beginAgain: 'Begin the tale again',
    anotherBook: 'Choose another book',
    toLibrary: 'return to the library',
    firstToEnd: 'You are the first to find this ending',
    foundBy: (n) => `Found by ${n} readers`,
    heroLabel: 'You are',
    settingLabel: 'In',
    toneLabel: 'And the tale is',
    begin: 'Begin',
    roll: 'Roll the dice',
    binding: 'Binding the book…',
    fleuron: '❦',
    endMark: '✠',
    pace: 120,
  },
}

export const future: Theme = {
  id: 'future',
  name: 'Future',
  tagline: 'Deep space, cold light, strange signals',
  narration:
    'Write like literary science fiction told as a mission log: second person, present tense, precise ' +
    'and atmospheric, with the hum of machines and the silence of space. Technology feels real but is never ' +
    'explained at length. Wonder and isolation over action. Family-friendly: danger yes, gore no.',
  illustration:
    'Very simple thin-line technical drawing, like a blueprint or a starship schematic: clean single-weight ' +
    'black lines on a pure white background, no color, no shading, no text, labels or numbers. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a salvage pilot with a failing ship',
    'the last engineer awake on a generation ship',
    'a courier carrying a sealed data core',
    'a xenobotanist on a quarantined moon',
    'a station AI’s only human friend',
    'a cadet who failed the pilot exam',
    'a smuggler of forbidden music',
    'a lighthouse keeper at the edge of the galaxy',
  ],
  settings: [
    'an orbital city that is slowly falling',
    'a derelict research vessel drifting near a black hole',
    'a mining colony inside a hollowed asteroid',
    'a floating market in Jupiter’s clouds',
    'a terraformed Mars where the rain has stopped',
    'a relay station receiving a signal from nowhere',
    'an ice moon with an ocean that hums',
    'a sleeper ship arriving three centuries late',
  ],
  tones: ['wondrous', 'tense', 'lonely', 'hopeful', 'ominous'],
  ui: {
    turnTo: 'jump to',
    pageLabel: (n) => `LOG ${String(n).padStart(3, '0')}`,
    finis: 'End of Transmission',
    unwritten: 'uncharted',
    waiting: 'Receiving transmission…',
    tapHint: 'tap to decode all',
    goBack: 'Rewind to the last decision',
    beginAgain: 'Replay from the first log',
    anotherBook: 'Open another archive',
    toLibrary: 'return to the archive',
    firstToEnd: 'First signal ever received from this ending',
    foundBy: (n) => `Reached by ${n} explorers`,
    heroLabel: 'Identity',
    settingLabel: 'Location',
    toneLabel: 'Signal',
    begin: 'Launch',
    roll: 'Randomize',
    binding: 'Establishing uplink…',
    fleuron: '◇',
    endMark: '◈',
    pace: 70,
  },
}

export const noir: Theme = {
  id: 'noir',
  name: 'Noir',
  tagline: 'Rain, neon and a case that won’t stay closed',
  narration:
    'Write like hardboiled 1940s detective fiction: second person, present tense, short punchy sentences, ' +
    'wry similes, rain on glass, neon, cigarette smoke and bad coffee. Everyone has a secret. ' +
    'Family-friendly: menace and mystery, no gore.',
  illustration:
    'Quick charcoal and ink-wash sketch in a 1940s film-noir style: bold black shapes, dramatic shadow, ' +
    'rough grainy strokes, on a pure white background. No color, no text or lettering. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a private eye three months behind on rent',
    'a newspaper photographer who saw too much',
    'a lounge singer with a borrowed name',
    'a rookie cop who won’t take the envelope',
    'an insurance investigator who smells a rat',
    'a taxi driver with a passenger who vanished',
    'a pawnbroker holding the wrong watch',
    'a retired safecracker pulled back in',
  ],
  settings: [
    'a rain-soaked port city in 1947',
    'a jazz club where the band never stops',
    'a grand hotel on the night of a blackout',
    'the docks where the fog comes in at midnight',
    'a movie studio after the wrap party',
    'a night train between two cities',
    'a boarding house with thin walls',
    'a racetrack on the last day of the season',
  ],
  tones: ['rain-soaked', 'cynical', 'dangerous', 'wry', 'desperate'],
  ui: {
    turnTo: 'see file',
    pageLabel: (n) => `No. ${n}`,
    finis: 'Case Closed',
    unwritten: 'nobody’s followed this lead',
    waiting: 'Typing up the report…',
    tapHint: 'tap to skim the file',
    goBack: 'Go back to the last lead',
    beginAgain: 'Reopen the case',
    anotherBook: 'Pull another file',
    toLibrary: 'back to the cabinet',
    firstToEnd: 'You’re the first to close it this way',
    foundBy: (n) => `${n} detectives closed it this way`,
    heroLabel: 'You’re',
    settingLabel: 'Working',
    toneLabel: 'And the night is',
    begin: 'Open the Case',
    roll: 'Roll the dice',
    binding: 'Pulling the file…',
    fleuron: '— ✕ —',
    endMark: '■',
    pace: 85,
  },
}

export const pirate: Theme = {
  id: 'pirate',
  name: 'Pirate',
  tagline: 'Salt, tar and treasure on the high seas',
  narration:
    'Write like a rollicking age-of-sail adventure recorded in a ship’s log: second person, present tense, ' +
    'salt spray, creaking timber and tar, nautical words used naturally, a little pirate swagger in the ' +
    'dialogue. Family-friendly: storms, rivals and curses, no gore.',
  illustration:
    'Simple black ink engraving in the style of an 18th-century sea chart or ship’s log illustration: ' +
    'fine hatched lines on a pure white background, no color, no text or lettering. ' +
    'A single subject, centered, with plenty of empty space around it.',
  heroes: [
    'a cabin boy who can read the stars',
    'a navigator with a stolen map',
    'a ship’s cook who used to be a captain',
    'a mapmaker’s apprentice stowed away',
    'a privateer who lost her letter of marque',
    'a lighthouse keeper’s son',
    'a parrot trainer with a talking secret',
    'a quartermaster plotting a mutiny',
  ],
  settings: [
    'a pirate port where every tavern has a trapdoor',
    'a becalmed galleon in the Sargasso Sea',
    'a smugglers’ cove under a lighthouse',
    'an island that isn’t on any chart',
    'a merchant fleet crossing hurricane waters',
    'a sunken city at low tide',
    'a ship’s graveyard in the fog',
    'a governor’s ball with a treasure map in the ballroom',
  ],
  tones: ['swashbuckling', 'perilous', 'whimsical', 'haunted', 'greedy'],
  ui: {
    turnTo: 'turn to',
    pageLabel: plain,
    finis: 'Voyage’s End',
    unwritten: 'uncharted waters',
    waiting: 'Charting the course…',
    tapHint: 'tap to read ahead',
    goBack: 'Come about and choose again',
    beginAgain: 'Weigh anchor from the start',
    anotherBook: 'Choose another voyage',
    toLibrary: 'back to port',
    firstToEnd: 'First crew to drop anchor here',
    foundBy: (n) => `${n} crews have ended here`,
    heroLabel: 'Ye be',
    settingLabel: 'Bound for',
    toneLabel: 'And the tale be',
    begin: 'Set Sail',
    roll: 'Roll the bones',
    binding: 'Hoisting the sails…',
    fleuron: '⚓\uFE0E',
    endMark: '☠\uFE0E',
    pace: 115,
  },
}

const themes: Record<ThemeId, Theme> = {
  'historic-fantasy': historicFantasy,
  future,
  noir,
  pirate,
}

export function getTheme(id: ThemeId): Theme {
  return themes[id] ?? historicFantasy
}

export const themeIds = Object.keys(themes) as ThemeId[]
export const allThemes = themeIds.map((id) => themes[id])
