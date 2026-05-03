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
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Force software WebGL so MapLibre can paint in headless CI / sandboxed
        // environments where the default SwiftShader threading sometimes fails
        // with "BindToCurrentSequence failed". These flags are no-ops on hosts
        // with real GPU acceleration.
        launchOptions: {
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
            '--disable-gpu-sandbox',
          ],
        },
      },
    },
  ],
});
