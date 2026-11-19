import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base './' keeps the build working from any path (GitHub Pages serves it
// under /signalforge-builder/, a custom domain serves it from the root).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 6061 },
  test: { include: ['src/**/*.test.ts'] },
})
