import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: process.env.CI ? 120_000 : 45_000,
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8977',
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'python3 serve.py',
      port: 8977,
      env: { SAVORIA_BROWSER_TESTS: '1' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'python3 serve.py',
      port: 8978,
      env: { PORT: '8978' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node server/index.js',
      env: { HOST: '127.0.0.1', PORT: '2567', SAVORIA_BROWSER_TESTS: '1' },
      port: 2567,
      reuseExistingServer: !process.env.CI,
    },
  ],
  reporter: process.env.CI ? 'github' : 'list',
});
