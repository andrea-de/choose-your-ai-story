import { SPEECH_SAMPLE_RATE, type Illustration, type Narration, type StoryTeller } from '../ai/types'
import { pcmToWav, wavToPcm } from '../ai/wav'
import type { StoryStore } from '../store/types'
import { isSketchId, sketchUrl } from '../sketches'
import { getTheme } from '../themes'
import {
  isMood,
  narratorOf,
  narratorTreatment,
  presetFor,
  seedSuggestion,
  type NarratorSpec,
  type StoryVoice,
  type Treatment,
} from '../voices'
import type { PageDraft, NewStoryRequest } from './schema'
import { NAME_INITIALS } from './prompts'
import { pick } from './random'
import { addUsage, costOf, emptyCost, totalUsd, type Meter, type StoryCost, type Usage } from '../ai/pricing'
import { concat, LiveRecording } from './recording'
import { allocatePageNumbers, factsAlongPath, pathTo, shouldEnd } from './tree'
import type { MapNode, PageNode, PageView, Story, StoryConfig, StorySummary } from './types'

export class StoryNotFoundError extends Error {}
export class PageNotFoundError extends Error {}
export class GenerationError extends Error {}

export interface StoryServiceOptions {
  now?: () => number
  random?: () => number
  sleep?: (ms: number) => Promise<void>
  /** A claim older than this is treated as abandoned and may be retaken. */
  staleAfterMs?: number
  /** How long to wait for another request that is writing the same page. */
  waitTimeoutMs?: number
  pollMs?: number
  /**
   * How pages get their sketch: "library" (default) has the model pick from the
   * hand-drawn set at no cost; "generate" asks the image model for a new drawing
   * (paid per image); "off" shows none.
   */
  sketches?: SketchMode
  /** Whether pages can be read aloud. Narration is generated only when a reader asks for it. */
  narration?: boolean
}

export type SketchMode = 'library' | 'generate' | 'off'

/** A narration on its way to a listener: raw 16-bit mono PCM. */
export interface NarrationStream {
  audio: ReadableStream<Uint8Array>
  sampleRate: number
  /** Known when the recording is already complete. */
  durationMs?: number
  /** The sound treatment the tale's narrator gets (a robot, an old radio…), applied as it streams. */
  treatment: Treatment
}

/** The tale's voice can no longer change: something has been read aloud in it. */
export class VoiceLockedError extends Error {}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

const DEFAULTS = {
  pageCount: 400,
  choicesPerPage: 2,
  minDepth: 4,
  maxDepth: 8,
}

export class StoryService {
  private readonly now: () => number
  private readonly random: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly staleAfterMs: number
  private readonly waitTimeoutMs: number
  private readonly pollMs: number
  private readonly sketches: SketchMode
  private readonly narration: boolean
  /** In-process single flight: one generation per page per server. */
  private readonly inflight = new Map<string, Promise<PageNode>>()
  private readonly drawing = new Map<string, Promise<Illustration>>()
  private readonly recordings = new Map<string, LiveRecording>()
  /** Summaries read aloud to try out voices, by story, voice and suggestion. */
  private readonly previews = new Map<string, Uint8Array>()

  constructor(
    private readonly store: StoryStore,
    private readonly teller: StoryTeller,
    options: StoryServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.staleAfterMs = options.staleAfterMs ?? 120_000
    this.waitTimeoutMs = options.waitTimeoutMs ?? 90_000
    this.pollMs = options.pollMs ?? 400
    this.sketches = options.sketches ?? 'library'
    this.narration = options.narration ?? false
  }

  get tellerName() {
    return this.teller.name
  }

  /** Whether pages (and voice previews) can be read aloud on this server. */
  get canNarrate() {
    return this.narration
  }

  /** Fills in anything the reader left blank, like rolling the dice. */
  rollConfig(request: NewStoryRequest = {}): StoryConfig {
    const theme = getTheme(request.theme ?? 'historic-fantasy')
    return {
      theme: theme.id,
      hero: request.hero || pick(theme.heroes, this.random),
      setting: request.setting || pick(theme.settings, this.random),
      // One or two moods, as the dice would roll them.
      tone:
        request.tone ||
        (this.random() < 0.5
          ? pick(theme.tones, this.random)
          : [...new Set([pick(theme.tones, this.random), pick(theme.tones, this.random)])].join(' and ')),
    }
  }

  async createStory(request: NewStoryRequest = {}): Promise<Story> {
    const config = this.rollConfig(request)
    const initials = [...NAME_INITIALS].sort(() => this.random() - 0.5).slice(0, 4)
    // The plan is written before the story exists, so its cost is gathered here and saved with it.
    let cost: StoryCost | undefined
    const bible = await this.teller.writeBible(config, getTheme(config.theme), { nameInitials: initials }, (usage) => {
      cost = addUsage(cost, usage, this.now())
      logUsage('new story', usage, totalUsd(cost))
    })
    const createdAt = this.now()
    const story: Story = {
      id: makeId(this.random),
      config,
      bible,
      seed: Math.floor(this.random() * 2 ** 32),
      createdAt,
      firstPage: 1,
      ...DEFAULTS,
      cost,
      // The book's own character narrator to start with; the cover can change it until anything is recorded.
      voice: { chosen: 'suggested', suggestion: seedSuggestion(config.theme), locked: false },
    }
    await this.store.createStory(story, {
      storyId: story.id,
      number: story.firstPage,
      parent: null,
      depth: 0,
      choiceText: null,
      status: 'pending',
      visits: 0,
      createdAt,
    })
    return story
  }

  async getStory(id: string): Promise<Story> {
    const story = await this.store.getStory(id)
    if (!story) throw new StoryNotFoundError(`No story ${id}`)
    return story
  }

  async listStories(limit = 20): Promise<StorySummary[]> {
    const stories = await this.store.listStories(limit)
    return Promise.all(
      stories.map(async (story) => {
        const pages = [...(await this.store.getPages(story.id)).values()]
        return {
          id: story.id,
          title: story.bible.title,
          premise: story.bible.premise,
          theme: story.config.theme,
          pagesWritten: pages.filter((p) => p.status === 'ready').length,
          endingsFound: pages.filter((p) => p.isEnding).length,
          createdAt: story.createdAt,
        }
      }),
    )
  }

  /** Every page's place in the tree: written, or waiting behind a choice. */
  async storyMap(storyId: string): Promise<MapNode[]> {
    await this.getStory(storyId)
    const pages = [...(await this.store.getPages(storyId)).values()]
    return pages
      .map((p) => ({ number: p.number, parent: p.parent, written: p.status === 'ready', isEnding: p.isEnding === true }))
      .sort((a, b) => a.number - b.number)
  }

  /** What the story has cost so far, in model calls. */
  async storyCost(storyId: string): Promise<StoryCost> {
    return (await this.getStory(storyId)).cost ?? emptyCost()
  }

  /** A meter for one story: each call's usage is logged and added to the story's running cost. */
  private meter(storyId: string, what: string): Meter {
    return (usage) => {
      const at = this.now()
      void this.store
        .recordUsage(storyId, usage, at)
        .then(() => this.store.getStory(storyId))
        .then((story) => logUsage(`${storyId} ${what}`, usage, totalUsd(story?.cost)))
        .catch(() => {
          // Keeping the tally must never break a page.
        })
    }
  }

  /** Returns the page if already written, without generating it. */
  async peekPage(storyId: string, number: number): Promise<PageNode> {
    const page = await this.store.getPage(storyId, number)
    if (!page) {
      await this.getStory(storyId)
      throw new PageNotFoundError(`Story ${storyId} has no page ${number}`)
    }
    return page
  }

  /** Returns the page, writing it first if nobody has yet. */
  async readPage(storyId: string, number: number, { countVisit = false } = {}): Promise<PageNode> {
    const page = await this.peekPage(storyId, number)
    const ready = page.status === 'ready' ? page : await this.ensureWritten(storyId, number)
    if (countVisit) {
      await this.store.recordVisit(storyId, number)
      ready.visits += 1
    }
    return ready
  }

  /**
   * Writes the pages behind each choice so they are ready when the reader turns.
   * (Narration is not recorded ahead: it streams, so it starts within a second anyway.)
   */
  async prefetchChoices(storyId: string, number: number): Promise<void> {
    const page = await this.store.getPage(storyId, number)
    if (page?.status !== 'ready' || !page.choices) return
    await Promise.all(
      page.choices.map((c) =>
        this.ensureWritten(storyId, c.page).catch(() => {
          // A failed prefetch is retried when the reader actually turns there.
        }),
      ),
    )
  }

  ensureWritten(storyId: string, number: number): Promise<PageNode> {
    const key = `${storyId}:${number}`
    let flight = this.inflight.get(key)
    if (!flight) {
      flight = this.writeOrWait(storyId, number).finally(() => this.inflight.delete(key))
      this.inflight.set(key, flight)
    }
    return flight
  }

  private async writeOrWait(storyId: string, number: number): Promise<PageNode> {
    const deadline = this.now() + this.waitTimeoutMs
    for (;;) {
      const page = await this.peekPage(storyId, number)
      if (page.status === 'ready') return page
      const now = this.now()
      if (await this.store.claimPage(storyId, number, now, now - this.staleAfterMs)) {
        return this.write(storyId, number)
      }
      // Another server is writing it; wait for them.
      if (now > deadline) throw new GenerationError(`Timed out waiting for page ${number}`)
      await this.sleep(this.pollMs)
    }
  }

  private async write(storyId: string, number: number): Promise<PageNode> {
    try {
      const story = await this.getStory(storyId)
      const pages = await this.store.getPages(storyId)
      const path = pathTo(pages, number)
      const page = path[path.length - 1]
      const earlier = path.slice(0, -1)
      const facts = factsAlongPath(earlier)
      const mustEnd = shouldEnd(story, number, page.depth)
      const theme = getTheme(story.config.theme)

      const request = {
        bible: story.bible,
        theme,
        config: story.config,
        path: earlier.map((p) => ({ text: p.text ?? '', choiceText: p.choiceText })),
        facts,
        choiceText: page.choiceText,
        mustEnd,
        choicesCount: story.choicesPerPage,
        depth: page.depth,
        maxDepth: story.maxDepth,
        previousSketch: earlier.at(-1)?.sketch,
      }
      const draft = await this.draftWithRetry(
        () => this.teller.writePage(request, this.meter(storyId, `page ${number}`)),
        mustEnd,
        story.choicesPerPage,
      )

      const used = new Set(pages.keys())
      const numbers = mustEnd ? [] : allocatePageNumbers(story, number, used, story.choicesPerPage)
      const choiceTexts = draft.choices.slice(0, story.choicesPerPage)
      const knownFacts = new Set(facts.map((f) => f.id))
      const now = this.now()

      const written: PageNode = {
        ...page,
        status: 'ready',
        claimedAt: undefined,
        error: undefined,
        text: tidy(draft.text),
        choices: mustEnd ? [] : choiceTexts.map((text, i) => ({ text: tidyLine(text), page: numbers[i] })),
        factsAdded: draft.newFacts.map((text, i) => ({ id: `p${number}.${i + 1}`, text: tidyLine(text) })),
        factsRetired: draft.retiredFactIds.filter((id) => knownFacts.has(id)),
        isEnding: mustEnd,
        endingTitle: mustEnd ? tidyLine(draft.endingTitle) || 'The End' : undefined,
        sketch: isSketchId(draft.sketch) ? draft.sketch : undefined,
        illustrationPrompt: draft.illustrationPrompt,
        mood: isMood(draft.mood) ? draft.mood : undefined,
      }
      const children: PageNode[] = (written.choices ?? []).map((choice) => ({
        storyId,
        number: choice.page,
        parent: number,
        depth: page.depth + 1,
        choiceText: choice.text,
        status: 'pending',
        visits: 0,
        createdAt: now,
      }))
      await this.store.completePage(storyId, written, children)
      return written
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.store.failPage(storyId, number, message)
      throw new GenerationError(`Could not write page ${number}: ${message}`)
    }
  }

  /** Models occasionally return too few choices; ask once more before giving up. */
  private async draftWithRetry(write: () => Promise<PageDraft>, mustEnd: boolean, choices: number) {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const draft = await write()
        if (!mustEnd && draft.choices.length < choices) {
          throw new Error(`expected ${choices} choices, got ${draft.choices.length}`)
        }
        return draft
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }

  /** A page as the reader sees it, including which choices others have taken. */
  async viewPage(storyId: string, page: PageNode): Promise<PageView> {
    return toPageView(page, await this.store.getPages(storyId), this.sketches, this.narration)
  }

  async getIllustration(storyId: string, number: number): Promise<Illustration> {
    if (this.sketches !== 'generate') throw new PageNotFoundError('Sketches are not generated in this mode')
    const cached = await this.store.getIllustration(storyId, number)
    if (cached) return cached
    const key = `${storyId}:${number}`
    let flight = this.drawing.get(key)
    if (!flight) {
      flight = this.draw(storyId, number).finally(() => this.drawing.delete(key))
      this.drawing.set(key, flight)
    }
    return flight
  }

  private async draw(storyId: string, number: number): Promise<Illustration> {
    const story = await this.getStory(storyId)
    const page = await this.peekPage(storyId, number)
    if (page.status !== 'ready' || !page.illustrationPrompt) {
      throw new PageNotFoundError(`Page ${number} has no illustration yet`)
    }
    const illustration = await this.teller.drawIllustration(
      page.illustrationPrompt,
      getTheme(story.config.theme),
      this.meter(storyId, `sketch ${number}`),
    )
    await this.store.saveIllustration(storyId, number, illustration)
    return illustration
  }

  /**
   * The page read aloud, as raw PCM. Recorded (and streamed as it is spoken) the
   * first time anyone listens, then kept for everyone. Listeners who arrive while
   * it is being recorded share that recording.
   */
  async listen(storyId: string, number: number): Promise<NarrationStream> {
    if (!this.narration) throw new PageNotFoundError('Narration is off')
    const story = await this.getStory(storyId)
    const treatment = narratorTreatment(story.config.theme, narratorOf(storyVoice(story)))
    const cached = await this.store.getNarration(storyId, number)
    if (cached) {
      const { pcm, sampleRate } = wavToPcm(cached.data)
      return { audio: streamOf(pcm), sampleRate, durationMs: (pcm.length / 2 / sampleRate) * 1000, treatment }
    }
    const recording = await this.recording(storyId, number)
    return { audio: recording.listen(), sampleRate: SPEECH_SAMPLE_RATE, treatment }
  }

  // ---------- The tale's voice, chosen on its cover ----------

  async voiceState(storyId: string): Promise<StoryVoice> {
    return storyVoice(await this.getStory(storyId))
  }

  /** A new narrator idea for the tale, different from the ones before. */
  async suggestVoice(storyId: string): Promise<StoryVoice> {
    const story = await this.getStory(storyId)
    const voice = storyVoice(story)
    if (voice.locked) throw new VoiceLockedError('This tale already has its voice')
    const history = [...(story.voiceHistory ?? []), voice.suggestion]
    const previous = history.slice(-6)
    // Every other idea is one of the book's treated voices, in turn (robots, radios, temple echoes);
    // the ones between are people the model casts.
    const index = (story.voiceIdeas ?? 0) + 1
    const suggestion =
      presetFor(story.config.theme, index) ??
      (await this.teller.suggestVoice(
        { theme: getTheme(story.config.theme), config: story.config, premise: story.bible.premise, previous },
        this.meter(storyId, 'voice idea'),
      ))
    const next: StoryVoice = { ...voice, suggestion, chosen: 'suggested' }
    await this.store.updateStory(storyId, { voice: next, voiceHistory: history.slice(-20), voiceIdeas: index })
    return next
  }

  /** The reader is happy with the voice and begins the tale: it is fixed from now on. */
  async confirmVoice(storyId: string): Promise<StoryVoice> {
    const voice = storyVoice(await this.getStory(storyId))
    if (voice.locked) return voice
    const next: StoryVoice = { ...voice, locked: true }
    await this.store.updateStory(storyId, { voice: next })
    return next
  }

  async chooseVoice(storyId: string, chosen: StoryVoice['chosen']): Promise<StoryVoice> {
    const voice = storyVoice(await this.getStory(storyId))
    if (voice.locked) throw new VoiceLockedError('This tale already has its voice')
    const next: StoryVoice = { ...voice, chosen }
    await this.store.updateStory(storyId, { voice: next })
    return next
  }

  /**
   * The tale's summary read aloud by the standard narrator or the suggested one,
   * so the reader can hear them before choosing. Kept, so hearing it again is free.
   */
  async previewVoice(storyId: string, which: StoryVoice['chosen']): Promise<NarrationStream> {
    if (!this.narration) throw new PageNotFoundError('Narration is off')
    const story = await this.getStory(storyId)
    const voice = storyVoice(story)
    const narrator: NarratorSpec = which === 'standard' ? { kind: 'standard' } : { kind: 'suggested', suggestion: voice.suggestion }
    const treatment = narratorTreatment(story.config.theme, narrator)
    const key = `preview:${storyId}:${which}:${which === 'suggested' ? JSON.stringify(voice.suggestion) : ''}`
    const kept = this.previews.get(key)
    if (kept) return { audio: streamOf(kept), sampleRate: SPEECH_SAMPLE_RATE, durationMs: (kept.length / 2 / SPEECH_SAMPLE_RATE) * 1000, treatment }
    let recording = this.recordings.get(key)
    if (!recording) {
      const live = new LiveRecording()
      recording = live
      this.recordings.set(key, live)
      void (async () => {
        try {
          const chunks: Uint8Array[] = []
          const speech = this.teller.narrate(
            { theme: story.config.theme, tone: story.config.tone, narrator, text: story.bible.premise },
            this.meter(storyId, `voice preview (${which})`),
          )
          for await (const chunk of speech) {
            chunks.push(chunk)
            live.push(chunk)
          }
          this.previews.set(key, concat(chunks))
          live.finish()
        } catch (error) {
          live.fail(new GenerationError(`Could not preview the voice: ${error instanceof Error ? error.message : String(error)}`))
        } finally {
          this.recordings.delete(key)
        }
      })()
    }
    return { audio: recording.listen(), sampleRate: SPEECH_SAMPLE_RATE, treatment }
  }

  /** The whole narration as a WAV file, waiting for it to be recorded if need be. */
  async getNarration(storyId: string, number: number): Promise<Narration> {
    if (!this.narration) throw new PageNotFoundError('Narration is off')
    const cached = await this.store.getNarration(storyId, number)
    if (cached) return cached
    const pcm = await (await this.recording(storyId, number)).finished
    return { mimeType: 'audio/wav', data: pcmToWav(pcm, SPEECH_SAMPLE_RATE) }
  }

  private async recording(storyId: string, number: number): Promise<LiveRecording> {
    const key = `${storyId}:${number}`
    const live = this.recordings.get(key)
    if (live) return live
    const story = await this.getStory(storyId)
    const page = await this.peekPage(storyId, number)
    if (page.status !== 'ready' || !page.text) throw new PageNotFoundError(`Page ${number} is not written yet`)
    // Someone else may have started it while we looked the page up.
    const started = this.recordings.get(key)
    if (started) return started
    const recording = new LiveRecording()
    this.recordings.set(key, recording)
    void this.record(recording, story, page).finally(() => this.recordings.delete(key))
    return recording
  }

  private async record(recording: LiveRecording, story: Story, page: PageNode): Promise<void> {
    const chunks: Uint8Array[] = []
    try {
      // The first page read aloud fixes the tale's voice: every recording must sound alike.
      if (story.voice && !story.voice.locked) {
        await this.store.updateStory(story.id, { voice: { ...story.voice, locked: true } })
      }
      const speech = this.teller.narrate({
        theme: story.config.theme,
        tone: story.config.tone,
        narrator: narratorOf(storyVoice(story)),
        mood: page.mood,
        isEnding: page.isEnding,
        text: page.text ?? '',
      }, this.meter(story.id, `narration ${page.number}`))
      for await (const chunk of speech) {
        chunks.push(chunk)
        recording.push(chunk)
      }
      // Saved before the recording ends, so a listener arriving now finds it either live or stored.
      await this.store.saveNarration(story.id, page.number, {
        mimeType: 'audio/wav',
        data: pcmToWav(concat(chunks), SPEECH_SAMPLE_RATE),
      })
      recording.finish()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      recording.fail(new GenerationError(`Could not narrate page ${page.number}: ${message}`))
    }
  }
}

export function toPageView(
  page: PageNode,
  pages: ReadonlyMap<number, PageNode> = new Map(),
  sketches: SketchMode = 'library',
  narration = false,
): PageView {
  return {
    storyId: page.storyId,
    number: page.number,
    parent: page.parent,
    depth: page.depth,
    status: page.status,
    text: page.text,
    choices: page.choices?.map((c) => ({ ...c, explored: (pages.get(c.page)?.visits ?? 0) > 0 })),
    isEnding: page.isEnding,
    endingTitle: page.endingTitle,
    sketchUrl: sketchUrlFor(page, sketches),
    narrationUrl:
      narration && page.status === 'ready' ? `/api/stories/${page.storyId}/pages/${page.number}/narration` : undefined,
    visits: page.visits,
  }
}

function sketchUrlFor(page: PageNode, mode: SketchMode): string | undefined {
  if (mode === 'library') return isSketchId(page.sketch) ? sketchUrl(page.sketch) : undefined
  if (mode === 'generate' && page.illustrationPrompt) {
    return `/api/stories/${page.storyId}/pages/${page.number}/illustration`
  }
  return undefined
}

function makeId(random: () => number): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let id = ''
  for (let i = 0; i < 10; i++) id += alphabet[Math.floor(random() * alphabet.length)]
  return id
}

function tidy(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

function tidyLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** One line per model call in the server log: what it was, its tokens, its cost, and the story's total. */
function logUsage(what: string, usage: Usage, storyTotal: number) {
  if (process.env.NODE_ENV === 'test') return
  console.info(
    `[cost] ${what}: ${usage.kind} ${usage.inputTokens} in / ${usage.outputTokens} out, ` +
      `$${costOf(usage).toFixed(4)} (story so far $${storyTotal.toFixed(4)})`,
  )
}

/**
 * A story's voice settings. Stories begun before the cover chose voices have
 * none: they keep the narrator they had, and are locked, since they may have
 * recordings already.
 */
export function storyVoice(story: Story): StoryVoice {
  return (
    story.voice ?? {
      chosen: story.config.narrator === 'plain' ? 'standard' : 'suggested',
      suggestion: seedSuggestion(story.config.theme),
      locked: true,
    }
  )
}
