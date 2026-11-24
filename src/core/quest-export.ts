import { normalizeAnswer } from './answer-checker';
import { fileSlug, type Quest } from './quest-editor';

// Выгрузка квеста в один HTML-файл: данные (с изображениями data URL), проигрыватель и стили внутри.
// Файл открывается в любом браузере, в том числе с телефона и без интернета: CSP запрещает любые
// сетевые запросы, кроме встроенных data:-картинок. Прогресс хранится в localStorage по id пакета.

interface StandaloneQuest {
  id: string;
  title: string;
  intro: string;
  tasks: { question: string; hint: string; answers: string[]; photo: { dataUrl: string; alt: string } | null }[];
}

/**
 * Проигрыватель выгруженного квеста. Встраивается в HTML через toString(), поэтому самодостаточен:
 * не использует импорты и функции модуля, всё нужное приходит параметрами. Правила те же, что в
 * player-progress.ts: неверный ответ не открывает следующее задание, пустой не считается попыткой.
 */
export function standalonePlayer(doc: Document, quest: StandaloneQuest, normalize: (s: string) => string): void {
  const key = 'cpq.progress.' + quest.id;
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
    storage.getItem(key);
  } catch {
    storage = null;
  }
  const n = quest.tasks.length;
  type P = { questId: string; current: number; attempts: number[]; hints: boolean[]; startedAt: number; finishedAt: number | null };
  const fresh = (): P => ({ questId: quest.id, current: 0, attempts: quest.tasks.map(() => 0), hints: quest.tasks.map(() => false), startedAt: Date.now(), finishedAt: null });
  let p: P = fresh();
  try {
    const raw = storage ? storage.getItem(key) : null;
    const s = raw ? (JSON.parse(raw) as P) : null;
    if (s && s.questId === quest.id && typeof s.current === 'number') {
      p = {
        questId: quest.id,
        current: Math.max(0, Math.min(Math.floor(s.current), n)),
        attempts: quest.tasks.map((_, i) => Math.max(0, Number(s.attempts && s.attempts[i]) || 0)),
        hints: quest.tasks.map((_, i) => Boolean(s.hints && s.hints[i])),
        startedAt: Number(s.startedAt) || Date.now(),
        finishedAt: s.finishedAt || null,
      };
    }
  } catch {
    p = fresh();
  }
  const save = () => {
    try {
      if (storage) storage.setItem(key, JSON.stringify(p));
    } catch {
      /* память переполнена — прогресс живёт до закрытия вкладки */
    }
  };
  const root = doc.getElementById('app') as HTMLElement;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string>, ...kids: (Node | string)[]) => {
    const e = doc.createElement(tag);
    for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]!);
    for (const c of kids) e.append(c);
    return e;
  };
  let message: { text: string; kind: string } | null = null;
  const render = (focus: 'heading' | 'input' | 'message') => {
    root.textContent = '';
    root.append(el('p', { class: 'kicker' }, 'Городской фотоквест'), el('h1', {}, quest.title));
    if (p.current >= n) {
      const attempts = p.attempts.reduce((a, b) => a + b, 0);
      const hints = p.hints.filter(Boolean).length;
      const h = el('h2', { tabindex: '-1', id: 'done' }, 'Квест пройден!');
      const again = el('button', { type: 'button', class: 'ghost' }, 'Пройти заново');
      again.addEventListener('click', () => {
        p = fresh();
        message = null;
        save();
        render('heading');
      });
      root.append(el('section', { class: 'card done', 'data-testid': 'done' }, h, el('p', {}, 'Заданий: ' + n + ' · попыток: ' + attempts + ' · подсказок: ' + hints), again));
      h.focus();
      return;
    }
    const t = quest.tasks[p.current]!;
    const bar = el('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(p.current), 'aria-label': 'Пройдено заданий' });
    bar.append(el('span', { style: 'width:' + Math.round((p.current / n) * 100) + '%' }));
    const h = el('h2', { tabindex: '-1', id: 'task-h' }, 'Задание ' + (p.current + 1) + ' из ' + n);
    const card = el('section', { class: 'card', 'aria-labelledby': 'task-h', 'data-testid': 'task' }, h, bar);
    if (p.current === 0 && quest.intro) card.append(el('p', { class: 'intro' }, quest.intro));
    if (t.photo) card.append(el('img', { src: t.photo.dataUrl, alt: t.photo.alt || 'Фотография к заданию ' + (p.current + 1), class: 'photo' }));
    card.append(el('p', { class: 'question' }, t.question));
    const input = el('input', { id: 'answer', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done' }) as HTMLInputElement;
    const form = el('form', { class: 'answer' }, el('label', { for: 'answer' }, 'Ваш ответ'), input, el('button', { type: 'submit' }, 'Проверить'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = normalize(input.value);
      if (!v) {
        message = { text: 'Введите ответ', kind: 'warn' };
        render('message');
        return;
      }
      p.attempts[p.current] = (p.attempts[p.current] || 0) + 1;
      const ok = t.answers.some((a) => normalize(a) === v);
      if (ok) {
        p.current += 1;
        if (p.current >= n) p.finishedAt = Date.now();
        message = p.current < n ? { text: 'Верно! Следующее задание.', kind: 'ok' } : null;
        save();
        render('heading');
      } else {
        message = { text: 'Неверно. Попыток на этом задании: ' + p.attempts[p.current] + '. Попробуйте ещё.', kind: 'bad' };
        save();
        render('message');
      }
    });
    card.append(form);
    card.append(el('p', { class: 'muted' }, 'Попыток: ' + (p.attempts[p.current] || 0)));
    if (t.hint) {
      if (p.hints[p.current]) card.append(el('p', { class: 'hint', 'data-testid': 'hint' }, 'Подсказка: ' + t.hint));
      else {
        const hb = el('button', { type: 'button', class: 'ghost' }, 'Показать подсказку');
        hb.addEventListener('click', () => {
          p.hints[p.current] = true;
          save();
          render('input');
        });
        card.append(hb);
      }
    }
    const msg = el('p', { class: 'msg ' + (message ? message.kind : ''), role: 'status', 'aria-live': 'polite', tabindex: '-1', 'data-testid': 'msg' }, message ? message.text : '');
    card.append(msg);
    root.append(card);
    if (focus === 'heading') h.focus();
    else if (focus === 'message') input.focus();
    else input.focus();
  };
  render('heading');
}

const STYLE = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f5f7f6;color:#1c2622;line-height:1.45}
#app{max-width:40rem;margin:0 auto;padding:1rem}.kicker{margin:0;color:#1f5f4a;font-weight:600}h1{font-size:1.4rem;margin:.1rem 0 .8rem}
h2{font-size:1.1rem;margin:0 0 .5rem}h2:focus{outline:none}.card{background:#fff;border:1px solid #d5ddd9;border-radius:12px;padding:1rem}
.bar{height:.5rem;background:#e3f0ea;border-radius:99px;overflow:hidden;margin-bottom:.75rem}.bar span{display:block;height:100%;background:#1f5f4a}
.photo{display:block;width:100%;height:auto;max-height:60vh;object-fit:contain;background:#eef2f0;border-radius:8px}
.question{font-size:1.15rem;font-weight:600}.intro{color:#55625c}
.answer{display:grid;grid-template-columns:1fr auto;gap:.5rem;align-items:end}.answer label{grid-column:1/-1;font-weight:600;font-size:.9rem}
input{font:inherit;padding:.6rem;border:1px solid #a8b5af;border-radius:8px;min-height:2.75rem;width:100%}
button{font:inherit;min-height:2.75rem;padding:0 1rem;border-radius:8px;border:1px solid #1f5f4a;background:#1f5f4a;color:#fff;cursor:pointer}
button.ghost{background:#fff;color:#1f5f4a;margin-top:.5rem}button:focus-visible,input:focus-visible{outline:3px solid #1a5fd0;outline-offset:2px}
.muted{color:#55625c;font-size:.9rem}.hint{background:#fff4d6;color:#5c3d00;border-radius:8px;padding:.5rem .75rem}
.msg{min-height:1.5rem;font-weight:600}.msg.ok{color:#1d6b3f}.msg.bad{color:#a1271b}.msg.warn{color:#7a5200}
.done{text-align:center}`;

/** Данные для встраивания: только то, что нужно проигрывателю. */
export function toStandalone(q: Quest): StandaloneQuest {
  return {
    id: q.id,
    title: q.title,
    intro: q.intro,
    tasks: q.tasks.map((t) => ({ question: t.question, hint: t.hint, answers: t.answers, photo: t.photo ? { dataUrl: t.photo.dataUrl, alt: t.photo.alt } : null })),
  };
}

/** JSON внутри <script type="application/json">: «<» и разделители строк экранируются. */
export function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildStandaloneHtml(q: Quest): string {
  const data = toStandalone(q);
  const script = `(function(){var Q=JSON.parse(document.getElementById('quest-data').textContent);(${standalonePlayer.toString()})(document,Q,(${normalizeAnswer.toString()}));})();`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<meta name="generator" content="city-photo-quest 1.0">
<title>${escHtml(q.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main id="app" aria-live="off"><noscript>Для игры нужен JavaScript.</noscript></main>
<script type="application/json" id="quest-data">${safeJson(data)}</script>
<script>${script.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
}

export function exportFileName(q: Quest): string {
  return `kvest-${fileSlug(q.title)}.html`;
}

export function packageFileName(q: Quest): string {
  return `kvest-${fileSlug(q.title)}.json`;
}
