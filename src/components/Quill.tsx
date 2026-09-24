import type { ThemeId } from '@/lib/story/types'

function WaitIcon({ theme }: { theme: ThemeId }) {
  const common = {
    viewBox: '0 0 64 64',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    'aria-hidden': true,
  }
  switch (theme) {
    case 'future':
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="26" opacity="0.5" />
          <circle cx="32" cy="32" r="16" opacity="0.35" />
          <path d="M32 6v52M6 32h52" opacity="0.2" />
          <g className="radar-sweep">
            <path d="M32 32 32 6" strokeWidth="2" />
            <path d="M32 32 L32 6 A26 26 0 0 1 50 13 Z" fill="currentColor" opacity="0.18" stroke="none" />
          </g>
          <circle cx="44" cy="22" r="2" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'noir':
      return (
        <svg {...common}>
          <path d="M10 44h44v8H10zM16 44l4-14h24l4 14" />
          <path d="M18 30V16h28v14" />
          <rect className="type-cursor" x="28" y="20" width="8" height="3" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'pirate':
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="26" />
          <circle cx="32" cy="32" r="22" opacity="0.5" />
          <path d="M32 4v6M32 54v6M4 32h6M54 32h6" />
          <g className="compass-needle">
            <path d="M32 12l5 20h-10z" fill="currentColor" stroke="none" />
            <path d="M32 52l5-20h-10z" />
          </g>
          <circle cx="32" cy="32" r="2.5" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'ancient':
      return (
        <svg {...common}>
          <path className="oracle-smoke" d="M28 30c-4-6 4-10 0-16s4-10 0-14" />
          <path className="oracle-smoke" d="M34 30c4-6-4-10 0-16s-4-10 0-14" />
          <path className="oracle-smoke" d="M31 30c-3-5 3-9 0-14" />
          <path d="M18 32h28c0 6-6 10-14 10s-14-4-14-10z" />
          <path d="M22 40l-6 18M42 40l6 18M32 42v16" />
        </svg>
      )
    case 'dream':
      return (
        <svg {...common}>
          <path
            className="dream-spiral"
            d="M32 32c0-2 3-3 4-1s-1 6-4 6-7-3-6-8 7-9 12-7 10 8 8 14-10 12-17 10-13-11-11-18 11-14 19-13 16 8 16 17"
          />
          <path d="M50 10a8 8 0 1 0 6 12 6 6 0 1 1-6-12z" fill="currentColor" stroke="none" opacity="0.8" />
        </svg>
      )
    default:
      return (
        <>
          <svg {...common}>
            <path d="M14 56c8-14 22-34 42-48-4 12-12 24-22 32-4 3-9 5-14 6" />
            <path d="M14 56l18-22M24 44l6-2M30 36l6-1M36 29l5-1" />
            <path d="M12 58l3-4" />
          </svg>
          <svg className="ink-line" viewBox="0 0 120 6" aria-hidden>
            <path d="M2 3c20-3 30 3 50 0s30 3 66 0" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </>
      )
  }
}

/** Shown while a page is being written, in the theme's own idiom. */
export function QuillWait({ message, theme = 'historic-fantasy' }: { message: string; theme?: ThemeId }) {
  return (
    <div className="quill-wait" role="status" aria-live="polite">
      <WaitIcon theme={theme} />
      <p>{message}</p>
    </div>
  )
}
