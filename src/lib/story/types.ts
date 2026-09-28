import type { StoryCost } from '../ai/pricing'
import type { Mood, StoryVoice, VoiceSuggestion } from '../voices'

export type ThemeId = 'historic-fantasy' | 'future' | 'noir' | 'pirate' | 'ancient' | 'dream'

/** What the reader picked (or the dice rolled) on the opening screen. */
export interface StoryConfig {
  theme: ThemeId
  hero: string
  setting: string
  tone: string
  /** Tales begun before voices were chosen on the cover recorded this instead. */
  narrator?: 'character' | 'plain'
}

export interface Character {
  name: string
  description: string
}

/** Written once when a story begins; shared by every branch. */
export interface StoryBible {
  title: string
  premise: string
  /** What the hero cares about personally and could lose. */
  heart: string
  /** What the hero wants. */
  goal: string
  /** Who or what stands in the way. */
  danger: string
  world: string
  characters: Character[]
  /** Rules the narrator must never break, on any branch. */
  rules: string[]
}

export interface Story {
  id: string
  config: StoryConfig
  bible: StoryBible
  /** Seeds page-number allocation and ending rolls, so a story is reproducible. */
  seed: number
  createdAt: number
  /** The first page of every story. Always 1, like a real gamebook. */
  firstPage: number
  /** Page numbers run from 1 to this, handed out at random like a gamebook. */
  pageCount: number
  choicesPerPage: number
  /** Who reads it aloud, chosen on the cover. Older stories have none; see storyVoice(). */
  voice?: StoryVoice
  /** Narrators suggested before, so a new idea is different. */
  voiceHistory?: VoiceSuggestion[]
  /** How many new narrator ideas the tale has had (the book's own is the 0th). */
  voiceIdeas?: number
  /** What the story has cost in model calls so far. Older stories started without it. */
  cost?: StoryCost
  /** Pages at depths below this never end the story. */
  minDepth: number
  /** Every page at this depth is an ending. */
  maxDepth: number
}

/** A fact established on one branch; it holds only on the paths below that page. */
export interface Fact {
  id: string
  text: string
}

export interface Choice {
  text: string
  page: number
}

export type PageStatus = 'pending' | 'generating' | 'ready' | 'failed'

export interface PageNode {
  storyId: string
  number: number
  parent: number | null
  depth: number
  /** The choice on the parent page that leads here (null on the first page). */
  choiceText: string | null
  status: PageStatus
  /** When a generation claimed this page; used to reclaim abandoned claims. */
  claimedAt?: number
  error?: string
  text?: string
  choices?: Choice[]
  factsAdded?: Fact[]
  /** Ids of earlier facts that stop being true from this page on. */
  factsRetired?: string[]
  isEnding?: boolean
  endingTitle?: string
  /** Id of the library sketch the model chose for this page. */
  sketch?: string
  illustrationPrompt?: string
  /** How the page feels; shifts the narrator's reading. */
  mood?: Mood
  visits: number
  createdAt: number
}

export interface ChoiceView extends Choice {
  /** Whether any reader has turned to this page yet. */
  explored: boolean
}

/** The part of a page the reader's browser needs. */
export interface PageView {
  storyId: string
  number: number
  parent: number | null
  depth: number
  status: PageStatus
  text?: string
  choices?: ChoiceView[]
  isEnding?: boolean
  endingTitle?: string
  /** Where the page's sketch is served from, if it has one. */
  sketchUrl?: string
  /** Where the page's narration is served from, when narration is on. */
  narrationUrl?: string
  visits: number
}

/** One page's place in the story's tree, for the map on the cover. No text: the map never spoils. */
export interface MapNode {
  number: number
  parent: number | null
  /** Someone has turned to it and it has been written. */
  written: boolean
  isEnding: boolean
}

export interface StorySummary {
  id: string
  title: string
  premise: string
  theme: ThemeId
  pagesWritten: number
  endingsFound: number
  createdAt: number
}
