import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Book } from '@/components/Book'
import { getService } from '@/lib/server'
import { StoryNotFoundError } from '@/lib/story/service'

export const dynamic = 'force-dynamic'

async function load(id: string) {
  try {
    return await getService().getStory(id)
  } catch (error) {
    if (error instanceof StoryNotFoundError) notFound()
    throw error
  }
}

export async function generateMetadata(props: PageProps<'/s/[id]'>): Promise<Metadata> {
  const story = await load((await props.params).id)
  return { title: story.bible.title, description: story.bible.premise }
}

/** A story's cover: its title, premise and map, before page 1. */
export default async function CoverPage(props: PageProps<'/s/[id]'>) {
  const { id } = await props.params
  const story = await load(id)
  return (
    <Book
      key={id}
      storyId={id}
      storyTitle={story.bible.title}
      premise={story.bible.premise}
      theme={story.config.theme}
      initialNumber={0}
      initialPage={null}
    />
  )
}
