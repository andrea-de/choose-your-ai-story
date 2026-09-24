import { GoogleGenAI } from '@google/genai'
import type { Theme } from '../themes'
import {
  bibleJsonSchema,
  bibleSchema,
  pageDraftJsonSchema,
  pageDraftSchema,
  type PageDraft,
} from '../story/schema'
import { biblePrompt, illustrationPrompt, pagePrompt, type PageRequest } from '../story/prompts'
import type { StoryBible, StoryConfig } from '../story/types'
import type { Illustration, StoryTeller } from './types'

export const DEFAULT_TEXT_MODEL = 'gemini-3.8-flash'
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-lite-image'

/** The subset of the SDK this module uses, so tests can pass a fake. */
export interface GenAiClient {
  models: Pick<GoogleGenAI['models'], 'generateContent'>
}

export interface GeminiOptions {
  apiKey?: string
  client?: GenAiClient
  textModel?: string
  imageModel?: string
}

export class GeminiStoryTeller implements StoryTeller {
  readonly name = 'gemini'
  private readonly client: GenAiClient
  private readonly textModel: string
  private readonly imageModel: string

  constructor(options: GeminiOptions) {
    if (!options.client && !options.apiKey) throw new Error('GeminiStoryTeller needs an apiKey or client')
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey })
    this.textModel = options.textModel ?? DEFAULT_TEXT_MODEL
    this.imageModel = options.imageModel ?? DEFAULT_IMAGE_MODEL
  }

  async writeBible(config: StoryConfig, theme: Theme): Promise<StoryBible> {
    const json = await this.generateJson(biblePrompt(config, theme), bibleJsonSchema, 1.1)
    return bibleSchema.parse(json)
  }

  async writePage(request: PageRequest): Promise<PageDraft> {
    const json = await this.generateJson(pagePrompt(request), pageDraftJsonSchema, 0.9)
    return pageDraftSchema.parse(json)
  }

  async drawIllustration(subject: string, theme: Theme): Promise<Illustration> {
    const response = await this.client.models.generateContent({
      model: this.imageModel,
      contents: illustrationPrompt(subject, theme),
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      },
    })
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          mimeType: part.inlineData.mimeType ?? 'image/png',
          data: Uint8Array.from(Buffer.from(part.inlineData.data, 'base64')),
        }
      }
    }
    throw new Error('Gemini returned no image')
  }

  private async generateJson(prompt: string, schema: unknown, temperature: number): Promise<unknown> {
    const response = await this.client.models.generateContent({
      model: this.textModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        temperature,
      },
    })
    const text = response.text
    if (!text) throw new Error('Gemini returned an empty response')
    return JSON.parse(text)
  }
}
