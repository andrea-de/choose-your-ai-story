import type { Theme } from '../themes'
import type { PageDraft } from '../story/schema'
import type { PageRequest } from '../story/prompts'
import type { StoryBible, StoryConfig, ThemeId } from '../story/types'
import { createRng, hashString, pick } from '../story/random'
import type { Illustration, StoryTeller } from './types'

/**
 * A storyteller that needs no network: stitches passages together from a
 * phrasebook per theme. Used in tests, in e2e runs, and when no GEMINI_API_KEY is set.
 */
export class MockStoryTeller implements StoryTeller {
  readonly name = 'mock'

  constructor(private readonly delayMs = 0) {}

  async writeBible(config: StoryConfig): Promise<StoryBible> {
    await this.wait()
    const book = PHRASEBOOKS[config.theme] ?? PHRASEBOOKS['historic-fantasy']
    const rng = createRng(hashString(JSON.stringify(config)))
    return {
      title: `The ${pick(book.titleNouns, rng)} of ${pick(book.titlePlaces, rng)}`,
      premise: `You are ${config.hero}, in ${config.setting}. ${book.premiseHook}`,
      world: `A ${config.tone} world where ${config.setting} keeps its secrets close.`,
      characters: [
        { name: pick(book.names, rng), description: 'A wary ally who knows more than they say.' },
        { name: pick(book.names, rng), description: 'A rival who wants the same prize for different reasons.' },
      ],
      rules: book.rules,
    }
  }

  async writePage(req: PageRequest): Promise<PageDraft> {
    await this.wait()
    const book = PHRASEBOOKS[req.theme.id] ?? PHRASEBOOKS['historic-fantasy']
    const rng = createRng(hashString(`${req.bible.title}|${req.depth}|${req.choiceText ?? 'start'}|${req.path.length}`))
    const opening = req.choiceText
      ? `You ${lowerFirst(req.choiceText.replace(/\.$/, ''))}. ${pick(book.transitions, rng)}`
      : `${pick(book.openings, rng)} ${req.bible.premise}`
    const [d1, d2, d3] = shuffled(book.details, rng)
    const paragraphs = [`${opening} ${d1}`, `${d2} ${d3}`, req.mustEnd ? pick(book.endings, rng) : pick(book.hooks, rng)]
    const choices = req.mustEnd ? [] : shuffled(book.choices, rng).slice(0, req.choicesCount)
    const item = pick(book.items, rng)
    return {
      text: paragraphs.join('\n\n'),
      choices,
      newFacts: req.mustEnd ? [] : [`You carry ${item}.`],
      retiredFactIds: req.facts.length > 2 ? [req.facts[0].id] : [],
      endingTitle: req.mustEnd ? pick(book.endingTitles, rng) : '',
      illustrationPrompt: item,
    }
  }

  async drawIllustration(subject: string, _theme: Theme): Promise<Illustration> {
    await this.wait()
    const key = Object.keys(SKETCHES).find((k) => subject.includes(k))
    const svg = key ? SKETCHES[key] : Object.values(SKETCHES)[hashString(subject) % Object.keys(SKETCHES).length]
    return { mimeType: 'image/svg+xml', data: new TextEncoder().encode(svg) }
  }

  private wait() {
    return this.delayMs > 0 ? new Promise((r) => setTimeout(r, this.delayMs)) : Promise.resolve()
  }
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

interface Phrasebook {
  titleNouns: string[]
  titlePlaces: string[]
  premiseHook: string
  names: string[]
  rules: string[]
  openings: string[]
  transitions: string[]
  details: string[]
  hooks: string[]
  endings: string[]
  endingTitles: string[]
  choices: string[]
  /** Each names one of the SKETCHES keys, so the mock always has a drawing. */
  items: string[]
}

export const PHRASEBOOKS: Record<ThemeId, Phrasebook> = {
  'historic-fantasy': {
    titleNouns: ['Lantern', 'Salt Crown', 'Ninth Bell', 'Ash Orchard', 'Quiet Tower', 'Hollow Saint'],
    titlePlaces: ['Wendmere', 'the Drowned Road', 'Castle Aubrec', 'the Long Frost', 'Saint Ivo’s Rest'],
    premiseHook: 'Something old has woken, and only you seem to notice.',
    names: ['Brother Anselm', 'Mistress Hale', 'Old Corwin', 'Isolde Vane', 'the Ferryman', 'Tamsin Reed'],
    rules: ['Magic is rare, costly, and always asks for something in return.', 'The dead do not return.'],
    openings: [
      'The bells of the old chapel ring thirteen times, and then fall silent.',
      'Snow has been falling since dawn, soft as ash.',
      'The candle gutters though there is no wind.',
    ],
    transitions: [
      'For a long moment nothing stirs.',
      'The air grows colder with every step.',
      'Somewhere behind you, a door creaks shut.',
    ],
    details: [
      'Woodsmoke hangs low over the thatched roofs, and a dog barks twice in the distance.',
      'Your breath clouds in the lantern light, and the flagstones glisten with frost.',
      'A crow watches from the eaves, its head tilted as if it knows your name.',
      'The smell of wet wool and beeswax fills the narrow passage.',
      'Faded frescoes of saints peer down from the plaster, their painted eyes chipped away.',
      'Far below, the river mutters over its stones like a monk at prayer.',
    ],
    hooks: [
      'Then you see it: a thin line of light beneath a door that should not be there.',
      'A hooded figure steps from the shadows and holds out a sealed letter bearing your name.',
      'The ground trembles, and from the tower comes a single, mournful note.',
    ],
    endings: [
      'And so the tale is told, and the fire burns low, and the night keeps what it has learned.',
      'Dawn breaks over the rooftops at last, and the long night is only a story to tell.',
      'The road ends here, as all roads must, beneath a sky full of old and patient stars.',
    ],
    endingTitles: ['The Lantern’s Rest', 'A Crown of Frost', 'The Last Bell', 'Home by Starlight'],
    choices: [
      'Follow the light beneath the door',
      'Break the seal and read the letter',
      'Climb the tower stair',
      'Hide and watch the figure',
      'Ask the crow what it knows',
      'Return to the village for help',
    ],
    items: ['a lantern', 'a key', 'a candle', 'a tower', 'a feather', 'a tree'],
  },
  future: {
    titleNouns: ['Silent Signal', 'Last Orbit', 'Glass Moon', 'Ninth Relay', 'Cold Harbor', 'Long Drift'],
    titlePlaces: ['Kepler Station', 'the Outer Belt', 'Europa Deep', 'the Halcyon', 'Tycho Ring'],
    premiseHook: 'A signal is repeating on a frequency no one has used in a hundred years.',
    names: ['Commander Oyelaran', 'VESTA', 'Dr. Hollis Park', 'Juno Kade', 'the Quartermaster', 'Mirel Sato'],
    rules: ['Faster-than-light travel does not exist.', 'Air, power and time are always running short.'],
    openings: [
      'The ship wakes you before the alarms do: a single soft chime in the dark.',
      'Forty days since the last transmission, the console lights up on its own.',
      'Frost has formed on the inside of the viewport again.',
    ],
    transitions: [
      'Telemetry scrolls past faster than you can read it.',
      'The hull ticks as it cools, like a clock counting down.',
      'Somewhere aft, a pressure door seals with a hiss.',
    ],
    details: [
      'The station hums at a pitch you stopped hearing years ago, and now suddenly hear again.',
      'Outside, the planet turns slowly, its night side stitched with the lights of empty cities.',
      'Your breath fogs the inside of your helmet, and the oxygen readout blinks amber.',
      'Cables hang from the ceiling like vines, swaying in air that should be still.',
      'A maintenance drone drifts past, its single lens following you a moment too long.',
      'Every screen on the deck shows the same coordinates, and none of them are on any chart.',
    ],
    hooks: [
      'Then the signal changes. It is no longer a pattern. It is your name.',
      'The airlock cycles open, though no one is scheduled to arrive for another year.',
      'On the long-range scanner, something vast blinks into existence and holds still.',
    ],
    endings: [
      'The engines fall quiet, and for the first time in a long time, you are not alone out here.',
      'You file the final log, set the beacon to repeat, and let the stars carry the rest.',
      'Home is a pale blue point in the viewport, and it is getting closer.',
    ],
    endingTitles: ['Signal Received', 'The Long Way Home', 'Last Light of Kepler', 'First Contact'],
    choices: [
      'Answer the signal on an open channel',
      'Seal the deck and wake the captain',
      'Suit up and go outside',
      'Ask the ship’s AI what it is hiding',
      'Follow the drone into the service ducts',
      'Plot a course toward the coordinates',
    ],
    items: ['a planet', 'a rocket', 'a key', 'a tower', 'a lantern'],
  },
  noir: {
    titleNouns: ['Long Goodbye', 'Blue Gardenia', 'Last Call', 'Paper Alibi', 'Glass Key', 'Midnight Ledger'],
    titlePlaces: ['Harbor Street', 'the Orpheum', 'Room 412', 'the Night Express', 'the Silver Slipper'],
    premiseHook: 'A client walked in with a story, a fat envelope and a lie you can smell from across the room.',
    names: ['Vera Lark', 'Lieutenant Dorsey', 'Mickey “Two-Times” Hale', 'Mrs. Castellane', 'Sully', 'Dr. Ambrose'],
    rules: ['Everyone is lying about something.', 'The cops are no help, and some are worse.'],
    openings: [
      'The rain has been coming down for three days, like the city is trying to wash itself clean and failing.',
      'It’s past midnight, the coffee is cold, and the phone on your desk is ringing.',
      'She walks into your office like trouble with good shoes.',
    ],
    transitions: [
      'Somewhere down the block, a car door slams.',
      'The neon sign outside buzzes and flickers red across the wall.',
      'You light a match, and for a second, the whole room holds its breath.',
    ],
    details: [
      'The streetlamp outside throws venetian-blind shadows across the floor like prison bars.',
      'A saxophone wails from the club across the street, sad and slow.',
      'The ashtray is full, the bottle is empty, and the clock says it’s later than you think.',
      'Rain runs down the window in crooked lines, blurring the neon into watercolor.',
      'A man in a gray fedora has been reading the same newspaper under the awning for an hour.',
      'The office smells of old paper, wet wool and a perfume you almost recognize.',
    ],
    hooks: [
      'Then you notice the matchbook: the Silver Slipper, and a phone number written in lipstick.',
      'The door opens, and the man in the gray fedora is standing there with his hand in his coat.',
      'A photograph slides under the door. On the back, someone has written: Stop looking.',
    ],
    endings: [
      'The case is closed, the rain has stopped, and the city goes on pretending nothing happened.',
      'You pour two fingers, toast the empty chair across from you, and turn off the light.',
      'By morning the papers get it wrong, the way they always do, and you let them.',
    ],
    endingTitles: ['Case Closed', 'The Last Dance', 'Rain Check', 'A Clean Getaway'],
    choices: [
      'Call the number in the matchbook',
      'Tail the man in the gray fedora',
      'Pay a visit to the Silver Slipper',
      'Lean on your contact at the precinct',
      'Search her apartment while she sleeps',
      'Take the envelope and walk away',
    ],
    items: ['a fedora', 'a streetlamp', 'a key', 'a candle', 'a telephone'],
  },
  pirate: {
    titleNouns: ['Black Compass', 'Drowned Crown', 'Ninth Wave', 'Salt Queen', 'Lost Doubloon', 'Siren’s Map'],
    titlePlaces: ['Tortuga', 'the Devil’s Reef', 'Skull Cay', 'the Leeward Isles', 'the Sargasso'],
    premiseHook: 'A dying sailor pressed half a map into your hand and whispered one word: run.',
    names: ['Captain Anne Fairweather', 'One-Eyed Morrow', 'Bosun Tuckett', 'Pepper the parrot', 'Old Salt Josiah', 'Isabela Cruz'],
    rules: ['The sea keeps what it takes.', 'A pirate’s word is only as good as the wind.'],
    openings: [
      'The ship groans like an old man as she rolls through the swell.',
      'Dawn comes up red over the harbor, and red at morning is a sailor’s warning.',
      'The tavern is loud, the rum is watered, and someone is watching you from the corner.',
    ],
    transitions: [
      'The wind shifts, and the sails crack like pistol shots.',
      'Gulls wheel and scream overhead.',
      'Below decks, something heavy rolls and thuds against the hull.',
    ],
    details: [
      'Salt spray stings your eyes, and the deck tilts beneath your boots.',
      'The rigging hums in the wind like a plucked fiddle string.',
      'Tar, rope and rotting oranges: the smell of every ship you have ever loved.',
      'Lanterns swing from the beams, throwing drunken shadows across the crew’s faces.',
      'The parrot on the cook’s shoulder mutters a word that sounds a lot like treasure.',
      'Far off, a smudge of green rises from the sea where no island should be.',
    ],
    hooks: [
      'Then the lookout cries from the crow’s nest: black sails, off the starboard bow!',
      'Half-buried in the sand, the old chest bears the same mark as your map.',
      'The captain calls you to her cabin and locks the door behind you.',
    ],
    endings: [
      'The sun sinks into the sea, the hold is full, and for tonight at least, the sea is kind.',
      'You carve your name into the mast beside the others, and set a course for home.',
      'The treasure was never gold, the old sailors say. Tonight you finally understand them.',
    ],
    endingTitles: ['Fair Winds', 'The Captain’s Share', 'Davy Jones’s Locker', 'Home Port'],
    choices: [
      'Run up the colors and give chase',
      'Row ashore under cover of darkness',
      'Follow the map to the old chest',
      'Bargain with the captain',
      'Climb to the crow’s nest for a better look',
      'Trust the parrot and head for the reef',
    ],
    items: ['a ship', 'an anchor', 'a compass', 'a key', 'a lantern'],
  },
}

const stroke = 'fill="none" stroke="#1b1206" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g ${stroke}>${body}</g></svg>`

export const SKETCHES: Record<string, string> = {
  lantern: svg(
    '<path d="M100 22c0-8 10-10 12-4"/><path d="M78 56 100 34l22 22z"/><path d="M82 56v62h36V56"/>' +
      '<path d="M100 58v58M82 86h36"/><path d="M100 106c-9-9-5-20 0-28 5 8 9 19 0 28z"/><path d="M74 118h52M84 126h32"/>',
  ),
  key: svg(
    '<circle cx="62" cy="100" r="22"/><circle cx="62" cy="100" r="9"/><path d="M84 100h86"/>' +
      '<path d="M150 100v18M162 100v12M138 100v10"/>',
  ),
  candle: svg(
    '<path d="M86 80v76h28V80z"/><path d="M86 84c6 5 10-2 14 4 4-6 10 2 14-4"/><path d="M100 80v-8"/>' +
      '<path d="M100 70c-10-10-4-24 0-34 4 10 10 24 0 34z"/><path d="M62 158h76c-6 10-70 10-76 0z"/>',
  ),
  tower: svg(
    '<path d="M72 170V70h56v100"/><path d="M68 70V52h12v10h10V52h12v10h10V52h12v18"/>' +
      '<path d="M92 170v-26c0-12 16-12 16 0v26"/><path d="M96 96v-8c0-6 8-6 8 0v8z"/><path d="M40 170h120"/>',
  ),
  feather: svg(
    '<path d="M60 160C80 110 110 60 150 40c-4 40-30 90-80 110"/><path d="M60 160l84-112"/>' +
      '<path d="M84 128l-6-18M100 108l-4-20M116 86l-2-18M92 120l20 2M108 98l20 0"/>',
  ),
  tree: svg(
    '<path d="M100 170v-70M100 120l-26-26M100 110l30-30M74 94l-14-4M74 94v-18M130 80l14-10M130 80v-16"/>' +
      '<path d="M100 100 88 74M100 100l6-34"/><path d="M60 172c20-6 60-6 80 0"/>',
  ),
  planet: svg(
    '<circle cx="100" cy="100" r="38"/><path d="M40 118c-18 12-10 24 20 20 30-4 76-22 100-44 22-20 10-30-18-22"/>' +
      '<path d="M76 82c14-6 34-6 48 2M70 104c18 6 40 6 58-2"/><circle cx="40" cy="44" r="2"/><circle cx="164" cy="150" r="2"/>' +
      '<circle cx="156" cy="40" r="3"/>',
  ),
  rocket: svg(
    '<path d="M100 26c22 18 28 50 22 92H78c-6-42 0-74 22-92z"/><circle cx="100" cy="72" r="10"/>' +
      '<path d="M78 104l-20 26 22-4M122 104l20 26-22-4"/><path d="M88 118l-4 22M100 118v28M112 118l4 22"/>',
  ),
  fedora: svg(
    '<path d="M30 124c30 16 110 16 140 0-8-6-20-8-30-8"/><path d="M60 116c0-28 6-50 18-54 8-2 14 8 22 8s14-10 22-8c12 4 18 26 18 54"/>' +
      '<path d="M60 108c26 8 54 8 80 0"/><path d="M84 66c6 6 26 6 32 0"/>',
  ),
  streetlamp: svg(
    '<path d="M100 176V70"/><path d="M84 176h32"/><path d="M100 70c0-20 30-22 40-8"/>' +
      '<path d="M128 62h24l-6 16h-12z"/><path d="M140 82l-6 18M146 82l8 16M136 82l-14 12"/>',
  ),
  telephone: svg(
    '<path d="M60 130h80l10 34H50z"/><path d="M76 130v-16h48v16"/><circle cx="100" cy="146" r="10"/>' +
      '<path d="M54 104c-8-24 20-40 46-40s54 16 46 40l-20 2c-2-10-12-16-26-16s-24 6-26 16z"/>',
  ),
  ship: svg(
    '<path d="M40 130h120l-18 26H58z"/><path d="M100 130V40M70 130V60"/><path d="M100 44c26 10 30 50 0 70"/>' +
      '<path d="M100 44c-20 12-22 50 0 70M70 64c16 8 18 36 0 50M70 64c-12 10-12 36 0 50"/><path d="M100 40l18 6-18 6"/>' +
      '<path d="M30 170c14-8 26 8 40 0s26 8 40 0 26 8 40 0 26 8 30 2"/>',
  ),
  anchor: svg(
    '<circle cx="100" cy="42" r="12"/><path d="M100 54v112"/><path d="M76 78h48"/>' +
      '<path d="M46 124c4 30 30 44 54 42 24 2 50-12 54-42"/><path d="M46 124l-8 10M46 124l12 4M154 124l8 10M154 124l-12 4"/>',
  ),
  compass: svg(
    '<circle cx="100" cy="100" r="60"/><circle cx="100" cy="100" r="50"/><path d="M100 36l10 54 54 10-54 10-10 54-10-54-54-10 54-10z"/>' +
      '<path d="M100 36v128M36 100h128"/><circle cx="100" cy="100" r="5"/>',
  ),
}
