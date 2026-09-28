import { parseSpeed, processVoice } from '@/lib/ai/tempo'
import { errorResponse } from '@/lib/http'
import { getService } from '@/lib/server'

/** The tale's summary read aloud by the standard or the suggested narrator, to try them before choosing. */
export async function GET(request: Request, ctx: RouteContext<'/api/stories/[id]/voice/preview'>) {
  const { id } = await ctx.params
  const params = new URL(request.url).searchParams
  const which = params.get('which') === 'standard' ? 'standard' : 'suggested'
  try {
    const preview = await getService().previewVoice(id, which)
    const speed = parseSpeed(params.get('speed'))
    const headers: Record<string, string> = {
      'Content-Type': `audio/L16;rate=${preview.sampleRate};channels=1`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    }
    if (preview.durationMs !== undefined) headers['X-Duration-Ms'] = String(Math.round(preview.durationMs / speed))
    return new Response(processVoice(preview.audio, preview.sampleRate, { speed, treatment: preview.treatment }), { headers })
  } catch (error) {
    return errorResponse(error)
  }
}
