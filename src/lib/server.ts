import 'server-only'
import path from 'node:path'
import { GeminiStoryTeller } from './ai/gemini'
import { MockStoryTeller } from './ai/mock'
import type { StoryTeller } from './ai/types'
import { MemoryStore } from './store/memory'
import { StoryService, type SketchMode } from './story/service'

function createTeller(env: NodeJS.ProcessEnv): StoryTeller {
  const provider = env.AI_PROVIDER ?? (env.GEMINI_API_KEY ? 'gemini' : 'mock')
  if (provider === 'gemini') {
    return new GeminiStoryTeller({
      apiKey: env.GEMINI_API_KEY,
      textModel: env.GEMINI_TEXT_MODEL,
      imageModel: env.GEMINI_IMAGE_MODEL,
      speechModel: env.GEMINI_SPEECH_MODEL,
    })
  }
  if (provider === 'mock') return new MockStoryTeller(Number(env.MOCK_AI_DELAY_MS ?? 600))
  throw new Error(`Unknown AI_PROVIDER "${provider}"`)
}

export function createService(env: NodeJS.ProcessEnv = process.env): StoryService {
  const store = env.STORY_STORE === 'memory' ? new MemoryStore() : new MemoryStore(path.join(process.cwd(), '.data'))
  const teller = createTeller(env)
  // Narration costs money with a real model, but nothing with the mock; either way it runs only for listeners.
  const narration = (env.NARRATION ?? 'on') !== 'off'
  return new StoryService(store, teller, { sketches: sketchMode(env.SKETCHES), narration })
}

function sketchMode(value: string | undefined): SketchMode {
  if (value === 'off' || value === 'generate') return value
  return 'library'
}

const globalForService = globalThis as unknown as { storyService?: StoryService }

/** One service per server process, surviving hot reloads in development. */
export function getService(): StoryService {
  globalForService.storyService ??= createService()
  return globalForService.storyService
}

export const prefetchEnabled = () => process.env.PREFETCH_CHOICES !== 'false'

/** Whether a story's running cost shows on its cover. On for now; SHOW_COSTS=false hides it from readers. */
export const showCosts = () => process.env.SHOW_COSTS !== 'false'
