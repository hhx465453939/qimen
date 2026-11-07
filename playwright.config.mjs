import { defineConfig, devices } from '@playwright/test';

// 本机是 Ubuntu 20.04，新版 Playwright 不再提供对应 chromium 构建；
// 如存在可用的本地 chromium，可用 QIMEN_CHROMIUM_PATH 指过去（CI 上会自动安装官方构建）。
const executablePath = process.env.QIMEN_CHROMIUM_PATH || undefined;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8099',
    trace: 'retain-on-failure',
    launchOptions
  },
  webServer: {
    command: 'python3 -m http.server 8099',
    url: 'http://127.0.0.1:8099/index.html',
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    {
      name: 'mobile-390',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
    }
  ]
});
