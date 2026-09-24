import { sketchesFor } from '../sketches'
import type { Theme } from '../themes'
import type { Fact, StoryBible, StoryConfig } from './types'

export interface PageRequest {
  bible: StoryBible
  theme: Theme
  config: StoryConfig
  /** Earlier passages on this branch, oldest first. */
  path: { text: string; choiceText: string | null }[]
  /** Facts that hold on this branch, as of the page being written. */
  facts: Fact[]
  /** The choice the reader just made (null for the first page). */
  choiceText: string | null
  mustEnd: boolean
  choicesCount: number
  depth: number
  maxDepth: number
  /** The sketch shown on the previous page, so the next can vary. */
  previousSketch?: string
}

export function biblePrompt(config: StoryConfig, theme: Theme): string {
  return [
    `You are planning a branching ${theme.name.toLowerCase()} gamebook that readers will explore together.`,
    `The reader plays ${config.hero}, in ${config.setting}. The tone is ${config.tone}.`,
    'Invent the world, a handful of memorable characters, and the fixed rules of this world.',
    'Keep it grounded and specific: real places, real trades, a small mystery at its heart.',
    theme.narration,
  ].join('\n\n')
}

export function pagePrompt(req: PageRequest): string {
  const { bible } = req
  const sections: string[] = []

  sections.push(
    `You are the narrator of "${bible.title}", a branching gamebook.`,
    req.theme.narration,
    `Premise: ${bible.premise}`,
    `World: ${bible.world}`,
    'Characters:\n' + bible.characters.map((c) => `- ${c.name}: ${c.description}`).join('\n'),
    'Rules that are always true:\n' + bible.rules.map((r) => `- ${r}`).join('\n'),
  )

  if (req.facts.length > 0) {
    sections.push(
      'Facts established so far on this path. Never contradict them unless you retire them by id:\n' +
        req.facts.map((f) => `- [${f.id}] ${f.text}`).join('\n'),
    )
  } else {
    sections.push('No facts have been established yet on this path.')
  }

  if (req.path.length > 0) {
    sections.push(
      'The story so far on this path:\n\n' +
        req.path
          .map((p) => (p.choiceText ? `(The reader chose: ${p.choiceText})\n${p.text}` : p.text))
          .join('\n\n'),
    )
  }

  if (req.choiceText) {
    sections.push(`The reader chose: ${req.choiceText}`)
    sections.push('Write the next page, showing the result of that choice.')
  } else {
    sections.push('Write the opening page. Set the scene and the hook quickly.')
  }

  const pagesLeft = req.maxDepth - req.depth
  if (req.mustEnd) {
    sections.push(
      'This page is an ENDING. Bring this path to a satisfying close, happy or not, that follows from ' +
        'the choices made. Return no choices, and give the ending a short evocative title.',
    )
  } else {
    sections.push(
      `End on a moment of decision and offer exactly ${req.choicesCount} choices that lead somewhere ` +
        'genuinely different. Each choice is a short imperative sentence starting with a verb. ' +
        'endingTitle must be an empty string.',
    )
    if (pagesLeft <= 2) sections.push('The story is nearing its end; raise the stakes.')
  }

  sections.push(
    'For sketch, pick the drawing below that best matches something on this page, or "none" if nothing fits.' +
      (req.previousSketch ? ` The previous page showed "${req.previousSketch}"; prefer a different one if another fits.` : '') +
      '\n' +
      sketchesFor(req.theme.id).map((s) => `- ${s.id}: ${s.description}`).join('\n'),
  )

  sections.push(
    'Record in newFacts anything this page makes true that later pages must respect. ' +
      'List in retiredFactIds the ids of facts that are no longer true.',
  )

  return sections.join('\n\n')
}

export function illustrationPrompt(subject: string, theme: Theme): string {
  return `${subject}. ${theme.illustration}`
}
