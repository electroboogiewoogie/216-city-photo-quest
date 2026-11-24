// Сравнение ответа игрока с вариантами автора. Одна и та же нормализация для ввода и для вариантов.
//
// ВАЖНО: normalizeAnswer встраивается в выгруженный HTML через Function.prototype.toString(),
// поэтому функция должна быть самодостаточной: без импортов и обращений к другим функциям модуля.

/** Регистр, ё→е, кавычки, неразрывные и двойные пробелы, пробелы и знаки по краям. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[«»„“”"'`]/g, '')
    .replace(/[\u00a0\u2007\u202f\t\r\n]/g, ' ')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.,!?;:\s]+|[.,!?;:\s]+$/g, '');
}

export interface CheckResult {
  ok: boolean;
  /** Вариант автора, с которым совпал ответ. */
  matched: string | null;
  /** Ответ после нормализации: показывается автору в проверке вариантов. */
  normalized: string;
}

export function checkAnswer(input: string, answers: readonly string[]): CheckResult {
  const n = normalizeAnswer(input);
  if (!n) return { ok: false, matched: null, normalized: n };
  const matched = answers.find((a) => normalizeAnswer(a) === n) ?? null;
  return { ok: matched !== null, matched, normalized: n };
}
