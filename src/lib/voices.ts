import { castIds } from './voiceCast'
import { splitTones } from './themes'
import type { ThemeId } from './story/types'

/**
 * How a tale is read aloud. Following Google's guide for its speech model: the
 * accent and character come from casting the right voice (see voiceCast.ts),
 * and the delivery is a short style phrase, since longer instructions make the
 * voice drift. Machines, old radios, temples and dreams get their sound from
 * audio treatments applied as the narration streams (src/lib/ai/tempo.ts).
 */

/**
 * How a page feels, picked by the model when it writes the page. The narrator's
 * delivery shifts with it.
 */
export const moods = ['hush', 'wonder', 'suspense', 'peril', 'sorrow', 'mirth', 'triumph'] as const
export type Mood = (typeof moods)[number]

/** What each mood means, for the model choosing one. */
export const moodMeanings: Record<Mood, string> = {
  hush: 'quiet, calm or intimate; a breath between events',
  wonder: 'awe, beauty or discovery',
  suspense: 'something is wrong or about to happen; secrets, searching, waiting',
  peril: 'danger is here now; a chase, a fight, a fall, a storm',
  sorrow: 'loss, regret, loneliness or farewell',
  mirth: 'comedy, mischief, warmth or banter',
  triumph: 'a victory, a rescue, a door flung open',
}

export const isMood = (value: unknown): value is Mood => moods.includes(value as Mood)

/** A page's mood, as a few words of delivery. */
export const MOOD_STYLE: Record<Mood, string> = {
  hush: 'hushed, slow',
  wonder: 'awed',
  suspense: 'low, tense',
  peril: 'urgent, quick',
  sorrow: 'sad, gentle',
  mirth: 'playful',
  triumph: 'rousing',
}

/** A tale's moods (the ones the reader picked), as a word or two of delivery each. */
export const TONE_STYLE: Record<string, string> = {
  thrilling: 'energetic',
  funny: 'amused',
  spooky: 'eerie',
  mysterious: 'intriguing',
  cozy: 'warm',
  epic: 'grand',
  heartwarming: 'tender',
  twisty: 'knowing',
  'fairy-tale': 'storybook',
  cursed: 'ominous',
  cosmic: 'vast, quiet',
  cyberpunk: 'cool, edgy',
  hardboiled: 'hard, flat',
  'double-crossing': 'sly',
  swashbuckling: 'swaggering',
  'treasure-hunting': 'eager',
  fated: 'solemn',
  'monster-slaying': 'bold',
  surreal: 'calm, strange',
  whimsical: 'whimsical',
}

/**
 * Sound treatments: a speech model can only speak, so a voice that should sound
 * like a machine or an old broadcast gets it from audio effects.
 */
export const TREATMENTS = ['none', 'robot', 'droid', 'ai', 'radio', 'temple', 'dream'] as const
export type Treatment = (typeof TREATMENTS)[number]

/** A narrator for a tale: a short name, which voice, how it sounds, and any sound treatment. */
export interface VoiceSuggestion {
  /** Two or three words, e.g. "Old sea dog". */
  label: string
  /** A voice id from VOICE_CAST. */
  voice: string
  /** A few words of delivery, e.g. "gruff, swaggering, amused". */
  style: string
  treatment: Treatment
}

/** A tale's narrator: the standard one, or the suggested character. Fixed once anything is recorded. */
export interface StoryVoice {
  chosen: 'standard' | 'suggested'
  suggestion: VoiceSuggestion
  /** A page has been read aloud, so the voice can no longer change. */
  locked: boolean
}

/** The standard narrator: a warm, clear audiobook reader in any book. */
export const PLAIN_NARRATOR = {
  label: 'Standard narrator',
  voice: 'sulafat',
  style: 'warm, clear',
}

const n = (label: string, voice: string, style: string, treatment: Treatment = 'none'): VoiceSuggestion => ({
  label,
  voice,
  style,
  treatment,
})

/**
 * Each book's own narrator, the first suggestion for a new tale: free and instant.
 * Human characters are cast by accent (a Bristol sea dog, an East Coast gumshoe).
 */
const OWN_NARRATOR: Record<ThemeId, VoiceSuggestion> = {
  'historic-fantasy': n('Old chronicler', 'en-ie-storyteller-3', 'warm, wry, unhurried'),
  future: n("Ship's computer", 'kore', 'flat, precise, evenly paced, emotionless', 'robot'),
  noir: n('Hard-boiled gumshoe', 'en-us-storyteller-9', 'dry, world-weary, deadpan'),
  pirate: n('Old sea dog', 'en-gb-storyteller-4', 'gruff, swaggering, amused'),
  ancient: n('Temple bard', 'en-gb-tutor-9', 'grand, measured, ringing'),
  dream: n('Dream whisper', 'achernar', 'whispered, slow, gentle', 'dream'),
}

/**
 * Treated voices made for each book: a sound treatment with a voice and a style
 * that suit it. Every other new idea is one of these, in turn, so the altered
 * voices keep coming round.
 */
export const TREATED_NARRATORS: Record<ThemeId, readonly VoiceSuggestion[]> = {
  future: [
    OWN_NARRATOR.future,
    n('Repair droid', 'puck', 'quick, chirpy, eager', 'droid'),
    n('Station AI', 'schedar', 'calm, smooth, softly precise', 'ai'),
    n('Mission control', 'en-us-storyteller-12', 'brisk, calm, procedural', 'radio'),
  ],
  noir: [
    n('Late-night radio', 'algenib', 'low, smoky, confiding', 'radio'),
    n('Police dispatcher', 'en-us-tutor-19', 'curt, flat, businesslike', 'radio'),
  ],
  pirate: [
    n('Ghost captain', 'en-gb-concierge-10', 'slow, hollow, menacing', 'temple'),
    n('Drowned sailor', 'fenrir', 'mournful, slow, far away', 'dream'),
  ],
  'historic-fantasy': [
    n('Cave dragon', 'gacrux', 'slow, rumbling, amused', 'temple'),
    n('Forest spirit', 'vindemiatrix', 'hushed, gentle, ancient', 'dream'),
  ],
  ancient: [
    n('Voice of Zeus', 'charon', 'deep, slow, commanding', 'temple'),
    n('Temple oracle', 'en-gb-tutor-5', 'slow, solemn, cryptic', 'temple'),
  ],
  dream: [OWN_NARRATOR.dream, n('Faraway voice', 'en-ie-storyteller-6', 'soft, wistful, drifting', 'dream')],
}

export function seedSuggestion(theme: ThemeId): VoiceSuggestion {
  return OWN_NARRATOR[theme] ?? OWN_NARRATOR['historic-fantasy']
}

/**
 * The narrator for the nth suggestion of a tale (the book's own is the 0th).
 * Even ones are treated voices in turn; odd ones are for the model to invent.
 */
export function presetFor(theme: ThemeId, index: number): VoiceSuggestion | null {
  if (index % 2 === 1) return null
  const treated = TREATED_NARRATORS[theme]
  return treated[(index / 2) % treated.length]
}

/** Who reads a request: the standard narrator, or a suggested character. */
export type NarratorSpec = { kind: 'standard' } | { kind: 'suggested'; suggestion: VoiceSuggestion }

/** The narrator a tale's voice settings describe. */
export function narratorOf(voice: StoryVoice): NarratorSpec {
  return voice.chosen === 'standard' ? { kind: 'standard' } : { kind: 'suggested', suggestion: voice.suggestion }
}

export interface NarrationRequest {
  theme: ThemeId
  /** Who reads it. The book's own narrator unless said otherwise. */
  narrator?: NarratorSpec
  /** The moods the reader picked for the tale ("funny and spooky"). */
  tone: string
  mood?: Mood
  isEnding?: boolean
  text: string
}

const suggestionOf = (theme: ThemeId, narrator?: NarratorSpec): VoiceSuggestion | null =>
  !narrator ? seedSuggestion(theme) : narrator.kind === 'suggested' ? narrator.suggestion : null

/**
 * The short style phrase for one reading: the narrator's own, the tale's moods,
 * and the page's. A handful of words, as the speech model works best with.
 * Older tales stored a long direction and no style: they use their book's own.
 */
export function narrationStyle({ theme, tone, mood, isEnding, narrator }: Omit<NarrationRequest, 'text'>): string {
  const suggestion = suggestionOf(theme, narrator)
  const parts = [suggestion ? suggestion.style || seedSuggestion(theme).style : PLAIN_NARRATOR.style]
  const tones = splitTones(tone)
    .map((t) => TONE_STYLE[t])
    .filter(Boolean)
  if (tones.length) parts.push(tones.join(', '))
  if (mood) parts.push(MOOD_STYLE[mood])
  if (isEnding) parts.push('slowing to a close')
  // Each word once: "amused" from the narrator and again from a funny tale would only repeat itself.
  const seen = new Set<string>()
  return parts
    .map((part) =>
      part
        .split(/,\s*/)
        .filter((word) => !seen.has(word) && seen.add(word))
        .join(', '),
    )
    .filter(Boolean)
    .join('; ')
}

/** The voice that reads a request. Older tales named studio voices with capitals; the API wants lower case. */
export function narratorVoice(theme: ThemeId, narrator?: NarratorSpec): string {
  const suggestion = suggestionOf(theme, narrator)
  if (!suggestion) return PLAIN_NARRATOR.voice
  const id = suggestion.voice.toLowerCase()
  return castIds.includes(id) ? id : seedSuggestion(theme).voice
}

/** The sound treatment for a request's narration. */
export function narratorTreatment(theme: ThemeId, narrator?: NarratorSpec): Treatment {
  return suggestionOf(theme, narrator)?.treatment ?? 'none'
}
