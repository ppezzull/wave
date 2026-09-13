import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Frontend logic audit — tests live in test/ (NOT colocated in lib/), run
// against the app's own modules via the @ alias.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // The server-only guard throws outside the react-server condition;
      // tests are neither client nor server components — stub it.
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
      'client-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
})
