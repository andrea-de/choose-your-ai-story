import { NextResponse } from 'next/server'
import { errorResponse, parsePageNumber } from '@/lib/http'
import { getService } from '@/lib/server'

export async function GET(_request: Request, ctx: RouteContext<'/api/stories/[id]/pages/[page]/illustration'>) {
  const { id, page } = await ctx.params
  const number = parsePageNumber(page)
  if (number === null) return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
  try {
    const image = await getService().getIllustration(id, number)
    return new NextResponse(Buffer.from(image.data), {
      headers: {
        'Content-Type': image.mimeType,
        // A page's sketch never changes once drawn.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
