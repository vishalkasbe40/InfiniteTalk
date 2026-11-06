import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against a REAL local Supabase stack. Run in CI (job `supabase-stack`) after
// `supabase start` and `pnpm build`. Locally they need a running stack too.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // tests share one auth server and mailbox
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm start --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
