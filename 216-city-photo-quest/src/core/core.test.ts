import { describe, expect, it } from 'vitest';
import { checkAnswer, normalizeAnswer } from './answer-checker';
import { demoQuest } from './demo';
import { loadProgress, progressKey, restoreProgress, saveProgress, startProgress, submit, summary, takeHint } from './player-progress';
import { buildStandaloneHtml, exportFileName, safeJson, standalonePlayer } from './quest-export';
import { addTask, fileSlug, moveTask, newQuest, parseAnswers, parsePackage, removeTask, updateTask, validateQuest } from './quest-editor';

describe('answer-checker', () => {
  it('регистр, пробелы, ё, кавычки, знаки по краям — одинаково для ввода и вариантов', () => {
    expect(normalizeAnswer('  ЁЛОЧНАЯ  ')).toBe('елочная');
    expect(normalizeAnswer('ул.\u00a0 Ёлочная!')).toBe('ул. елочная');
    expect(normalizeAnswer('«Петух»')).toBe('петух');
    expect(normalizeAnswer('1907 год.')).toBe('1907 год');
    expect(checkAnswer(' елочная ', ['Ёлочная']).ok).toBe(true);
    expect(checkAnswer('УЛ.   ЁЛОЧНАЯ', ['ул. Ёлочная']).matched).toBe('ул. Ёлочная');
    expect(checkAnswer('Ёлочная улица', ['Ёлочная']).ok).toBe(false); // порядок слов не угадываем
    expect(checkAnswer('   ', ['']).ok).toBe(false);
    expect(checkAnswer('петушок', ['Петух', 'петушок']).ok).toBe(true);
    expect(checkAnswer('курица', ['Петух']).ok).toBe(false);
    // Буква «й» в двух формах Юникода (готовая и «и» + краткая) совпадает после NFC.
    expect(checkAnswer('Чайка', ['Чаи\u0306ка']).ok).toBe(true);
  });
  it('normalizeAnswer самодостаточна: её текст работает отдельно (так она попадает в выгрузку)', () => {
    const copy = new Function(`return (${normalizeAnswer.toString()})`)() as (s: string) => string;
    for (const s of ['  ЁЛОЧНАЯ ', 'ул.\u00a0Ёлочная!', '«Петух»', 'Чаи\u0306ка']) expect(copy(s)).toBe(normalizeAnswer(s));
  });
});

describe('quest-editor', () => {
  it('варианты по строкам без пустых и дублей после нормализации', () => {
    expect(parseAnswers('Ёлочная\n\n  елочная \nул. Ёлочная\n')).toEqual(['Ёлочная', 'ул. Ёлочная']);
  });
  it('порядок, удаление, проверка готовности', () => {
    let q = newQuest('Тест');
    q = addTask(addTask(q));
    const [a, b, c] = q.tasks.map((t) => t.id);
    q = moveTask(q, c!, -1);
    expect(q.tasks.map((t) => t.id)).toEqual([a, c, b]);
    expect(moveTask(q, a!, -1)).toBe(q);
    q = removeTask(q, b!);
    q = updateTask(q, a!, { question: 'Вопрос?', answers: ['да'] });
    const issues = validateQuest(q);
    expect(issues.filter((i) => i.blocking).map((i) => i.message)).toEqual(['Задание 2: нет вопроса', 'Задание 2: нет ни одного варианта ответа']);
    expect(issues.filter((i) => !i.blocking)).toHaveLength(2); // нет фото у обоих
    expect(validateQuest(demoQuest()).filter((i) => i.blocking)).toEqual([]);
  });
  it('пакет: проверка формата и данных', () => {
    const d = demoQuest();
    const back = parsePackage(JSON.parse(JSON.stringify(d)));
    expect(back.ok && back.quest.tasks.length).toBe(3);
    expect(parsePackage({ ...d, format: 'x' })).toEqual({ ok: false, error: 'Это не пакет городского фотоквеста' });
    expect(parsePackage({ ...d, version: 2 }).ok).toBe(false);
    const evil = structuredClone(d);
    evil.tasks[0]!.photo!.dataUrl = 'javascript:alert(1)';
    expect(parsePackage(evil)).toEqual({ ok: false, error: 'Задание 1: фотография не в формате data:image' });
    expect(parsePackage('строка').ok).toBe(false);
  });
  it('имя файла латиницей', () => {
    expect(fileSlug('Детали Старого квартала')).toBe('detali-starogo-kvartala');
    expect(fileSlug('!!!')).toBe('quest');
    expect(exportFileName(demoQuest())).toBe('kvest-detali-starogo-kvartala.html');
  });
});

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe('player-progress', () => {
  const q = demoQuest();
  it('неверный ответ не открывает следующее задание, пустой не считается попыткой', () => {
    let p = startProgress(q);
    let r = submit(q, p, '   ');
    expect(r.result).toEqual({ kind: 'empty' });
    r = submit(q, r.progress, '1908');
    expect(r.result).toEqual({ kind: 'wrong', attempts: 1 });
    expect(r.progress.current).toBe(0);
    r = submit(q, r.progress, ' 1907 ГОД ');
    expect(r.result).toEqual({ kind: 'right', finished: false });
    p = takeHint(r.progress);
    expect(p.hints).toEqual([false, true, false]);
    r = submit(q, p, 'Петушок');
    r = submit(q, r.progress, 'елочная');
    expect(r.result).toEqual({ kind: 'right', finished: true });
    expect(r.progress.current).toBe(3);
    expect(submit(q, r.progress, 'что угодно').result).toEqual({ kind: 'done' });
    expect(summary(r.progress)).toMatchObject({ attempts: 4, hints: 1 });
  });
  it('хранится по id пакета, восстановление приводится к составу квеста', () => {
    const s = new MemStorage() as unknown as Storage;
    const p = submit(q, startProgress(q), '1907').progress;
    expect(saveProgress(s, p)).toBe(true);
    expect(loadProgress(s, q).current).toBe(1);
    const other = demoQuest();
    expect(loadProgress(s, other).current).toBe(0); // другой id — свой прогресс
    expect(progressKey(q.id)).toBe(`cpq.progress.${q.id}`);
    const shorter = { ...q, tasks: q.tasks.slice(0, 1) };
    expect(restoreProgress(shorter, { ...p, current: 7 }).current).toBe(1);
    expect(restoreProgress(q, { questId: 'чужой', current: 2, attempts: [] }).current).toBe(0);
    expect(loadProgress(null, q).current).toBe(0);
  });
});

describe('quest-export', () => {
  it('один HTML: CSP без сети, данные с картинками, экранирование </script>', () => {
    const q = demoQuest();
    q.tasks[0]!.question = 'Что за </script><script>alert(1)</script>?';
    const html = buildStandaloneHtml(q);
    expect(html).toContain(`content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"`);
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import|url\(http/);
    expect(html.match(/<\/script>/g)).toHaveLength(2); // только закрывающие теги двух своих скриптов
    const json = /<script type="application\/json" id="quest-data">([\s\S]*?)<\/script>/.exec(html)![1]!;
    const data = JSON.parse(json) as { id: string; tasks: { question: string; photo: { dataUrl: string } }[] };
    expect(data.id).toBe(q.id);
    expect(data.tasks[0]!.question).toBe(q.tasks[0]!.question);
    expect(data.tasks[1]!.photo.dataUrl.startsWith('data:image/svg+xml')).toBe(true);
    expect(safeJson('a\u2028b')).toBe('"a\\u2028b"');
  });
  it('проигрыватель самодостаточен: его текст компилируется отдельно', () => {
    const fn = new Function(`return (${standalonePlayer.toString()})`)();
    expect(typeof fn).toBe('function');
    const script = /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(buildStandaloneHtml(demoQuest()))![1]!;
    expect(() => new Function(script)).not.toThrow();
  });
});
