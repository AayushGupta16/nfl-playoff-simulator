import { defineConfig } from 'vitest/config';

// Separate vitest config so we can run ad-hoc tuning scripts without changing
// the main test globs (and without accidentally running them in `npm test`).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/tune_calibration_lr.ts'],
    exclude: ['node_modules', 'dist'],
    // Calibration tuning is intentionally long-running (network + many sims).
    testTimeout: 60 * 60 * 1000, // 1 hour
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    maxConcurrency: 1,
  },
});


