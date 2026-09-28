import { sketchesFor } from '../sketches'
import type { Theme } from '../themes'
import { castLine, VOICE_CAST } from '../voiceCast'
import { moodMeanings, moods, type VoiceSuggestion } from '../voices'
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

/**
 * How every page is written, whatever the theme. Written against what went wrong in
 * the first real stories: pages crammed with scenery, smells and similes, five new
 * names a page, a hero things happened around, and choices that were only "go to
 * place A or place B". The theme gives the voice; this keeps it readable and fun.
 */
export const HOUSE_STYLE = [
  'House style. These matter more than anything else:',
  '- Make the reader care. Every page should turn on what the hero wants and feels, not on scenery. Write like someone telling a gripping story out loud to a friend, not like a novelist painting a scene: warm, direct, a little funny.',
  '- Story first. Every page, something happens: someone acts, something goes wrong, a secret comes out. Never a page that only arrives somewhere and describes it.',
  '- Easy to read, like a good adventure book for ages 10 and up that adults enjoy too. Short, plain sentences (most under 15 words). Common words.',
  '- One vivid detail per scene, at most. No lists of sights, sounds and smells. At most one simile per page. Do not mention smells unless they matter to the plot.',
  '- Keep it clear: the reader always knows where they are, who is there, what they want and what just changed.',
  '- The reader has not seen the plan below; they know only what the pages have told them. Never mention a person, place, object, debt or secret they have not been told about. Bring in at most two new things a page, and make each one clear in plain words the moment it appears ("Rex, the hotel detective, wants someone to blame").',
  '- Introduce the cast gradually, one new named person a page at most, over the first several pages; not every character needs to appear on every path. Name a place only when the reader goes there.',
  '- Few names. Use the characters from the plan; name a new one only when they will matter, at most one new name per page. Say "the guard" or "an old sailor" otherwise. No invented jargon or capitalised place names beyond the plan.',
  '- Characters talk. Dialogue should do the work: people want things, argue, joke, lie and threaten in their own voices.',
  '- Give the hero a personality: let the narration have a sense of humour and let the reader feel clever, brave or in trouble.',
  '- Show consequences. Earlier choices and facts come back, for better or worse.',
  '- Vary the rhythm. Not every page is a chase or a cliffhanger: follow tension with a breather, a joke, a kindness or a small win.',
  '- Never spell out the options in the passage, not even through a character ("run for the door, or hide!"). End on the situation; the choices come after it.',
].join('\n')

export interface BibleOptions {
  /**
   * Letters the characters' names should start with. Models reach for the same few
   * names (Barnaby, Corin, Vane…) in story after story; random initials break the habit.
   */
  nameInitials?: readonly string[]
}

/** Letters that start plenty of names in most languages. */
export const NAME_INITIALS = 'ABCDEFGHIJKLMNOPRSTVWZ'.split('')

export function biblePrompt(config: StoryConfig, theme: Theme, options: BibleOptions = {}): string {
  const initials = options.nameInitials?.length
    ? `Start the characters' names with these letters, one each, in any order: ${options.nameInitials.join(', ')}.`
    : ''
  return [
    `You are planning a branching ${theme.name.toLowerCase()} gamebook that readers will explore together.`,
    `The reader plays ${config.hero}, in ${config.setting}. The tone is ${config.tone}.`,
    'Plan a story that is simple to grasp and fun to play: one clear goal the hero wants, a clear danger or ' +
      'rival in the way, and a secret worth uncovering. A reader should get the whole idea from the premise alone.',
    'Above all, give the hero a heart: something they care about personally and could lose, a person they love, ' +
      'a hope, a fear, a promise. The trouble should threaten exactly that. Personal stakes, never paperwork: no ' +
      'charters, licences, inspections, fines or curfews as the thing at stake. Vary it: a missing or endangered ' +
      'relative is only one kind of heart among many (a dream you have worked for, a friendship, your pride, a ' +
      'home, an animal, a secret you are ashamed of, a promise to yourself, someone who needs you).',
    'Vary the kind of story: a mystery, a rescue, a friendship, a rivalry, a secret to keep, a promise to keep, a ' +
      'way home, a wrong to put right. Not every story is a theft and a chase. No countdowns or deadlines ("before ' +
      'dawn", "before the bell") unless the deadline is the heart of the story.',
    'Keep the cast small: three or four characters, each with a plain name, an obvious role and a want of their own. ' +
      'Choose fresh names that fit the setting, and avoid names models overuse (Barnaby, Vane, Pip, Finch, Thorne, ' +
      'Elara, Kael, Silas, Mira, Lyra, Seraphina, Mallow, Bramble, Orlo, Anselm, Corin). ' +
      initials +
      ' Places get fresh names too: no Saint Jude, no Port Royal, no Blackwater. ' +
      'Keep the world simple: a few memorable places, described in a phrase each, and only the rules that matter to the plot.',
    'The reader is the hero, always "you": never make the hero a separate named character, and do not list them ' +
      'among the characters.',
    'The title is short and catchy (two to five words). The premise is two short, plain sentences in the second ' +
      'person that make the reader want to start: who you are, and the trouble you are in. Do not start it with "You are".',
    theme.narration,
  ].join('\n\n')
}

export function pagePrompt(req: PageRequest): string {
  const { bible } = req
  const sections: string[] = []

  sections.push(
    `You are the narrator of "${bible.title}", a branching gamebook.`,
    req.theme.narration,
    HOUSE_STYLE,
    `Premise: ${bible.premise}`,
    // Stories planned before hearts were part of the plan have none.
    ...(bible.heart ? [`What the hero cares about most: ${bible.heart}`] : []),
    `The hero's goal: ${bible.goal}`,
    `What stands in the way: ${bible.danger}`,
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
    sections.push(
      'Write the next page. Open with what that choice does, straight away, in a sentence or two. Then something ' +
        'new happens because of it: a complication, a discovery, a person with their own plan. Move the story ' +
        'toward the goal or make the danger worse.',
    )
  } else {
    sections.push(
      'Write the opening page. It decides whether the reader keeps going, so it must hook them. Open on you in a ' +
        'moment that shows who you are and what you care about (the heart), so the reader likes you or feels for ' +
        'you within the first three sentences. Then let the trouble land on exactly that. Keep it simple: you, the ' +
        'place and one problem, plus at most one other person; save the rest of the cast, the backstory and the ' +
        'bigger mystery for later pages. Plain and warm: no similes and no scenery for its own sake on this page. ' +
        'Do not repeat the premise or open with "You are". End with a real decision to make.',
    )
  }

  const pagesLeft = req.maxDepth - req.depth
  if (req.mustEnd) {
    sections.push(
      'This page is an ENDING. Bring this path to a satisfying close, happy or not, that follows from ' +
        'the choices made. Return no choices, and give the ending a short evocative title.',
    )
  } else {
    sections.push(
      `End on a moment of decision and offer exactly ${req.choicesCount} choices. Make them real dilemmas: ` +
        'different approaches with different risks (bold or careful, trust or suspicion, help someone or help ' +
        'yourself), so the reader can guess what each might cost. Never two ways of simply going somewhere. ' +
        'Each choice is a short imperative sentence starting with a verb, under 12 words. ' +
        'endingTitle must be an empty string.',
    )
    if (pagesLeft <= 2) sections.push('The story is nearing its end; raise the stakes.')
  }

  sections.push(
    'For sketch, pick the drawing below that best matches something in the FIRST paragraph of this page (the ' +
      'sketch is shown right after it, so a picture of something that only turns up later would puzzle the ' +
      'reader), or "none" if nothing in the first paragraph fits.' +
      (req.previousSketch ? ` The previous page showed "${req.previousSketch}"; prefer a different one if another fits.` : '') +
      '\n' +
      sketchesFor(req.theme.id).map((s) => `- ${s.id}: ${s.description}`).join('\n'),
  )

  sections.push(
    'For mood, pick how this page feels, so the narrator reading it aloud can shift their voice:\n' +
      moods.map((m) => `- ${m}: ${moodMeanings[m]}`).join('\n'),
  )

  sections.push(
    'Record in newFacts anything this page makes true that later pages must respect. ' +
      'List in retiredFactIds the ids of facts that are no longer true.',
  )

  return sections.join('\n\n')
}

export interface VoiceRequest {
  theme: Theme
  config: StoryConfig
  premise: string
  /** Suggestions already made for this tale, so the next is different. */
  previous: readonly VoiceSuggestion[]
}

/**
 * Asks for a narrator to read a tale aloud: a short name, a voice cast by accent,
 * age and sound, and a few words of delivery. Written after the first attempts
 * came back with paragraphs of biography: where the narrator came from, what
 * they had lived through. None of that reaches the voice; only casting and a
 * short style do.
 */
export function voicePrompt(req: VoiceRequest): string {
  return [
    `Cast a narrator to read this ${req.theme.name.toLowerCase()} gamebook aloud.`,
    `The tale: ${req.premise} The mood: ${req.config.tone}.`,
    'Give them a name of two or three words, at most 20 characters, that says who they are, like "Old sea dog", ' +
      '"Hard-boiled gumshoe", "Fireside grandmother" or "Nervous apprentice". A character who fits the story and ' +
      'would be fun to listen to.',
    'Cast them from this list. The accent, age and sound of the voice make the character, so choose them with care:\n' +
      VOICE_CAST.map(castLine).join('\n'),
    'Then give three to six words on how they sound as they read: tone, pace and attitude, like "gruff, amused, ' +
      'unhurried" or "breathless, eager, quick". Only how they sound. Never where they are from, their history, ' +
      'their accent (the voice already has it) or anything about the story.',
    req.previous.length
      ? 'Make it clearly different from these earlier narrators:\n' + req.previous.map((p) => `- ${p.label} (${p.style})`).join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function illustrationPrompt(subject: string, theme: Theme): string {
  return `${subject}. ${theme.illustration}`
}
