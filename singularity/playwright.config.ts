import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive the production build in Chromium. WebGL runs on SwiftShader when
 * no GPU is available (CI, containers), so the specs use the low render quality preset.
 */
const SWIFTSHADER = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const IPHONE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 440, height: 800 },
  screen: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: SWIFTSHADER },
      },
    },
    {
      // iPhone 17 Pro Max class screen (440 × 956 pt, 3× DPR) with Safari's toolbars, touch only
      name: 'iphone',
      testMatch: /mobile\.spec\.ts/,
      use: { ...IPHONE, browserName: 'chromium', launchOptions: { args: SWIFTSHADER } },
    },
    // Real WebKit (Safari's engine) on demand: `npx playwright install webkit && E2E_WEBKIT=1 npm run e2e`
    ...(process.env.E2E_WEBKIT ? [{ name: 'iphone-webkit', testMatch: /mobile\.spec\.ts/, use: { ...IPHONE, browserName: 'webkit' as const } }] : []),
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
