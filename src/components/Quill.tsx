export function QuillWait({ message }: { message: string }) {
  return (
    <div className="quill-wait" role="status" aria-live="polite">
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M14 56c8-14 22-34 42-48-4 12-12 24-22 32-4 3-9 5-14 6" />
        <path d="M14 56l18-22M24 44l6-2M30 36l6-1M36 29l5-1" />
        <path d="M12 58l3-4" />
      </svg>
      <svg className="ink-line" viewBox="0 0 120 6" aria-hidden>
        <path d="M2 3c20-3 30 3 50 0s30 3 66 0" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
      <p>{message}</p>
    </div>
  )
}
