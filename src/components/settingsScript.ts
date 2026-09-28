/**
 * Kept apart from settings.ts (which uses React) so the server-rendered layout can
 * include the script without pulling client code into the server.
 */

export const SETTINGS_KEY = 'tales:settings'

/** The root font size for each text size; everything is sized in rem, so the whole book scales. */
export const TEXT_SCALE = { small: '90%', medium: '100%', large: '115%' } as const

/**
 * Applies text size and motion before the first paint, so a reader who chose
 * large text never sees the page jump.
 */
export const APPLY_SETTINGS_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||'{}');var z=${JSON.stringify(TEXT_SCALE)};document.documentElement.style.fontSize=z[s.textSize]||'100%';document.documentElement.dataset.motion=s.motion||'full'}catch(e){}`
