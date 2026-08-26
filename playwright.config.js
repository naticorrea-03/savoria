import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:8977',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'python3 serve.py',
    port: 8977,
    reuseExistingServer: !process.env.CI,
  },
  reporter: process.env.CI ? 'github' : 'list',
});
