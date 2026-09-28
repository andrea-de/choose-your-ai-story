import { defineConfig, devices } from '@playwright/test'

// E2E_PORT: when 3100 is taken by something else on this machine.
const PORT = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AI_PROVIDER: 'mock',
      MOCK_AI_DELAY_MS: '150',
      STORY_STORE: 'memory',
    },
  },
})
