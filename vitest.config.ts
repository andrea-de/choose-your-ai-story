import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/unit/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
})
