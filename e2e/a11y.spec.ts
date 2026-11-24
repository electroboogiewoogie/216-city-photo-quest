import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { exportQuest, openDemo, tmp } from './helpers';

test('игра только с клавиатуры: ответ Enter, подсказка, фокус на новом задании', async ({ page }) => {
  await openDemo(page);
  await page.goto('./#play');
  await expect(page.getByRole('heading', { name: 'Задание 1 из 3' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Ваш ответ')).toBeFocused();
  await page.keyboard.type('1907');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Задание 2 из 3' })).toBeFocused();
  await expect(page.getByRole('progressbar', { name: 'Пройдено заданий' })).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('img', { name: 'Крыши домов и флюгер на шпиле' })).toBeVisible();
});

for (const width of [360, 320]) {
  test(`узкий экран ${width} px: редактор, игра и выгруженный файл без горизонтальной прокрутки`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 740 });
    await openDemo(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.goto('./#play');
    await expect(page.getByTestId('play')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.goto('./#edit');
    const file = await exportQuest(page, tmp());
    const ctx = await browser.newContext({ viewport: { width, height: 740 } });
    const p = await ctx.newPage();
    await p.goto(pathToFileURL(file).href);
    await expect(p.locator('img.photo')).toBeVisible();
    expect(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
}

test('поля подписаны, кнопки не меньше 40 px', async ({ page }) => {
  await openDemo(page);
  for (const b of await page.locator('button, input[type=file]:not(.visually-hidden)').all()) {
    if (!(await b.isVisible())) continue;
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  }
  await expect(page.getByLabel('Название квеста')).toBeVisible();
  await expect(page.getByTestId('task').first().getByLabel('Что на фото (для экранного диктора)')).toHaveValue('Фасад с аркой и табличкой справа от неё');
});
