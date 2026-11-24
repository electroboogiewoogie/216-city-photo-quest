import type { Photo } from './quest-editor';

// Фотография с телефона весит 3–8 МБ: перед сохранением уменьшаем до 1280 px по длинной стороне и
// перекодируем в JPEG. Так квест из 10 заданий остаётся файлом в 1–3 МБ, который удобно переслать.

export const MAX_SIDE = 1280;
export const JPEG_QUALITY = 0.82;

export function fitSize(w: number, h: number, max = MAX_SIDE): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const k = max / Math.max(w, h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

export async function photoFromFile(file: File): Promise<Photo> {
  if (!/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(file.type)) throw new Error('Нужна картинка: JPEG, PNG, WebP, GIF или SVG');
  if (file.size > 25 * 1024 * 1024) throw new Error('Файл больше 25 МБ');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('Не удалось открыть картинку');
    });
    const { width, height } = fitSize(img.naturalWidth || 800, img.naturalHeight || 600);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Браузер не дал нарисовать картинку');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { name: file.name, dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height, alt: '' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Размер data URL в байтах (примерно, по длине base64). */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const body = dataUrl.slice(i + 1);
  return dataUrl.includes(';base64,') ? Math.floor((body.length * 3) / 4) : decodeURIComponent(body).length;
}
