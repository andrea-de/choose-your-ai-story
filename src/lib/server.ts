import 'server-only'
import path from 'node:path'
import { GeminiStoryTeller } from './ai/gemini'
import { MockStoryTeller } from './ai/mock'
import type { StoryTeller } from './ai/types'
import { MemoryStore } from './store/memory'
import { StoryService } from './story/service'

function createTeller(env: NodeJS.ProcessEnv): StoryTeller {
  const provider = env.AI_PROVIDER ?? (env.GEMINI_API_KEY ? 'gemini' : 'mock')
  if (provider === 'gemini') {
    return new GeminiStoryTeller({
      apiKey: env.GEMINI_API_KEY,
      textModel: env.GEMINI_TEXT_MODEL,
      imageModel: env.GEMINI_IMAGE_MODEL,
    })
  }
  if (provider === 'mock') return new MockStoryTeller(Number(env.MOCK_AI_DELAY_MS ?? 600))
  throw new Error(`Unknown AI_PROVIDER "${provider}"`)
}

export function createService(env: NodeJS.ProcessEnv = process.env): StoryService {
  const store = env.STORY_STORE === 'memory' ? new MemoryStore() : new MemoryStore(path.join(process.cwd(), '.data'))
  return new StoryService(store, createTeller(env), { sketches: env.SKETCHES !== 'off' })
}

const globalForService = globalThis as unknown as { storyService?: StoryService }

/** One service per server process, surviving hot reloads in development. */
export function getService(): StoryService {
  globalForService.storyService ??= createService()
  return globalForService.storyService
}

export const prefetchEnabled = () => process.env.PREFETCH_CHOICES !== 'false'
