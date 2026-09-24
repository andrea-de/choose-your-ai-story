import { TitleDesk } from '@/components/TitleDesk'
import { getService } from '@/lib/server'

export const dynamic = 'force-dynamic'

export default async function TitlePage() {
  const service = getService()
  const stories = await service.listStories(12)
  return <TitleDesk stories={stories} usingMock={service.tellerName === 'mock'} />
}
