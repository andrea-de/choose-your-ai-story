import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http'
import { getService, showCosts } from '@/lib/server'

/** The story's tree of pages, written and unwritten, for the map on its cover. */
export async function GET(_request: Request, ctx: RouteContext<'/api/stories/[id]/map'>) {
  const { id } = await ctx.params
  try {
    const service = getService()
    const pages = await service.storyMap(id)
    return NextResponse.json({
      pages,
      // For the cover's voice choice: who reads the tale, and whether reading aloud works here at all.
      voice: await service.voiceState(id),
      canNarrate: service.canNarrate,
      ...(showCosts() ? { cost: await service.storyCost(id) } : {}),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
