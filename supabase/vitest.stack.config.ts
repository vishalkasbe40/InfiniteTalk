import { defineConfig } from 'vitest/config';

// Smoke tests against a running local Supabase stack (CI job `supabase-stack`).
export default defineConfig({
  test: { include: ['tests-stack/**/*.test.ts'], fileParallelism: false, testTimeout: 30_000 },
});
