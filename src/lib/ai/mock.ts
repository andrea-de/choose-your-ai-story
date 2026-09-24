import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { sketchIds, type SketchId } from '../sketches'
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
    const sketch = pick(book.items, rng)
    return {
      text: paragraphs.join('\n\n'),
      choices,
      newFacts: req.mustEnd ? [] : [`The ${sketch} will matter later.`],
      retiredFactIds: req.facts.length > 2 ? [req.facts[0].id] : [],
      endingTitle: req.mustEnd ? pick(book.endingTitles, rng) : '',
      sketch,
      illustrationPrompt: `a ${sketch}`,
    }
  }

  /** Stands in for an image model by returning the closest library sketch. */
  async drawIllustration(subject: string, _theme: Theme): Promise<Illustration> {
    await this.wait()
    const id = sketchIds.find((k) => subject.includes(k)) ?? sketchIds[hashString(subject) % sketchIds.length]
    const data = await readFile(path.join(process.cwd(), 'public', 'sketches', `${id}.svg`))
    return { mimeType: 'image/svg+xml', data: new Uint8Array(data) }
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
  /** Sketch library ids this theme's pages draw from. */
  items: SketchId[]
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
    items: ['lantern', 'key', 'door', 'tree', 'scroll', 'stranger', 'sword', 'crown', 'candle', 'bird'],
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
    items: ['planet', 'door', 'key', 'stranger', 'moon', 'eye', 'hourglass', 'compass'],
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
    items: ['stranger', 'key', 'door', 'lantern', 'scroll', 'eye', 'goblet', 'hourglass'],
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
    items: ['ship', 'lighthouse', 'scroll', 'key', 'lantern', 'compass', 'sword', 'goblet', 'bird'],
  },
  ancient: {
    titleNouns: ['Silent Oracle', 'Bronze Bull', 'Ninth Labor', 'Golden Thread', 'Owl’s Bargain', 'Last Nymph'],
    titlePlaces: ['Knossos', 'the Wine-Dark Sea', 'Delphi', 'the Styx', 'Ithaca'],
    premiseHook: 'The gods have fallen quiet, and a stranger at the well says they are waiting for you.',
    names: ['Ariadne', 'old Tiresias', 'Captain Nikias', 'the sorceress Kirke', 'Glaukos the fisherman', 'Phaedra'],
    rules: ['The gods keep every bargain to the letter, never the spirit.', 'No mortal may look back on the road out of the Underworld.'],
    openings: [
      'Rosy-fingered dawn spreads across the sea, and the gulls cry out as if in warning.',
      'The smoke from the altar rises straight up, then bends, as though something breathed on it.',
      'At the crossroads stands a woman in a gray cloak, and the owl on her shoulder does not blink.',
    ],
    transitions: [
      'Somewhere far above, thunder rolls across a cloudless sky.',
      'The wind turns, carrying the smell of salt and burnt offerings.',
      'A shadow crosses the sun, and the whole valley holds its breath.',
    ],
    details: [
      'Olive trees shiver silver in the breeze, and cicadas sing in the heat.',
      'The marble is warm beneath your hand, carved with heroes whose names the rain has worn away.',
      'Down in the harbor, black-hulled ships creak at their moorings like restless horses.',
      'Incense and crushed thyme hang in the air of the temple.',
      'Like a hawk above the fields, the thought circles and will not land.',
      'Painted on an old wine jar, a hero wrestles a lion, and for a moment the lion seems to move.',
    ],
    hooks: [
      'Then the oracle’s voice comes from the dark: three words, and one of them is your name.',
      'From the sea rises a bull as white as foam, and it is looking straight at you.',
      'A golden thread lies across the path, leading down into the labyrinth.',
    ],
    endings: [
      'And so the song is sung, and the Muse falls silent, and the stars take up your story.',
      'You return home at last, older and wiser, and the gods, for once, are pleased.',
      'Fate has had its way, as fate does, but the poets will remember your name.',
    ],
    endingTitles: ['The Homecoming', 'A Bargain Kept', 'Among the Stars', 'The Oracle’s Price'],
    choices: [
      'Follow the golden thread',
      'Make an offering at the altar',
      'Ask the owl what it knows',
      'Sail for the island at dawn',
      'Challenge the stranger to a riddle',
      'Descend into the labyrinth',
    ],
    items: ['ship', 'scroll', 'tree', 'moon', 'stranger', 'sword', 'crown', 'goblet', 'mountain', 'eye'],
  },
  dream: {
    titleNouns: ['Glass Tide', 'Other Room', 'Upside Moon', 'Paper Sky', 'Second Shadow', 'Slow Clock'],
    titlePlaces: ['Nowhere-in-Particular', 'the Hollow Hour', 'Lantern Street', 'the Mirror Sea', 'Tuesday’s Edge'],
    premiseHook: 'The clocks have all agreed to stop at the same minute, and only you are still moving.',
    names: ['the Woman Made of Moths', 'your reflection', 'Mr. Almost', 'the Conductor', 'Wren, who is sometimes a bird', 'the Keeper of Lost Umbrellas'],
    rules: ['Mirrors show what could have been, never what is.', 'Anything forgotten here stays forgotten when you wake.'],
    openings: [
      'You are standing in a corridor you have never seen, and you know it perfectly.',
      'The rain is falling upward tonight, and nobody seems to mind.',
      'A door opens in the middle of the field, and warm light spills out onto the grass.',
    ],
    transitions: [
      'The room quietly rearranges itself behind your back.',
      'The floor becomes water, then floor again, as if it changed its mind.',
      'Somewhere a music box plays a song you almost remember.',
    ],
    details: [
      'The wallpaper is covered in tiny doors, and one of them is slightly open.',
      'The moon hangs low enough to touch, and it hums like a struck glass.',
      'Your footsteps arrive a moment after you do.',
      'Every clock in the house shows a different, very certain time.',
      'The air smells of oranges and old books, and tastes faintly of blue.',
      'In the window, your reflection waves, though you did not.',
    ],
    hooks: [
      'Then your reflection steps out of the mirror and asks if you are ready to swap.',
      'A staircase unfolds from the ceiling, leading somewhere upside down.',
      'The train whistles once, and a ticket with your name on it drifts into your hand.',
    ],
    endings: [
      'The dream loosens like a ribbon, and you wake with a feather still in your hand.',
      'You step through the last door and find your own bed, warm, as if you never left.',
      'The world folds gently closed, and somewhere, a version of you keeps dreaming on.',
    ],
    endingTitles: ['Waking Softly', 'The Other You', 'Morning Light', 'Still Dreaming'],
    choices: [
      'Step through the open door',
      'Follow your reflection into the glass',
      'Climb the upside-down staircase',
      'Board the midnight train',
      'Ask the moon what time it is',
      'Close your eyes inside the dream',
    ],
    items: ['moon', 'door', 'key', 'tree', 'stranger', 'eye', 'hourglass', 'bird', 'bridge'],
  },
}
