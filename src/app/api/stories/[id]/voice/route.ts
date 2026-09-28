import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/http'
import { getService } from '@/lib/server'

const body = z.union([
  z.object({ action: z.enum(['suggest', 'confirm']) }),
  z.object({ choose: z.enum(['standard', 'suggested']) }),
])

/** The tale's voice: who reads it, and whether that can still change. */
export async function GET(_request: Request, ctx: RouteContext<'/api/stories/[id]/voice'>) {
  const { id } = await ctx.params
  try {
    return NextResponse.json({ voice: await getService().voiceState(id) })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * { action: 'suggest' } for a new narrator idea, { choose: 'standard' | 'suggested' },
 * or { action: 'confirm' } when the reader begins the tale with the voice as it is.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/stories/[id]/voice'>) {
  const { id } = await ctx.params
  try {
    const input = body.parse(await request.json())
    const service = getService()
    const voice =
      'choose' in input
        ? await service.chooseVoice(id, input.choose)
        : input.action === 'confirm'
          ? await service.confirmVoice(id)
          : await service.suggestVoice(id)
    return NextResponse.json({ voice })
  } catch (error) {
    return errorResponse(error)
  }
}
