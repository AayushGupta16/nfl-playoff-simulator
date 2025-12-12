import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    // Work around worker shutdown recursion on newer Node runtimes.
    // These tests are small; run in a single thread.
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    maxConcurrency: 1,
  },
});


