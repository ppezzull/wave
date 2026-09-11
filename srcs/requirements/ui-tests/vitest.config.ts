import { defineConfig } from 'vitest/config'
import path from 'node:path'

// The UI audit suite — SEPARATE from the ui package on purpose (the UI stays
// test-free; these tests import its logic from outside). The `@` alias points
// at ../ui so the modules under test resolve exactly as they do in the app.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../ui'),
      // The server-only guard throws outside the react-server condition; tests
      // are neither client nor server components — stub it.
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
      'client-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
