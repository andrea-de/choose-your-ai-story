import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="book">
      <article className="leaf parchment">
        <div className="leaf-inner">
          <p className="folio">?</p>
          <div className="quill-wait">
            <p>This page was torn from the book, or never written at all.</p>
            <Link href="/" className="choice" style={{ textAlign: 'center' }}>
              <span className="choice-turn" style={{ justifyContent: 'center' }}>
                return to the library
              </span>
            </Link>
          </div>
        </div>
      </article>
    </main>
  )
}
