import { GoogleGenAI } from '@google/genai'
import type { Theme } from '../themes'
import {
  bibleJsonSchema,
  bibleSchema,
  pageDraftJsonSchema,
  pageDraftSchema,
  voiceSuggestionJsonSchema,
  shortLabel,
  voiceSuggestionSchema,
  type PageDraft,
} from '../story/schema'
import {
  biblePrompt,
  illustrationPrompt,
  pagePrompt,
  voicePrompt,
  type BibleOptions,
  type PageRequest,
  type VoiceRequest,
} from '../story/prompts'
import type { StoryBible, StoryConfig } from '../story/types'
import { narrationStyle, narratorVoice, type NarrationRequest, type VoiceSuggestion } from '../voices'
import type { Meter, UsageKind } from './pricing'
import { SPEECH_SAMPLE_RATE, type Illustration, type StoryTeller } from './types'
import { pcmRate } from './wav'

export const DEFAULT_TEXT_MODEL = 'gemini-3.8-flash'
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-lite-image'
export const DEFAULT_SPEECH_MODEL = 'gemini-3.8-flash-tts'

/** The subset of the SDK this module uses, so tests can pass a fake. */
export interface GenAiClient {
  models: Pick<GoogleGenAI['models'], 'generateContent' | 'generateContentStream'>
}

export interface GeminiOptions {
  apiKey?: string
  client?: GenAiClient
  /** For narration, which goes to the Interactions endpoint directly; tests pass a fake. */
  fetch?: typeof fetch
  textModel?: string
  imageModel?: string
  speechModel?: string
}

export class GeminiStoryTeller implements StoryTeller {
  readonly name = 'gemini'
  private readonly client: GenAiClient
  private readonly textModel: string
  private readonly imageModel: string
  private readonly speechModel: string

  private readonly apiKey: string
  private readonly fetchFn: typeof fetch

  constructor(options: GeminiOptions) {
    if (!options.client && !options.apiKey) throw new Error('GeminiStoryTeller needs an apiKey or client')
    this.apiKey = options.apiKey ?? ''
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args))
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey })
    this.textModel = options.textModel ?? DEFAULT_TEXT_MODEL
    this.imageModel = options.imageModel ?? DEFAULT_IMAGE_MODEL
    this.speechModel = options.speechModel ?? DEFAULT_SPEECH_MODEL
  }

  async writeBible(config: StoryConfig, theme: Theme, options?: BibleOptions, meter?: Meter): Promise<StoryBible> {
    const json = await this.generateJson(biblePrompt(config, theme, options), bibleJsonSchema, 1.1, meter)
    return bibleSchema.parse(json)
  }

  async writePage(request: PageRequest, meter?: Meter): Promise<PageDraft> {
    const json = await this.generateJson(pagePrompt(request), pageDraftJsonSchema, 0.9, meter)
    return pageDraftSchema.parse(json)
  }

  async drawIllustration(subject: string, theme: Theme, meter?: Meter): Promise<Illustration> {
    const response = await this.client.models.generateContent({
      model: this.imageModel,
      contents: illustrationPrompt(subject, theme),
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      },
    })
    report(meter, 'image', this.imageModel, response.usageMetadata)
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

  /**
   * Streams the reading, through the Interactions endpoint that Google's speech
   * guide recommends: the page as the text, a short style phrase as speech
   * metadata, and a voice from the cast. The first audio arrives in about a
   * second and a half, well ahead of real time after that.
   */
  async *narrate(request: NarrationRequest, meter?: Meter): AsyncIterable<Uint8Array> {
    const res = await this.fetchFn(`${INTERACTIONS_URL}?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        model: this.speechModel,
        stream: true,
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text: request.text,
                annotations: [{ type: 'speech_metadata', style: narrationStyle(request) }],
              },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: narratorVoice(request.theme, request.narrator) }] },
      }),
    })
    if (!res.ok || !res.body) throw new Error(`Speech failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`)
    let any = false
    let usage: { total_input_tokens?: number; total_output_tokens?: number } | undefined
    for await (const event of serverSentEvents(res.body)) {
      if (event.event_type === 'step.delta') {
        const delta = event.delta as { data?: string; mime_type?: string } | undefined
        if (!delta?.data) continue
        if (pcmRate(delta.mime_type ?? '', SPEECH_SAMPLE_RATE) !== SPEECH_SAMPLE_RATE) {
          throw new Error(`Unexpected speech sample rate in ${delta.mime_type}`)
        }
        any = true
        yield Uint8Array.from(Buffer.from(delta.data, 'base64'))
      } else if (event.event_type === 'interaction.completed') {
        usage = (event.interaction as { usage?: typeof usage } | undefined)?.usage
      } else if (event.event_type === 'error' || event.error) {
        throw new Error(`Speech failed: ${JSON.stringify(event.error ?? event).slice(0, 200)}`)
      }
    }
    if (meter && usage) {
      meter({
        kind: 'speech',
        model: this.speechModel,
        inputTokens: usage.total_input_tokens ?? 0,
        outputTokens: usage.total_output_tokens ?? 0,
      })
    }
    if (!any) throw new Error('Gemini returned no audio')
  }

  async suggestVoice(request: VoiceRequest, meter?: Meter): Promise<VoiceSuggestion> {
    const json = await this.generateJson(voicePrompt(request), voiceSuggestionJsonSchema, 1.1, meter)
    const idea = voiceSuggestionSchema.parse(json)
    // The model's ideas are people; the treated voices (robots, radios) are made by hand.
    return { label: shortLabel(idea.label), voice: idea.voice, style: idea.style, treatment: 'none' }
  }

  private async generateJson(prompt: string, schema: unknown, temperature: number, meter?: Meter): Promise<unknown> {
    const response = await withRetry(() => this.client.models.generateContent({
      model: this.textModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        temperature,
      },
    }))
    report(meter, 'text', this.textModel, response.usageMetadata)
    const text = response.text
    if (!text) throw new Error('Gemini returned an empty response')
    return JSON.parse(text)
  }
}

interface UsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
}

/** Passes a call's token counts to the meter. Thinking is billed as output. */
function report(meter: Meter | undefined, kind: UsageKind, model: string, usage: UsageMetadata | undefined) {
  if (!meter || !usage) return
  meter({
    kind,
    model,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  })
}

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'

/** The JSON events of a server-sent event stream. */
async function* serverSentEvents(body: ReadableStream<Uint8Array>): AsyncIterable<Record<string, unknown>> {
  const decoder = new TextDecoder()
  let buffer = ''
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim()
      buffer = buffer.slice(end + 1)
      if (!line.startsWith('data:')) continue
      try {
        yield JSON.parse(line.slice(5))
      } catch {
        // Not JSON (an end marker, say): nothing to read.
      }
    }
    if (done) return
  }
}

/**
 * Tries again after a short wait when Gemini is briefly overloaded (503) or
 * rate-limiting (429): both pass in a moment, and a reader should not see them.
 */
export async function withRetry<T>(call: () => Promise<T>, waits: readonly number[] = [800, 2500]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call()
    } catch (error) {
      const status = (error as { status?: number }).status ?? Number(String(error).match(/"code":\s*(\d{3})/)?.[1])
      if (attempt >= waits.length || (status !== 503 && status !== 429)) throw error
      await new Promise((r) => setTimeout(r, waits[attempt]))
    }
  }
}
