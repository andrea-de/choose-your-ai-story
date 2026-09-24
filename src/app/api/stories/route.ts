import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http'
import { getService } from '@/lib/server'
import { newStoryRequestSchema } from '@/lib/story/schema'

export async function GET() {
  try {
    return NextResponse.json({ stories: await getService().listStories() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = newStoryRequestSchema.parse(await request.json().catch(() => ({})))
    const story = await getService().createStory(body)
    return NextResponse.json({ id: story.id, title: story.bible.title, firstPage: story.firstPage }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
