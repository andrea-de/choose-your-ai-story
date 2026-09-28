import { z } from 'zod'
import { sketchIds } from '../sketches'
import { themeIds } from '../themes'
import { castIds } from '../voiceCast'
import { moods } from '../voices'
import type { ThemeId } from './types'

const shortText = (max: number) => z.string().trim().min(1).max(max)

/** What the model returns when a story begins. */
export const bibleSchema = z.object({
  title: shortText(80).describe('A storybook title, at most six words.'),
  premise: shortText(400).describe('Two plain sentences a reader sees on the story’s cover.'),
  heart: shortText(200).describe(
    'What the hero cares about personally and could lose (a person, a hope, a fear, a promise), in one plain sentence.',
  ),
  goal: shortText(200).describe('What the hero wants, in one plain sentence.'),
  danger: shortText(200).describe('Who or what stands in the way, in one plain sentence.'),
  world: shortText(800).describe('The setting and how it works, for the narrator: simple, only what matters to the plot.'),
  characters: z
    .array(
      z.object({
        name: shortText(60),
        description: shortText(300),
      }),
    )
    .min(1)
    .max(6),
  rules: z
    .array(shortText(200))
    .min(1)
    .max(8)
    .describe('Facts about this world that stay true on every branch.'),
})

/** What the model returns for one page. */
export const pageDraftSchema = z.object({
  text: shortText(2000).describe(
    'The passage, 80 to 130 words, in 2 or 3 short paragraphs separated by blank lines. Plain, quick and easy to read.',
  ),
  choices: z
    .array(shortText(120))
    .max(4)
    .describe('What the reader may do next, each starting with a verb. Empty on an ending.'),
  newFacts: z
    .array(shortText(200))
    .max(5)
    .describe('New things this passage makes true: items gained, people met, secrets learned, harm done.'),
  retiredFactIds: z
    .array(z.string())
    .max(5)
    .describe('Ids of listed facts this passage makes no longer true.'),
  endingTitle: z
    .string()
    .max(80)
    .describe('On an ending, a short evocative name for it. Otherwise an empty string.'),
  sketch: z
    .enum(['none', ...sketchIds] as [string, ...string[]])
    .describe('The drawing from the sketch list that best fits something in the first paragraph, or "none".'),
  mood: z
    .enum(moods)
    .describe('How this page feels, so the narrator can shift their reading to match.'),
  illustrationPrompt: shortText(300).describe(
    'One simple object or figure from the first paragraph to sketch, e.g. "a lantern hanging from a crooked branch".',
  ),
})

export type PageDraft = z.infer<typeof pageDraftSchema>

/** What the model returns when asked for a narrator for a tale. */
export const voiceSuggestionSchema = z.object({
  label: shortText(40).describe('Who the narrator is, in two or three words and at most 20 characters, e.g. "Old sea dog".'),
  voice: z.enum(castIds as [string, ...string[]]).describe('The voice from the cast list that suits them best.'),
  style: shortText(80).describe('Three to six words on how they sound, e.g. "gruff, amused, unhurried".'),
})

/** The longest a narrator's name may be: it has to sit on one chip, even on a phone. */
export const LABEL_MAX = 20

/** At most three words and LABEL_MAX characters for a narrator's name, whatever the model sends. */
export function shortLabel(label: string): string {
  let words = label.replace(/^(a|an|the)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 3)
  while (words.length > 1 && words.join(' ').length > LABEL_MAX) words = words.slice(0, -1)
  const joined = words.join(' ').slice(0, LABEL_MAX)
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}



/** JSON Schema for the model, without the `$schema` header Gemini does not need. */
function forModel(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  return rest
}

export const bibleJsonSchema = forModel(bibleSchema)
export const pageDraftJsonSchema = forModel(pageDraftSchema)
export const voiceSuggestionJsonSchema = forModel(voiceSuggestionSchema)

/** Body of POST /api/stories. Every field is optional; missing ones are rolled. */
export const newStoryRequestSchema = z.object({
  theme: z
    .enum(themeIds as [ThemeId, ...ThemeId[]])
    .optional(),
  hero: z.string().trim().max(120).optional(),
  setting: z.string().trim().max(160).optional(),
  /** Up to two moods, joined with "and". */
  tone: z.string().trim().max(80).optional(),
})

export type NewStoryRequest = z.infer<typeof newStoryRequestSchema>
