import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Network checks against lrclib.net; kept out of the default `npm test` run.
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: {
    include: ['tests-live/**/*.live.test.ts'],
    environment: 'node',
    fileParallelism: false
  }
})
