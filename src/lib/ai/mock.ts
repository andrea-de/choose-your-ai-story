import type { Theme } from '../themes'
import type { PageDraft } from '../story/schema'
import type { PageRequest } from '../story/prompts'
import type { StoryBible, StoryConfig } from '../story/types'
import { createRng, hashString, pick } from '../story/random'
import type { Illustration, StoryTeller } from './types'

/**
 * A storyteller that needs no network: stitches passages together from a
 * phrasebook. Used in tests, in e2e runs, and when no GEMINI_API_KEY is set.
 */
export class MockStoryTeller implements StoryTeller {
  readonly name = 'mock'

  constructor(private readonly delayMs = 0) {}

  async writeBible(config: StoryConfig): Promise<StoryBible> {
    await this.wait()
    const rng = createRng(hashString(JSON.stringify(config)))
    const title = `The ${pick(TITLE_NOUNS, rng)} of ${pick(TITLE_PLACES, rng)}`
    return {
      title,
      premise: `You are ${config.hero}, in ${config.setting}. Something old has woken, and only you seem to notice.`,
      world: `A ${config.tone} realm of guild halls, toll roads and half-remembered saints, where ${config.setting} keeps its secrets close.`,
      characters: [
        { name: pick(NAMES, rng), description: 'A wary ally who knows more than they say.' },
        { name: pick(NAMES, rng), description: 'A rival who wants the same prize for different reasons.' },
      ],
      rules: ['Magic is rare, costly, and always asks for something in return.', 'The dead do not return.'],
    }
  }

  async writePage(req: PageRequest): Promise<PageDraft> {
    await this.wait()
    const rng = createRng(hashString(`${req.bible.title}|${req.depth}|${req.choiceText ?? 'start'}|${req.path.length}`))
    const opening = req.choiceText
      ? `You ${lowerFirst(req.choiceText.replace(/\.$/, ''))}. ${pick(TRANSITIONS, rng)}`
      : `${pick(OPENINGS, rng)} ${req.bible.premise}`
    const paragraphs = [
      `${opening} ${pick(DETAILS, rng)}`,
      `${pick(DETAILS, rng)} ${pick(DETAILS, rng)}`,
      req.mustEnd ? pick(ENDINGS, rng) : pick(HOOKS, rng),
    ]
    const choices = req.mustEnd ? [] : shuffled(CHOICES, rng).slice(0, req.choicesCount)
    const item = pick(ITEMS, rng)
    return {
      text: paragraphs.join('\n\n'),
      choices,
      newFacts: req.mustEnd ? [] : [`You carry ${item}.`],
      retiredFactIds: req.facts.length > 2 ? [req.facts[0].id] : [],
      endingTitle: req.mustEnd ? pick(ENDING_TITLES, rng) : '',
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

const TITLE_NOUNS = ['Lantern', 'Salt Crown', 'Ninth Bell', 'Ash Orchard', 'Quiet Tower', 'Hollow Saint']
const TITLE_PLACES = ['Wendmere', 'the Drowned Road', 'Castle Aubrec', 'the Long Frost', 'Saint Ivo’s Rest']
const NAMES = ['Brother Anselm', 'Mistress Hale', 'Old Corwin', 'Isolde Vane', 'the Ferryman', 'Tamsin Reed']
const OPENINGS = [
  'The bells of the old chapel ring thirteen times, and then fall silent.',
  'Snow has been falling since dawn, soft as ash.',
  'The candle gutters though there is no wind.',
]
const TRANSITIONS = [
  'For a long moment nothing stirs.',
  'The air grows colder with every step.',
  'Somewhere behind you, a door creaks shut.',
]
const DETAILS = [
  'Woodsmoke hangs low over the thatched roofs, and a dog barks twice in the distance.',
  'Your breath clouds in the lantern light, and the flagstones glisten with frost.',
  'A crow watches from the eaves, its head tilted as if it knows your name.',
  'The smell of wet wool and beeswax fills the narrow passage.',
  'Faded frescoes of saints peer down from the plaster, their painted eyes chipped away.',
  'Far below, the river mutters over its stones like a monk at prayer.',
]
const HOOKS = [
  'Then you see it: a thin line of light beneath a door that should not be there.',
  'A hooded figure steps from the shadows and holds out a sealed letter bearing your name.',
  'The ground trembles, and from the tower comes a single, mournful note.',
]
const ENDINGS = [
  'And so the tale is told, and the fire burns low, and the night keeps what it has learned.',
  'Dawn breaks over the rooftops at last, and the long night is only a story to tell.',
  'The road ends here, as all roads must, beneath a sky full of old and patient stars.',
]
const ENDING_TITLES = ['The Lantern’s Rest', 'A Crown of Frost', 'The Last Bell', 'Home by Starlight']
const CHOICES = [
  'Follow the light beneath the door',
  'Break the seal and read the letter',
  'Climb the tower stair',
  'Hide and watch the figure',
  'Ask the crow what it knows',
  'Return to the village for help',
]
const ITEMS = ['a lantern', 'a key', 'a candle', 'a tower', 'a feather', 'a tree']

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
}
