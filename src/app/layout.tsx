import type { Metadata, Viewport } from 'next'
import '@fontsource/im-fell-english/400.css'
import '@fontsource/im-fell-english/400-italic.css'
import '@fontsource/im-fell-english-sc/400.css'
import '@fontsource/unifrakturmaguntia/400.css'
import '@fontsource/cinzel-decorative/700.css'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Tales Unwritten', template: '%s · Tales Unwritten' },
  description: 'A gamebook that writes itself as you read. Every page you turn is kept for the next reader to find.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1f150d',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Roughens clean lines so sketches look drawn with a dip pen. */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
          <filter id="ink-wobble">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="3.5" />
          </filter>
        </svg>
        {children}
      </body>
    </html>
  )
}
