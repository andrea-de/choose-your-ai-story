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
