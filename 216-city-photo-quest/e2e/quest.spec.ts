import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { exportQuest, freshApp, svgFile, tmp } from './helpers';

test('приёмка ТЗ: три задания, выгрузка, другой профиль без интернета, неверный ответ не открывает следующее, вариант принимается', async ({ page, browser }) => {
  await freshApp(page);
  await page.getByLabel('Название квеста').fill('Двор у реки');
  const tasks = [
    { q: 'Какой номер на доме с часами?', hint: 'Смотрите над дверью', a: '17\nсемнадцать', file: svgFile('dom.svg', '17') },
    { q: 'Какого цвета ворота?', hint: '', a: 'Зелёные\nзеленый', file: svgFile('vorota.svg', 'ворота', '#2e7d32') },
    { q: 'Как называется кафе на углу?', hint: 'Название из двух слов', a: 'Старый Ёж', file: svgFile('kafe.svg', 'Старый Ёж', '#6d4c41') },
  ];
  for (let i = 0; i < tasks.length; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Добавить задание' }).click();
    const card = page.getByTestId('task').nth(i);
    await card.getByLabel('Фотография детали').setInputFiles(tasks[i]!.file);
    await expect(card.locator('img')).toBeVisible();
    await card.getByLabel('Вопрос').fill(tasks[i]!.q);
    if (tasks[i]!.hint) await card.getByLabel('Подсказка (необязательно)').fill(tasks[i]!.hint);
    await card.getByLabel('Варианты ответа, по одному в строке').fill(tasks[i]!.a);
  }
  // Проверка вариантов прямо в редакторе.
  const third = page.getByTestId('task').nth(2);
  await third.getByLabel('Проверить, примется ли ответ').fill('  старый   ЕЖ ');
  await expect(third.getByTestId('probe')).toHaveText('Примется: совпал с «Старый Ёж»');
  await expect(page.getByText('Квест готов: 3 заданий')).toBeVisible();
  await expect(page.getByTestId('summary')).toContainText('Заданий: 3 · готов к выгрузке');
  await page.getByRole('button', { name: 'К выгрузке ↓' }).click();
  await expect(page.getByRole('heading', { name: 'Готовность и выгрузка' })).toBeFocused();
  await expect(page.getByTestId('save')).toHaveText('Черновик сохранён в этом браузере');

  const file = await exportQuest(page, tmp());
  expect(file.endsWith('kvest-dvor-u-reki.html')).toBe(true);
  const size = readFileSync(file).length;
  expect(size).toBeGreaterThan(10_000);

  // Другой профиль браузера, сеть выключена, открываем файл.
  const ctx = await browser.newContext();
  await ctx.setOffline(true);
  const p = await ctx.newPage();
  const requests: string[] = [];
  p.on('request', (r) => requests.push(r.url().slice(0, 30)));
  await p.goto(pathToFileURL(file).href);
  await expect(p.getByRole('heading', { name: 'Двор у реки', level: 1 })).toBeVisible();
  await expect(p.getByRole('heading', { name: 'Задание 1 из 3' })).toBeFocused();
  await expect(p.locator('img.photo')).toBeVisible();
  // Неверный ответ: остаёмся на первом задании.
  await p.getByLabel('Ваш ответ').fill('18');
  await p.getByRole('button', { name: 'Проверить' }).click();
  await expect(p.getByTestId('msg')).toHaveText('Неверно. Попыток на этом задании: 1. Попробуйте ещё.');
  await expect(p.getByRole('heading', { name: 'Задание 1 из 3' })).toBeVisible();
  // Допустимый вариант словами, с лишними пробелами.
  await p.getByLabel('Ваш ответ').fill('  СЕМНАДЦАТЬ ');
  await p.getByRole('button', { name: 'Проверить' }).click();
  await expect(p.getByRole('heading', { name: 'Задание 2 из 3' })).toBeVisible();
  await p.getByLabel('Ваш ответ').fill('зеленые');
  await p.getByRole('button', { name: 'Проверить' }).click();
  await expect(p.getByRole('heading', { name: 'Задание 3 из 3' })).toBeVisible();
  // Подсказка; прогресс переживает перезагрузку файла.
  await p.getByRole('button', { name: 'Показать подсказку' }).click();
  await expect(p.getByTestId('hint')).toHaveText('Подсказка: Название из двух слов');
  await p.reload();
  await expect(p.getByRole('heading', { name: 'Задание 3 из 3' })).toBeVisible();
  await expect(p.getByTestId('hint')).toBeVisible();
  await p.getByLabel('Ваш ответ').fill('«старый ёж»');
  await p.keyboard.press('Enter');
  await expect(p.getByTestId('done')).toContainText('Квест пройден!');
  await expect(p.getByTestId('done')).toContainText('Заданий: 3 · попыток: 4 · подсказок: 1');
  // Ни одного сетевого запроса: только сам файл и встроенные data:-картинки.
  expect(requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'))).toEqual([]);
  await ctx.close();
});

test('редактор: порядок, удаление, блокировка выгрузки без ответа, пакет .json туда и обратно, черновик после перезагрузки', async ({ page }) => {
  await freshApp(page);
  await page.getByRole('button', { name: 'Открыть демо-квест из трёх заданий' }).click();
  const q = (i: number) => page.getByTestId('task').nth(i).getByLabel('Вопрос');
  await expect(q(0)).toHaveValue('Какой год указан на табличке справа от арки?');
  await page.getByRole('button', { name: 'Задание 3: выше' }).click();
  await expect(q(1)).toHaveValue('Как называется улица на табличке?');
  await expect(page.getByRole('heading', { name: 'Задание 2', level: 3 })).toBeFocused();
  // Убрать все ответы второго задания — выгрузка недоступна и объяснена.
  await page.getByTestId('task').nth(1).getByLabel('Варианты ответа, по одному в строке').fill('  \n ');
  await expect(page.getByTestId('issues')).toContainText('Нужно исправить: Задание 2: нет ни одного варианта ответа');
  const exp = page.getByRole('button', { name: 'Скачать квест для игры (.html)' });
  await expect(exp).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Скачать квест можно, когда у каждого задания есть вопрос и хотя бы один вариант ответа.')).toBeVisible();
  await page.getByTestId('task').nth(1).getByLabel('Варианты ответа, по одному в строке').fill('Ёлочная');
  await expect(exp).not.toHaveAttribute('aria-disabled', 'true');
  // Удаление с подтверждением.
  await page.getByRole('button', { name: 'Удалить задание 3' }).click();
  await page.getByRole('button', { name: 'Да, удалить' }).click();
  await expect(page.getByTestId('task')).toHaveCount(2);
  // Пакет .json: скачать, начать новый, открыть.
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить пакет для редактирования (.json)' }).click();
  const d = await dl;
  const path = `${tmp()}/${d.suggestedFilename()}`;
  await d.saveAs(path);
  await page.getByRole('button', { name: 'Новый квест' }).click();
  await page.getByRole('button', { name: 'Заменить', exact: true }).click();
  await expect(page.getByTestId('task')).toHaveCount(1);
  await page.getByText('Открыть пакет…').locator('input').setInputFiles(path);
  await expect(page.getByTestId('notice')).toHaveText('Открыт квест «Детали Старого квартала»: 2 заданий');
  await expect(q(1)).toHaveValue('Как называется улица на табличке?');
  // Черновик в IndexedDB переживает перезагрузку.
  await expect(page.getByTestId('save')).toHaveText('Черновик сохранён в этом браузере');
  await page.reload();
  await expect(page.getByTestId('task')).toHaveCount(2);
  await expect(page.getByLabel('Название квеста')).toHaveValue('Детали Старого квартала');
});

test('игра в приложении: те же правила, подсказка, завершение и повтор', async ({ page }) => {
  await freshApp(page);
  await page.getByRole('button', { name: 'Открыть демо-квест из трёх заданий' }).click();
  await page.getByRole('link', { name: 'Пройти квест' }).click();
  await expect(page.getByRole('heading', { name: 'Задание 1 из 3' })).toBeFocused();
  await page.getByRole('button', { name: 'Проверить' }).click();
  await expect(page.getByTestId('msg')).toHaveText('Введите ответ');
  await expect(page.getByText('Попыток: 0')).toBeVisible();
  await page.getByLabel('Ваш ответ').fill('1908');
  await page.getByRole('button', { name: 'Проверить' }).click();
  await expect(page.getByTestId('msg')).toHaveText('Неверно. Попыток на этом задании: 1. Попробуйте ещё.');
  await page.getByLabel('Ваш ответ').fill('1907 ГОД');
  await page.getByRole('button', { name: 'Проверить' }).click();
  await expect(page.getByRole('heading', { name: 'Задание 2 из 3' })).toBeFocused();
  await page.getByRole('button', { name: 'Показать подсказку' }).click();
  await expect(page.getByTestId('hint')).toHaveText('Подсказка: Она кричит по утрам.');
  await page.getByLabel('Ваш ответ').fill('петушок');
  await page.keyboard.press('Enter');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Задание 3 из 3' })).toBeVisible();
  await page.getByLabel('Ваш ответ').fill('ул. елочная');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('done')).toContainText('Заданий: 3 · попыток: 4 · подсказок: 1');
  await page.getByRole('button', { name: 'Пройти заново' }).click();
  await expect(page.getByRole('heading', { name: 'Задание 1 из 3' })).toBeVisible();
});
