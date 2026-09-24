export type ThemeId = 'historic-fantasy' | 'future' | 'noir' | 'pirate' | 'ancient' | 'dream'

/** What the reader picked (or the dice rolled) on the opening screen. */
export interface StoryConfig {
  theme: ThemeId
  hero: string
  setting: string
  tone: string
}

export interface Character {
  name: string
  description: string
}

/** Written once when a story begins; shared by every branch. */
export interface StoryBible {
  title: string
  premise: string
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
  visits: number
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
