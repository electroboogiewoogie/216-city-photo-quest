import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { exportQuest, freshApp, tmp } from './helpers';

// Замер раунда 4: квест из 40 заданий (предел редактора) с фото 1280×960 JPEG.
test('40 заданий с фото 1280×960: открытие пакета, ввод в редакторе, выгрузка, запуск файла', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await freshApp(page);
  // Фото рисуются в браузере (шум, чтобы JPEG не сжимался до пустяка) и собираются в пакет.
  const pkg = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 960;
    const g = c.getContext('2d')!;
    const tasks = [];
    for (let i = 0; i < 40; i++) {
      const img = g.createImageData(1280, 960);
      for (let k = 0; k < img.data.length; k += 4) {
        const v = (k * 2654435761 + i * 97) >>> 24;
        img.data[k] = v;
        img.data[k + 1] = (v + i * 5) & 255;
        img.data[k + 2] = 255 - v;
        img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      tasks.push({ id: `t${i}`, question: `Вопрос ${i + 1}?`, hint: '', answers: [`ответ ${i + 1}`], photo: { name: `p${i}.jpg`, dataUrl: c.toDataURL('image/jpeg', 0.82), width: 1280, height: 960, alt: '' } });
    }
    return JSON.stringify({ format: 'city-photo-quest', version: 1, id: 'perf-40', title: 'Сорок фото', intro: '', tasks, updatedAt: Date.now() });
  });
  const dir = tmp();
  writeFileSync(`${dir}/big.json`, pkg);
  let t0 = Date.now();
  await page.getByText('Открыть пакет…').locator('input').setInputFiles(`${dir}/big.json`);
  await expect(page.getByTestId('task')).toHaveCount(40);
  const openMs = Date.now() - t0;
  await expect(page.getByTestId('save')).toHaveText('Черновик сохранён в этом браузере', { timeout: 30_000 });
  // Отклик ввода: 20 символов в вопрос первого задания.
  const field = page.getByTestId('task').first().getByLabel('Вопрос');
  await field.focus();
  await page.keyboard.press('End');
  t0 = Date.now();
  await field.pressSequentially('абвгдеёжзийклмнопрст', { delay: 0 });
  await expect(field).toHaveValue('Вопрос 1?абвгдеёжзийклмнопрст');
  const typeMs = Date.now() - t0;
  t0 = Date.now();
  const file = await exportQuest(page, dir);
  const exportMs = Date.now() - t0;
  const bytes = readFileSync(file).length;
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  t0 = Date.now();
  await p.goto(pathToFileURL(file).href);
  await expect(p.getByRole('heading', { name: 'Задание 1 из 40' })).toBeVisible();
  const playOpenMs = Date.now() - t0;
  await ctx.close();
  console.log('PERF216', JSON.stringify({ tasks: 40, pkgMB: +(pkg.length / 1048576).toFixed(1), openMs, typeMs, exportMs, fileMB: +(bytes / 1048576).toFixed(1), playOpenMs }));
  expect(exportMs).toBeLessThan(10_000);
});
