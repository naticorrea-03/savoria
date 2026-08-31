import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: 'solo-offline.spec.js',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:8980',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'python3 serve.py',
    port: 8980,
    env: { PORT: '8980', SAVORIA_BROWSER_TESTS: '0' },
    reuseExistingServer: false,
  },
  reporter: process.env.CI ? 'github' : 'list',
});
