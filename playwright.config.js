import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.js',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'node build.js && npx serve -l 3000 --no-clipboard dist',
    port: 3000,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
