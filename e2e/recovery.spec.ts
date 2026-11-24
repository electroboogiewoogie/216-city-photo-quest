import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { freshApp, openDemo, tmp } from './helpers';

test('повреждённый прогресс и прогресс от другого квеста не ломают игру', async ({ page }) => {
  await openDemo(page);
  await page.goto('./#play');
  await expect(page.getByRole('heading', { name: 'Задание 1 из 3' })).toBeVisible();
  const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('cpq.progress.')) ?? '');
  await page.evaluate((k) => localStorage.setItem(k || 'cpq.progress.x', '{не json'), key);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Задание 1 из 3' })).toBeVisible();
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ questId: 'чужой', current: 2, attempts: [9, 9, 9] })), key);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Задание 1 из 3' })).toBeVisible();
  await expect(page.getByText('Попыток: 0')).toBeVisible();
});

test('чужой и повреждённый файл пакета: понятная ошибка, черновик не тронут', async ({ page }) => {
  await openDemo(page);
  const dir = tmp();
  writeFileSync(`${dir}/bad.json`, '{"format":"other","version":1}');
  writeFileSync(`${dir}/broken.json`, '{"format": "city-photo-q');
  const input = page.getByText('Открыть пакет…').locator('input');
  await input.setInputFiles(`${dir}/bad.json`);
  await expect(page.getByTestId('error')).toHaveText('Пакет не открыт: Это не пакет городского фотоквеста');
  await input.setInputFiles(`${dir}/broken.json`);
  await expect(page.getByTestId('error')).toHaveText('Пакет не открыт: файл не JSON или повреждён');
  await expect(page.getByTestId('task')).toHaveCount(3);
});

test('не картинка вместо фото: ошибка у задания, остальное работает', async ({ page }) => {
  await freshApp(page);
  await page.getByTestId('task').first().getByLabel('Фотография детали').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('текст') });
  await expect(page.getByTestId('error')).toHaveText('Задание 1: Нужна картинка: JPEG, PNG, WebP, GIF или SVG');
  await page.getByTestId('task').first().getByLabel('Вопрос').fill('Вопрос?');
  await expect(page.getByTestId('task').first().getByLabel('Вопрос')).toHaveValue('Вопрос?');
});

test('перезагрузка сразу после ввода: набранный текст не теряется', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByTestId('save')).toHaveText('Черновик сохранён в этом браузере');
  const q = page.getByTestId('task').first().getByLabel('Вопрос');
  await q.fill('Новый вопрос, набран прямо перед закрытием');
  await page.reload(); // раньше, чем сработает отложенное сохранение
  await expect(page.getByTestId('task').first().getByLabel('Вопрос')).toHaveValue('Новый вопрос, набран прямо перед закрытием');
  await expect(page.getByTestId('save')).toHaveText('Черновик сохранён в этом браузере');
  await page.reload();
  await expect(page.getByTestId('task').first().getByLabel('Вопрос')).toHaveValue('Новый вопрос, набран прямо перед закрытием');
});
