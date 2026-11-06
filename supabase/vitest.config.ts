import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Tests share one database; each runs in its own rolled-back transaction.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
