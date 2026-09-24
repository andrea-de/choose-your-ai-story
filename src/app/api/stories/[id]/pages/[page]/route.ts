import { after, NextResponse } from 'next/server'
import { errorResponse, parsePageNumber } from '@/lib/http'
import { getService, prefetchEnabled } from '@/lib/server'

/** Returns a page, writing it first if nobody has turned to it yet. */
export async function GET(request: Request, ctx: RouteContext<'/api/stories/[id]/pages/[page]'>) {
  const { id, page } = await ctx.params
  const number = parsePageNumber(page)
  if (number === null) return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
  const countVisit = new URL(request.url).searchParams.get('visit') !== '0'
  try {
    const service = getService()
    const node = await service.readPage(id, number, { countVisit })
    if (prefetchEnabled()) after(() => service.prefetchChoices(id, number))
    return NextResponse.json({ page: await service.viewPage(id, node) })
  } catch (error) {
    return errorResponse(error)
  }
}
