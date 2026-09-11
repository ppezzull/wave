import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Node-environment unit tests for the UI's pure/server-side logic (World
// publish signal, format helpers, subgraph client retry). No jsdom, no
// component tests — the risk lives in the data contracts, not the markup.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // The server-only guard throws outside the react-server condition; tests
      // are neither client nor server components — stub it (see test/server-only-stub.ts).
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
      'client-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
