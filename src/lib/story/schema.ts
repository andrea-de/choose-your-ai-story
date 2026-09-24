import { z } from 'zod'
import { themeIds } from '../themes'
import type { ThemeId } from './types'

const shortText = (max: number) => z.string().trim().min(1).max(max)

/** What the model returns when a story begins. */
export const bibleSchema = z.object({
  title: shortText(80).describe('A storybook title, at most six words.'),
  premise: shortText(400).describe('Two sentences a reader sees on the story’s cover.'),
  world: shortText(1200).describe('The setting, its history and how it works, for the narrator.'),
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
  text: shortText(2000).describe('The passage, 90 to 140 words, in 2 or 3 short paragraphs separated by blank lines.'),
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
  illustrationPrompt: shortText(300).describe(
    'One simple object or figure from this passage to sketch, e.g. "a lantern hanging from a crooked branch".',
  ),
})

export type PageDraft = z.infer<typeof pageDraftSchema>

/** JSON Schema for the model, without the `$schema` header Gemini does not need. */
function forModel(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  return rest
}

export const bibleJsonSchema = forModel(bibleSchema)
export const pageDraftJsonSchema = forModel(pageDraftSchema)

/** Body of POST /api/stories. Every field is optional; missing ones are rolled. */
export const newStoryRequestSchema = z.object({
  theme: z
    .enum(themeIds as [ThemeId, ...ThemeId[]])
    .optional(),
  hero: z.string().trim().max(120).optional(),
  setting: z.string().trim().max(160).optional(),
  tone: z.string().trim().max(40).optional(),
})

export type NewStoryRequest = z.infer<typeof newStoryRequestSchema>
