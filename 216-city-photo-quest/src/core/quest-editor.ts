import { normalizeAnswer } from './answer-checker';

// Формат пакета квеста. Изображения — data URL (JPEG/PNG/SVG), чтобы пакет и выгрузка были самодостаточными.

export const PACKAGE_FORMAT = 'city-photo-quest';
export const PACKAGE_VERSION = 1;
export const MAX_TASKS = 40;
export const MAX_IMAGE_CHARS = 3_000_000; // ~2,2 МБ после base64: защита от гигантских файлов в пакете

export interface Photo {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  alt: string;
}

export interface Task {
  id: string;
  photo: Photo | null;
  question: string;
  hint: string;
  answers: string[];
}

export interface Quest {
  format: typeof PACKAGE_FORMAT;
  version: typeof PACKAGE_VERSION;
  id: string;
  title: string;
  intro: string;
  tasks: Task[];
  updatedAt: number;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newQuest(title = 'Новый квест'): Quest {
  return { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, id: newId(), title, intro: '', tasks: [newTask()], updatedAt: Date.now() };
}

export function newTask(): Task {
  return { id: newId(), photo: null, question: '', hint: '', answers: [] };
}

export function addTask(q: Quest): Quest {
  if (q.tasks.length >= MAX_TASKS) return q;
  return { ...q, tasks: [...q.tasks, newTask()] };
}

export function updateTask(q: Quest, id: string, patch: Partial<Omit<Task, 'id'>>): Quest {
  return { ...q, tasks: q.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function removeTask(q: Quest, id: string): Quest {
  return { ...q, tasks: q.tasks.filter((t) => t.id !== id) };
}

export function moveTask(q: Quest, id: string, delta: -1 | 1): Quest {
  const i = q.tasks.findIndex((t) => t.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= q.tasks.length) return q;
  const tasks = [...q.tasks];
  [tasks[i], tasks[j]] = [tasks[j]!, tasks[i]!];
  return { ...q, tasks };
}

/** Варианты ответа из текстового поля: по одному в строке, пустые и дубли (после нормализации) убираются. */
export function parseAnswers(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const a = line.trim();
    const n = normalizeAnswer(a);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(a);
  }
  return out;
}

export interface Issue {
  taskIndex: number | null;
  field: 'title' | 'tasks' | 'question' | 'answers' | 'photo';
  message: string;
  blocking: boolean;
}

/** Проблемы квеста. Блокирующие не дают выгрузить квест, остальные — предупреждения. */
export function validateQuest(q: Quest): Issue[] {
  const issues: Issue[] = [];
  if (!q.title.trim()) issues.push({ taskIndex: null, field: 'title', message: 'Укажите название квеста', blocking: true });
  if (!q.tasks.length) issues.push({ taskIndex: null, field: 'tasks', message: 'Добавьте хотя бы одно задание', blocking: true });
  q.tasks.forEach((t, i) => {
    if (!t.question.trim()) issues.push({ taskIndex: i, field: 'question', message: `Задание ${i + 1}: нет вопроса`, blocking: true });
    if (!t.answers.some((a) => normalizeAnswer(a))) issues.push({ taskIndex: i, field: 'answers', message: `Задание ${i + 1}: нет ни одного варианта ответа`, blocking: true });
    if (!t.photo) issues.push({ taskIndex: i, field: 'photo', message: `Задание ${i + 1}: нет фотографии`, blocking: false });
  });
  return issues;
}

/** Разбор пакета из файла: структура, типы, размеры. Неизвестные поля отбрасываются. */
export function parsePackage(raw: unknown): { ok: true; quest: Quest } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  if (!raw || typeof raw !== 'object') return bad('Файл не похож на пакет квеста');
  const r = raw as Record<string, unknown>;
  if (r.format !== PACKAGE_FORMAT) return bad('Это не пакет городского фотоквеста');
  if (r.version !== PACKAGE_VERSION) return bad(`Версия пакета ${String(r.version)} не поддерживается`);
  if (typeof r.id !== 'string' || !r.id || typeof r.title !== 'string' || !Array.isArray(r.tasks)) return bad('В пакете нет id, названия или списка заданий');
  if (r.tasks.length > MAX_TASKS) return bad(`Заданий больше ${MAX_TASKS}`);
  const tasks: Task[] = [];
  for (const [i, x] of r.tasks.entries()) {
    const t = x as Record<string, unknown>;
    if (!t || typeof t !== 'object' || typeof t.question !== 'string' || !Array.isArray(t.answers) || !t.answers.every((a) => typeof a === 'string'))
      return bad(`Задание ${i + 1} повреждено`);
    let photo: Photo | null = null;
    if (t.photo) {
      const p = t.photo as Record<string, unknown>;
      if (typeof p.dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp|svg\+xml)[;,]/.test(p.dataUrl)) return bad(`Задание ${i + 1}: фотография не в формате data:image`);
      if (p.dataUrl.length > MAX_IMAGE_CHARS) return bad(`Задание ${i + 1}: фотография слишком большая`);
      photo = {
        name: typeof p.name === 'string' ? p.name : 'photo',
        dataUrl: p.dataUrl,
        width: Number(p.width) || 0,
        height: Number(p.height) || 0,
        alt: typeof p.alt === 'string' ? p.alt : '',
      };
    }
    tasks.push({
      id: typeof t.id === 'string' && t.id ? t.id : newId(),
      photo,
      question: t.question,
      hint: typeof t.hint === 'string' ? t.hint : '',
      answers: (t.answers as string[]).slice(0, 30),
    });
  }
  return {
    ok: true,
    quest: { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, id: r.id, title: r.title, intro: typeof r.intro === 'string' ? r.intro : '', tasks, updatedAt: Number(r.updatedAt) || Date.now() },
  };
}

/** Имя файла латиницей: в некоторых окружениях кириллица в имени загрузки превращается в «download». */
export function fileSlug(title: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const s = [...title.toLowerCase()].map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return s || 'quest';
}
