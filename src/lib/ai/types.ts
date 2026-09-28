import type { Theme } from '../themes'
import type { PageDraft } from '../story/schema'
import type { BibleOptions, PageRequest, VoiceRequest } from '../story/prompts'
import type { StoryBible, StoryConfig } from '../story/types'
import type { NarrationRequest, VoiceSuggestion } from '../voices'
import type { Meter } from './pricing'

export interface Illustration {
  mimeType: string
  data: Uint8Array
}

/** A page read aloud, as stored: a WAV file. */
export interface Narration {
  mimeType: string
  data: Uint8Array
}

/** Speech arrives as raw 16-bit mono PCM at this rate. */
export const SPEECH_SAMPLE_RATE = 24000

/** Everything the app needs from a model. Swap implementations freely. */
export interface StoryTeller {
  readonly name: string
  /** Each call reports its token usage to `meter`, when given, so a story's cost can be kept. */
  writeBible(config: StoryConfig, theme: Theme, options?: BibleOptions, meter?: Meter): Promise<StoryBible>
  writePage(request: PageRequest, meter?: Meter): Promise<PageDraft>
  drawIllustration(subject: string, theme: Theme, meter?: Meter): Promise<Illustration>
  /** Reads a page aloud, yielding raw PCM (16-bit mono, SPEECH_SAMPLE_RATE) as it is spoken. */
  narrate(request: NarrationRequest, meter?: Meter): AsyncIterable<Uint8Array>
  /** A narrator to read a tale aloud, different from the ones already suggested. */
  suggestVoice(request: VoiceRequest, meter?: Meter): Promise<VoiceSuggestion>
}
