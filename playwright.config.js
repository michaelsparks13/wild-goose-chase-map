import { defineConfig } from '@playwright/test';

// Port 3000 is a popular default and is often already taken by an
// unrelated dev server. Combined with `reuseExistingServer` that makes the
// whole suite run against the wrong origin and fail on #map timeouts, with
// nothing in the output pointing at the cause. Override with
// `FSS_TEST_PORT=4321 npx playwright test` when 3000 is occupied.
const PORT = Number(process.env.FSS_TEST_PORT) || 3000;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.js',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `node build.js && npx serve -l ${PORT} --no-clipboard dist`,
    port: PORT,
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
