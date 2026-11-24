import { checkAnswer } from './answer-checker';
import type { Quest } from './quest-editor';

// Прогресс игрока по пакету: открытое задание, попытки и подсказки по каждому заданию.
// Ключ хранения — идентификатор пакета: у двух разных квестов прогресс не смешивается.

export interface Progress {
  questId: string;
  /** Индекс открытого задания; равен числу заданий, когда квест пройден. */
  current: number;
  attempts: number[];
  hints: boolean[];
  startedAt: number;
  finishedAt: number | null;
}

export const progressKey = (questId: string) => `cpq.progress.${questId}`;

export function startProgress(q: Quest, now = Date.now()): Progress {
  return { questId: q.id, current: 0, attempts: q.tasks.map(() => 0), hints: q.tasks.map(() => false), startedAt: now, finishedAt: null };
}

/** Прогресс из хранилища, приведённый к текущему составу квеста (автор мог добавить или убрать задания). */
export function restoreProgress(q: Quest, raw: unknown): Progress {
  const p = raw as Partial<Progress> | null;
  if (!p || p.questId !== q.id || typeof p.current !== 'number' || !Array.isArray(p.attempts)) return startProgress(q);
  const n = q.tasks.length;
  return {
    questId: q.id,
    current: Math.max(0, Math.min(Math.floor(p.current), n)),
    attempts: q.tasks.map((_, i) => Math.max(0, Number(p.attempts?.[i]) || 0)),
    hints: q.tasks.map((_, i) => Boolean(p.hints?.[i])),
    startedAt: Number(p.startedAt) || Date.now(),
    finishedAt: p.current >= n && n > 0 ? Number(p.finishedAt) || Date.now() : null,
  };
}

export type SubmitResult = { kind: 'empty' } | { kind: 'wrong'; attempts: number } | { kind: 'right'; finished: boolean } | { kind: 'done' };

/** Ответ на открытое задание. Неверный ответ не открывает следующее, пустой не считается попыткой. */
export function submit(q: Quest, p: Progress, input: string, now = Date.now()): { progress: Progress; result: SubmitResult } {
  if (p.current >= q.tasks.length) return { progress: p, result: { kind: 'done' } };
  const task = q.tasks[p.current]!;
  if (!input.trim()) return { progress: p, result: { kind: 'empty' } };
  const attempts = [...p.attempts];
  attempts[p.current] = (attempts[p.current] ?? 0) + 1;
  const r = checkAnswer(input, task.answers);
  if (!r.ok) return { progress: { ...p, attempts }, result: { kind: 'wrong', attempts: attempts[p.current]! } };
  const current = p.current + 1;
  const finished = current >= q.tasks.length;
  return { progress: { ...p, attempts, current, finishedAt: finished ? now : null }, result: { kind: 'right', finished } };
}

export function takeHint(p: Progress): Progress {
  if (p.current >= p.hints.length) return p;
  const hints = [...p.hints];
  hints[p.current] = true;
  return { ...p, hints };
}

export function summary(p: Progress): { attempts: number; hints: number; minutes: number } {
  return {
    attempts: p.attempts.reduce((a, b) => a + b, 0),
    hints: p.hints.filter(Boolean).length,
    minutes: p.finishedAt ? Math.max(1, Math.round((p.finishedAt - p.startedAt) / 60000)) : 0,
  };
}

export function loadProgress(storage: Storage | null, q: Quest): Progress {
  try {
    const raw = storage?.getItem(progressKey(q.id));
    return restoreProgress(q, raw ? JSON.parse(raw) : null);
  } catch {
    return startProgress(q);
  }
}

export function saveProgress(storage: Storage | null, p: Progress): boolean {
  try {
    storage?.setItem(progressKey(p.questId), JSON.stringify(p));
    return !!storage;
  } catch {
    return false;
  }
}
