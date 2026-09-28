import 'server-only'
import { spawn } from 'node:child_process'
import type { Treatment } from '../voices'

/**
 * The sound of each treatment, as an ffmpeg filter from [in] to [out]. Chosen by
 * ear-free reasoning and kept mild, so every word stays clear:
 * - robot: the voice with a little of a 50Hz ring-modulated copy of itself (the
 *   classic sci-fi robot) and a light 7ms comb echo for a metallic edge. Dialled
 *   back after listening: fuller, it sounded too synthesised.
 * - droid: a lighter bit-crushed voice with a faster ring, for small chirpy machines.
 * - ai: a very short doubled delay and a soft chorus: a clean, digital sheen.
 * - radio: the thin band of an old wireless, gently compressed.
 * - temple: two soft echoes, as off stone walls.
 * - dream: a slow shimmering chorus with a faint echo.
 */
const TREATMENT_FILTERS: Record<Treatment, string | null> = {
  none: null,
  robot:
    "[in]asplit[dry][wet];[wet]aeval='val(0)*sin(2*PI*50*t)':c=same[ring];" +
    "[dry][ring]amix=inputs=2:weights='0.8 0.3':normalize=0,aecho=0.8:0.7:7:0.28,highpass=f=140,volume=0.95[out]",
  droid:
    "[in]acrusher=bits=8:samples=2:mix=0.2:mode=lin,asplit[dry][wet];[wet]aeval='val(0)*sin(2*PI*110*t)':c=same[ring];" +
    "[dry][ring]amix=inputs=2:weights='0.85 0.22':normalize=0,highpass=f=220,volume=1.05[out]",
  ai:
    '[in]asplit[dry][wet];[wet]adelay=14,volume=0.45[echo];' +
    "[dry][echo]amix=inputs=2:weights='1 0.6':normalize=0,chorus=0.8:0.9:22:0.3:0.35:1.2,highpass=f=110[out]",
  radio: '[in]highpass=f=300,lowpass=f=3400,acompressor=threshold=0.1:ratio=4:attack=5:release=80,volume=1.5[out]',
  temple: '[in]aecho=0.8:0.6:70|140:0.3|0.18[out]',
  dream: '[in]chorus=0.6:0.9:45|55:0.35|0.3:0.25|0.4:2|1.3,aecho=0.8:0.5:90:0.2[out]',
}

/** The ffmpeg filter graph for a treatment and a speed, or null when the audio needs neither. */
export function voiceFilter(treatment: Treatment, speed: number): string | null {
  const parts: string[] = []
  const effect = TREATMENT_FILTERS[treatment]
  if (effect) parts.push(effect.replace('[in]', '[0:a]').replace('[out]', speed === 1 ? '[out]' : '[mid]'))
  if (speed !== 1) parts.push(`${effect ? '[mid]' : '[0:a]'}atempo=${speed}[out]`)
  return parts.length ? parts.join(';') : null
}

/**
 * Gives a narration its sound treatment and speed as it streams: raw 16-bit mono
 * PCM in, the same out, through ffmpeg. Speed changes keep the voice's pitch
 * (atempo). Without ffmpeg on the server, the audio passes through unchanged.
 */
export function processVoice(
  audio: ReadableStream<Uint8Array>,
  sampleRate: number,
  { speed = 1, treatment = 'none' }: { speed?: number; treatment?: Treatment },
): ReadableStream<Uint8Array> {
  const graph = voiceFilter(treatment, speed)
  if (!graph) return audio
  const format = ['-f', 's16le', '-ar', String(sampleRate), '-ac', '1']
  const ff = spawn('ffmpeg', ['-v', 'error', ...format, '-i', 'pipe:0', '-filter_complex', graph, '-map', '[out]', ...format, 'pipe:1'])
  let failed = false
  return new ReadableStream<Uint8Array>({
    start(controller) {
      ff.stdout.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      ff.stdout.on('end', () => {
        if (!failed) controller.close()
      })
      ff.on('error', () => {
        // No ffmpeg: play at normal speed rather than not at all.
        failed = true
        void audio.pipeTo(new WritableStream({ write: (c) => controller.enqueue(c), close: () => controller.close() }))
      })
      ff.stdin.on('error', () => {})
      void (async () => {
        const reader = audio.getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done || failed) break
            if (!ff.stdin.write(value)) await new Promise((r) => ff.stdin.once('drain', r))
          }
        } catch (error) {
          controller.error(error)
        } finally {
          if (!failed) ff.stdin.end()
        }
      })()
    },
    cancel() {
      ff.kill()
    },
  })
}

/** The speeds a reader can choose. */
export const SPEEDS = [0.85, 1, 1.2, 1.4] as const

export function parseSpeed(value: string | null): number {
  const n = Number(value ?? 1)
  return (SPEEDS as readonly number[]).includes(n) ? n : 1
}

/** Speed alone: kept for callers that only change the pace. */
export const changeTempo = (audio: ReadableStream<Uint8Array>, sampleRate: number, speed: number) =>
  processVoice(audio, sampleRate, { speed })
