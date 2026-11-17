import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests run against the app pointed at the project in apps/web/.env.local.
 * They create dedicated users (`e2e-*@example.test`) and delete them afterwards when
 * E2E_SUPABASE_SERVICE_ROLE_KEY is set (see e2e/helpers.ts). Use a DEV or TEST project only.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  // Snapshots are shared across OSes; thresholds in the specs absorb font-rendering differences.
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  projects: [
    { name: 'chromium', testDir: './e2e', use: { ...devices['Desktop Chrome'] } },
    // Visual regression of the design gallery and public pages: needs no database.
    {
      name: 'visual',
      testDir: './visual',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    // A production build is closer to what ships and doesn't collide with a running `next dev`.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: true,
    // Build-time flag that exposes /dev/design in the production build used by the visual tests.
    env: { NEXT_PUBLIC_DESIGN_GALLERY: '1' },
    timeout: 300_000,
  },
});
