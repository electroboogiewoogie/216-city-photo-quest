import { defineConfig, devices } from '@playwright/test';

// Сквозные тесты идут по готовой сборке dist/, опубликованной под вложенным путём,
// как на GitHub Pages. Сначала выполните npm run build (или используйте dist/ из архива).
// E2E_BASE_URL=http://host:port/path/ — проверить уже запущенный сервер, без встроенного.
const external = process.env.E2E_BASE_URL;
const NESTED = 'http://127.0.0.1:4316/city-photo-quest/';
const ROOT = 'http://127.0.0.1:4416/';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  },
  projects: [
    {
      name: 'nested-path',
      testIgnore: /root-path\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: external ?? NESTED },
    },
    {
      name: 'root-path',
      testMatch: /root-path\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: external ?? ROOT },
    },
  ],
  webServer: external
    ? undefined
    : [
        {
          command: 'node scripts/serve-static.mjs --dir dist --port 4316 --base /city-photo-quest/',
          url: NESTED,
          reuseExistingServer: false,
          timeout: 20_000,
        },
        {
          command: 'node scripts/serve-static.mjs --dir dist --port 4416 --base /',
          url: ROOT,
          reuseExistingServer: false,
          timeout: 20_000,
        },
      ],
});
