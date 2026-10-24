import {defineConfig, devices} from '@playwright/test';
import {existsSync} from 'node:fs';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5273',
    trace: 'retain-on-failure',
    launchOptions: {executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined},
  },
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome']}},
    {name: 'mobile', use: {...devices['iPhone 13'], defaultBrowserType: 'chromium'}},
  ],
  webServer: {
    command: 'npm run dev -- --port 5273 --strictPort',
    url: 'http://127.0.0.1:5273',
    reuseExistingServer: !process.env.CI,
  },
});
