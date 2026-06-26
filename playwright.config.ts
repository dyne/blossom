import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run dev -- --port 5173',
    port: 5173,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 667 } } },
  ],
});
