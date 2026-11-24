import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

/** Каталог для скачанных файлов: путь без кириллицы (test-results содержит русские имена тестов). */
export const tmp = () => mkdtempSync(join(tmpdir(), 'cpq-'));

export async function freshApp(page: Page): Promise<void> {
  await page.goto('./#edit');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase('city-photo-quest');
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  });
  await page.reload();
  await expect(page.getByTestId('save')).not.toHaveText('Открываю черновик…');
}

export async function openDemo(page: Page): Promise<void> {
  await freshApp(page);
  await page.getByRole('button', { name: 'Открыть демо-квест из трёх заданий' }).click();
  await expect(page.getByTestId('task')).toHaveCount(3);
}

/** SVG-картинка как файл для поля загрузки фото. */
export function svgFile(name: string, text: string, color = '#1d4f91') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${color}"/><text x="400" y="320" font-size="90" text-anchor="middle" fill="#fff" font-family="Arial">${text}</text></svg>`;
  return { name, mimeType: 'image/svg+xml', buffer: Buffer.from(svg) };
}

export async function exportQuest(page: Page, dir: string): Promise<string> {
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать квест для игры (.html)' }).click();
  const d = await dl;
  const path = join(dir, d.suggestedFilename());
  await d.saveAs(path);
  return path;
}
