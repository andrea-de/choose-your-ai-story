/**
 * A narration being recorded right now. Every listener who asks for the page
 * while it is recording gets the same audio from the beginning, then follows
 * along live; nobody pays for a second recording.
 */
export class LiveRecording {
  private readonly chunks: Uint8Array[] = []
  private done = false
  private error: unknown = null
  private waiting = new Set<() => void>()
  /** Resolves with all the audio once recording ends. */
  readonly finished: Promise<Uint8Array>
  private settle!: { resolve: (pcm: Uint8Array) => void; reject: (error: unknown) => void }

  constructor() {
    this.finished = new Promise((resolve, reject) => {
      this.settle = { resolve, reject }
    })
    // A recording nobody awaits must not crash the process when it fails.
    this.finished.catch(() => {})
  }

  push(chunk: Uint8Array) {
    this.chunks.push(chunk)
    this.wake()
  }

  finish() {
    this.done = true
    this.settle.resolve(concat(this.chunks))
    this.wake()
  }

  fail(error: unknown) {
    this.error = error
    this.settle.reject(error)
    this.wake()
  }

  /** The recording so far, then the rest as it is spoken. */
  listen(): ReadableStream<Uint8Array> {
    let next = 0
    return new ReadableStream({
      pull: async (controller) => {
        for (;;) {
          if (next < this.chunks.length) return controller.enqueue(this.chunks[next++])
          if (this.error) return controller.error(this.error)
          if (this.done) return controller.close()
          await new Promise<void>((resolve) => this.waiting.add(resolve))
        }
      },
    })
  }

  private wake() {
    const waiting = this.waiting
    this.waiting = new Set()
    waiting.forEach((resolve) => resolve())
  }
}

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
