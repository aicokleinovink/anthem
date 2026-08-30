import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Away from 3000, so a dev server left running does not get tested by accident. */
const PORT = 3100;
const CONTROL_PORT = 3101;

export default defineConfig({
  testDir: './tests',
  // One app process with one set of fakes behind it, so the suite shares device state.
  // Running it in parallel would mean tests changing the volume under each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },

  // Chromium only: one engine is enough for a self-hosted remote, and it keeps CI quick.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // The same shape production runs in: one process serving the built UI and the API.
    command: 'npm --prefix ../frontend run build && npm --prefix ../api run serve-fake',
    cwd: here,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      FAKE_CONTROL_PORT: String(CONTROL_PORT),
      // `npm --prefix` does not change the working directory, and the API resolves this
      // relative to it — so point at the build explicitly.
      FRONTEND_DIR: fileURLToPath(new URL('../frontend/dist', import.meta.url)),
    },
  },
});
