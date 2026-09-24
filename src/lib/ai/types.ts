import type { Theme } from '../themes'
import type { PageDraft } from '../story/schema'
import type { PageRequest } from '../story/prompts'
import type { StoryBible, StoryConfig } from '../story/types'

export interface Illustration {
  mimeType: string
  data: Uint8Array
}

/** Everything the app needs from a model. Swap implementations freely. */
export interface StoryTeller {
  readonly name: string
  writeBible(config: StoryConfig, theme: Theme): Promise<StoryBible>
  writePage(request: PageRequest): Promise<PageDraft>
  drawIllustration(subject: string, theme: Theme): Promise<Illustration>
}
