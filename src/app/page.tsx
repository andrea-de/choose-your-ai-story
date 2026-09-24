import Link from 'next/link'
import { NewTale } from '@/components/NewTale'
import { getService } from '@/lib/server'
import { historicFantasy } from '@/lib/themes'

export const dynamic = 'force-dynamic'

function Ornament() {
  return (
    <svg className="title-ornament" viewBox="0 0 160 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
      <path d="M4 12h52M104 12h52" />
      <path d="M56 12c6-8 14-8 18 0-4 8-12 8-18 0zM104 12c-6-8-14-8-18 0 4 8 12 8 18 0z" />
      <circle cx="80" cy="12" r="3.4" fill="currentColor" />
      <path d="M20 12c4-4 8-4 10 0M140 12c-4-4-8-4-10 0" />
    </svg>
  )
}

export default async function TitlePage() {
  const service = getService()
  const stories = await service.listStories(12)

  return (
    <main className="book title-page">
      <article className="leaf parchment">
        <div className="leaf-inner">
          <Ornament />
          <h1 className="book-title">Tales Unwritten</h1>
          <p className="book-subtitle">
            A gamebook that writes itself as you read. Every page you turn is kept, for the next reader to find.
          </p>

          <h2 className="section-heading">Begin a new tale</h2>
          <NewTale heroes={historicFantasy.heroes} settings={historicFantasy.settings} tones={historicFantasy.tones} />

          {stories.length > 0 && (
            <>
              <div className="fleuron" aria-hidden>
                ❦
              </div>
              <h2 className="section-heading">Tales already begun</h2>
              <ul className="contents">
                {stories.map((s) => (
                  <li key={s.id}>
                    <Link href={`/s/${s.id}/1`}>
                      <span className="contents-line">
                        <span>{s.title}</span>
                        <span className="leader" />
                        <span className="count">
                          {s.pagesWritten} {s.pagesWritten === 1 ? 'page' : 'pages'}
                        </span>
                      </span>
                      <span className="contents-premise">{s.premise}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="colophon">
            {service.tellerName === 'mock' ? 'Set in practice ink · no storyteller key configured' : 'Written as you read'}
          </p>
        </div>
      </article>
    </main>
  )
}
