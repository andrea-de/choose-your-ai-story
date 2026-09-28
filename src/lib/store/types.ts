import type { Usage } from '../ai/pricing'
import type { Illustration, Narration } from '../ai/types'
import type { PageNode, Story } from '../story/types'

/**
 * Persistence for stories. Page numbers are unique per story; claimPage and
 * completePage must be atomic so two readers never write the same page.
 */
export interface StoryStore {
  createStory(story: Story, firstPage: PageNode): Promise<void>
  getStory(id: string): Promise<Story | null>
  listStories(limit: number): Promise<Story[]>
  getPage(storyId: string, number: number): Promise<PageNode | null>
  getPages(storyId: string): Promise<Map<number, PageNode>>
  /**
   * Marks a page as being generated. Succeeds only if the page is pending,
   * failed, or was claimed before `staleBefore` (an abandoned attempt).
   */
  claimPage(storyId: string, number: number, now: number, staleBefore: number): Promise<boolean>
  /** Saves a written page and creates its (pending) child pages. */
  completePage(storyId: string, page: PageNode, children: PageNode[]): Promise<void>
  failPage(storyId: string, number: number, error: string): Promise<void>
  recordVisit(storyId: string, number: number): Promise<void>
  /** Changes a story's own record (not its pages). */
  updateStory(storyId: string, patch: Partial<Story>): Promise<Story | null>
  /** Adds a model call's usage to the story's running cost. */
  recordUsage(storyId: string, usage: Usage, at?: number): Promise<void>
  getIllustration(storyId: string, number: number): Promise<Illustration | null>
  saveIllustration(storyId: string, number: number, illustration: Illustration): Promise<void>
  getNarration(storyId: string, number: number): Promise<Narration | null>
  saveNarration(storyId: string, number: number, narration: Narration): Promise<void>
}
