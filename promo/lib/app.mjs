// Runs the real app for the harness: a production build served on a private
// port, over the promo tales rather than anyone's .data/.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const PROMO = path.join(ROOT, 'promo')
export const OUT = path.join(PROMO, 'out')

/** gemini when a key is set (real tales, real voices), else the mock storyteller. */
export const PROVIDER = process.env.AI_PROVIDER ?? (process.env.GEMINI_API_KEY ? 'gemini' : 'mock')
/** Each storyteller keeps its own tales: the mock's are a dry run and are not committed. */
export const DATA = path.join(PROMO, 'data', PROVIDER)

export function log(...args) {
  console.log('[promo]', ...args)
}

function newestMtime(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs)
  }
  return newest
}

/** `next build`, unless the last build is newer than every source file. */
export function buildApp({ force = false } = {}) {
  const id = path.join(ROOT, '.next', 'BUILD_ID')
  const sources = Math.max(newestMtime(path.join(ROOT, 'src')), newestMtime(path.join(ROOT, 'public')), statSync(path.join(ROOT, 'next.config.ts')).mtimeMs)
  if (!force && existsSync(id) && statSync(id).mtimeMs > sources) return log('app build is current')
  log('building the app…')
  const r = spawnSync('npx', ['next', 'build'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
  if (r.status !== 0) throw new Error('next build failed')
}

/**
 * Starts `next start` on `port`. With `scratch`, the server works on a throwaway
 * copy of the promo tales, so a capture that begins a new tale leaves them as they were.
 */
export async function startApp({ port = 3217 + 100, scratch = false, mockDelayMs = 900 } = {}) {
  let dataDir = DATA
  if (scratch) {
    dataDir = mkdtempSync(path.join(tmpdir(), 'tales-promo-'))
    if (existsSync(DATA)) cpSync(DATA, dataDir, { recursive: true })
  }
  mkdirSync(dataDir, { recursive: true })
  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    AI_PROVIDER: PROVIDER,
    STORY_DATA_DIR: dataDir,
    STORY_STORE: 'file',
    // Readers will not see costs at launch, so the promo media never show them.
    SHOW_COSTS: 'false',
    MOCK_AI_DELAY_MS: String(mockDelayMs),
  }
  const child = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`next start exited:\n${output}`)
    try {
      const res = await fetch(url)
      if (res.ok) break
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500))
    if (i === 119) throw new Error(`next start never answered:\n${output}`)
  }
  return {
    url,
    dataDir,
    output: () => output,
    async stop() {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        // Already gone.
      }
      await new Promise((r) => setTimeout(r, 300))
      if (scratch) rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export async function api(base, route, init) {
  const res = await fetch(base + route, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${route} → ${res.status} ${await res.text()}`)
  return res
}
