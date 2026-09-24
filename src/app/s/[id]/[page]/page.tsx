import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Book } from '@/components/Book'
import { parsePageNumber } from '@/lib/http'
import { getService } from '@/lib/server'
import { PageNotFoundError, StoryNotFoundError } from '@/lib/story/service'
import type { PageView } from '@/lib/story/types'

export const dynamic = 'force-dynamic'

async function load(id: string, pageParam: string) {
  const number = parsePageNumber(pageParam)
  if (number === null) notFound()
  const service = getService()
  try {
    const story = await service.getStory(id)
    const node = await service.peekPage(id, number)
    const page: PageView | null = node.status === 'ready' ? await service.viewPage(id, node) : null
    return { story, number, page }
  } catch (error) {
    if (error instanceof StoryNotFoundError || error instanceof PageNotFoundError) notFound()
    throw error
  }
}

export async function generateMetadata(props: PageProps<'/s/[id]/[page]'>): Promise<Metadata> {
  const { id, page } = await props.params
  const { story, number } = await load(id, page)
  return { title: `${story.bible.title}, page ${number}`, description: story.bible.premise }
}

export default async function ReaderPage(props: PageProps<'/s/[id]/[page]'>) {
  const { id, page } = await props.params
  const { story, number, page: view } = await load(id, page)
  return <Book key={id} storyId={id} storyTitle={story.bible.title} initialNumber={number} initialPage={view} />
}
