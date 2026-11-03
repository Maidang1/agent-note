import { defineConfig } from '@playwright/test'

const port = 4398

/**
 * 浏览器端到端测试：对构建好的教程站点运行。站点由 runtime/serve.ts 提供，
 * 课程代码通过本机运行时在本机 Node 上执行。
 */
export default defineConfig({
  testDir: 'apps/tutorial/e2e',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    actionTimeout: 15_000,
    channel: 'chromium',
  },
  webServer: {
    command: `node apps/tutorial/runtime/serve.ts --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
