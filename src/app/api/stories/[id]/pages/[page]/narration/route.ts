import { NextResponse } from 'next/server'
import { errorResponse, parsePageNumber } from '@/lib/http'
import { parseSpeed, processVoice } from '@/lib/ai/tempo'
import { getService } from '@/lib/server'

/**
 * The page read aloud, as raw 16-bit mono PCM, streamed as it is spoken the
 * first time anyone listens. The browser plays it with Web Audio as it arrives.
 */
export async function GET(request: Request, ctx: RouteContext<'/api/stories/[id]/pages/[page]/narration'>) {
  const { id, page } = await ctx.params
  const number = parsePageNumber(page)
  if (number === null) return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
  try {
    const recording = await getService().listen(id, number)
    // ?speed=1.2 and the like: faster or slower, same pitch. Stored once, at normal speed.
    const speed = parseSpeed(new URL(request.url).searchParams.get('speed'))
    const { sampleRate } = recording
    const audio = processVoice(recording.audio, sampleRate, { speed, treatment: recording.treatment })
    const durationMs = recording.durationMs === undefined ? undefined : recording.durationMs / speed
    const headers: Record<string, string> = {
      'Content-Type': `audio/L16;rate=${sampleRate};channels=1`,
      'X-Content-Type-Options': 'nosniff',
      // A finished recording never changes; one still being spoken is not cached half-done.
      'Cache-Control': durationMs === undefined ? 'no-store' : 'public, max-age=31536000, immutable',
    }
    if (durationMs !== undefined) headers['X-Duration-Ms'] = String(Math.round(durationMs))
    return new Response(audio, { headers })
  } catch (error) {
    return errorResponse(error)
  }
}
