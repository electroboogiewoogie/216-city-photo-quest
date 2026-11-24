import { useEffect, useRef, useState } from 'react';
import { checkAnswer } from '../core/answer-checker';
import { dataUrlBytes, photoFromFile } from '../core/image';
import { buildStandaloneHtml, exportFileName, packageFileName } from '../core/quest-export';
import { addTask, moveTask, parseAnswers, parsePackage, removeTask, updateTask, validateQuest, MAX_TASKS, type Quest, type Task } from '../core/quest-editor';

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`);

export function Editor({
  quest,
  update,
  replace,
  onNew,
  onDemo,
}: {
  quest: Quest;
  update: (fn: (q: Quest) => Quest, immediate?: boolean) => void;
  replace: (q: Quest) => void;
  onNew: () => void;
  onDemo: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState<'new' | 'demo' | null>(null);
  const [focusTask, setFocusTask] = useState<string | null>(null);
  const issues = validateQuest(quest);
  const blocking = issues.filter((i) => i.blocking);
  // HTML с картинками собирается только по нажатию: при фото в мегабайты сборка на каждую правку тормозила бы ввод.
  const canExport = blocking.length === 0;
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  return (
    <main>
      <p className="notice-line" role="status" aria-live="polite" data-testid="notice">
        {notice ?? ''}
      </p>
      {error ? (
        <p className="errors" role="alert" data-testid="error">
          {error}
        </p>
      ) : null}
      <p className="summary" data-testid="summary">
        Заданий: {quest.tasks.length} · {canExport ? 'готов к выгрузке' : `нужно исправить: ${blocking.length}`}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            const h = document.getElementById('ready-h');
            h?.scrollIntoView({ block: 'start' });
            h?.focus();
          }}
        >
          К выгрузке ↓
        </button>
      </p>
      <section className="panel" aria-labelledby="meta-h">
        <h2 id="meta-h">Квест</h2>
        <div className="field">
          <label htmlFor="q-title">Название квеста</label>
          <input id="q-title" value={quest.title} maxLength={120} onChange={(e) => update((q) => ({ ...q, title: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="q-intro">Вступление (показывается перед первым заданием)</label>
          <textarea id="q-intro" rows={2} value={quest.intro} maxLength={600} onChange={(e) => update((q) => ({ ...q, intro: e.target.value }))} />
        </div>
      </section>

      <ol className="tasks">
        {quest.tasks.map((t, i) => (
          <TaskCard
            key={`${quest.id}-${t.id}`}
            t={t}
            i={i}
            n={quest.tasks.length}
            focus={focusTask === t.id}
            onPatch={(patch) => update((q) => updateTask(q, t.id, patch), 'photo' in patch)}
            onMove={(d) => (update((q) => moveTask(q, t.id, d), true), setFocusTask(t.id))}
            onRemove={() => (update((q) => removeTask(q, t.id), true), setNotice(`Задание ${i + 1} удалено`))}
            setError={setError}
          />
        ))}
      </ol>
      <p>
        <button
          type="button"
          className="btn"
          aria-disabled={quest.tasks.length >= MAX_TASKS}
          onClick={() => {
            if (quest.tasks.length >= MAX_TASKS) return;
            const next = addTask(quest);
            update(() => next, true);
            setFocusTask(next.tasks[next.tasks.length - 1]!.id);
          }}
        >
          Добавить задание
        </button>
      </p>

      <section className="panel" aria-labelledby="ready-h">
        <h2 id="ready-h" tabIndex={-1}>
          Готовность и выгрузка
        </h2>
        {issues.length ? (
          <ul className="issues" data-testid="issues">
            {issues.map((x, k) => (
              <li key={k} className={x.blocking ? 'bad' : 'warn'}>
                {x.blocking ? 'Нужно исправить: ' : 'Можно, но лучше добавить: '}
                {x.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ok">Квест готов: {quest.tasks.length} заданий с вопросами, ответами и фотографиями.</p>
        )}
        <div className="row">
          <button
            type="button"
            className="btn btn--primary"
            aria-disabled={!canExport}
            aria-describedby={canExport ? undefined : 'export-why'}
            onClick={() => {
              if (!canExport) return;
              const html = buildStandaloneHtml(quest);
              download(exportFileName(quest), html, 'text/html;charset=utf-8');
              setNotice(`Скачан ${exportFileName(quest)} (${kb(new Blob([html]).size)}). Откройте его в браузере телефона — интернет не нужен.`);
            }}
          >
            Скачать квест для игры (.html)
          </button>
          <button type="button" className="btn" onClick={() => (download(packageFileName(quest), JSON.stringify(quest), 'application/json'), setNotice(`Пакет ${packageFileName(quest)} скачан`))}>
            Сохранить пакет для редактирования (.json)
          </button>
          <label className="btn file-btn">
            Открыть пакет…
            <input
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setError(null);
                try {
                  const r = parsePackage(JSON.parse(await f.text()));
                  if (!r.ok) return setError(`Пакет не открыт: ${r.error}`);
                  replace(r.quest);
                  setNotice(`Открыт квест «${r.quest.title}»: ${r.quest.tasks.length} заданий`);
                } catch {
                  setError('Пакет не открыт: файл не JSON или повреждён');
                }
              }}
            />
          </label>
        </div>
        {!canExport ? (
          <p id="export-why" className="muted small">
            Скачать квест можно, когда у каждого задания есть вопрос и хотя бы один вариант ответа.
          </p>
        ) : null}
        <div className="row">
          {confirmNew ? (
            <>
              <span>Текущий черновик будет заменён. Сохраните пакет, если он нужен.</span>
              <button type="button" className="btn btn--danger" onClick={() => (confirmNew === 'new' ? onNew() : onDemo(), setConfirmNew(null), setNotice(confirmNew === 'new' ? 'Начат новый квест' : 'Открыт демо-квест'))}>
                Заменить
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmNew(null)}>
                Отмена
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmNew('new')}>
                Новый квест
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmNew('demo')}>
                Демо-квест
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function TaskCard({
  t,
  i,
  n,
  focus,
  onPatch,
  onMove,
  onRemove,
  setError,
}: {
  t: Task;
  i: number;
  n: number;
  focus: boolean;
  onPatch: (p: Partial<Omit<Task, 'id'>>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  setError: (e: string | null) => void;
}) {
  const [answersText, setAnswersText] = useState(() => t.answers.join('\n'));
  const [probe, setProbe] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) head.current?.focus();
  }, [focus, i]);
  const id = (k: string) => `t-${t.id}-${k}`;
  const check = probe.trim() ? checkAnswer(probe, t.answers) : null;
  return (
    <li className="panel task" data-testid="task" aria-labelledby={id('h')}>
      <div className="task__head">
        <h3 id={id('h')} ref={head} tabIndex={-1}>
          Задание {i + 1}
        </h3>
        <div className="row">
          <button type="button" className="btn btn--ghost" aria-label={`Задание ${i + 1}: выше`} aria-disabled={i === 0} onClick={() => i > 0 && onMove(-1)}>
            ↑ Выше
          </button>
          <button type="button" className="btn btn--ghost" aria-label={`Задание ${i + 1}: ниже`} aria-disabled={i === n - 1} onClick={() => i < n - 1 && onMove(1)}>
            ↓ Ниже
          </button>
          {confirm ? (
            <>
              <button type="button" className="btn btn--danger" onClick={onRemove}>
                Да, удалить
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>
                Отмена
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost" aria-label={`Удалить задание ${i + 1}`} onClick={() => setConfirm(true)}>
              Удалить
            </button>
          )}
        </div>
      </div>
      <div className="task__grid">
        <div className="photo-box">
          {t.photo ? (
            <>
              <img src={t.photo.dataUrl} alt={t.photo.alt || `Фотография к заданию ${i + 1}`} />
              <p className="muted small">
                {t.photo.name} · {t.photo.width}×{t.photo.height} · {kb(dataUrlBytes(t.photo.dataUrl))}
              </p>
              <div className="field">
                <label htmlFor={id('alt')}>Что на фото (для экранного диктора)</label>
                <input id={id('alt')} value={t.photo.alt} maxLength={200} onChange={(e) => onPatch({ photo: { ...t.photo!, alt: e.target.value } })} />
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => onPatch({ photo: null })}>
                Убрать фото
              </button>
            </>
          ) : (
            <p className="photo-empty">Фото нет</p>
          )}
          <div className="field">
            <label htmlFor={id('file')}>{t.photo ? 'Заменить фотографию' : 'Фотография детали'}</label>
            <input
              id={id('file')}
              type="file"
              accept="image/*"
              aria-busy={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setBusy(true);
                setError(null);
                try {
                  onPatch({ photo: await photoFromFile(f) });
                } catch (err) {
                  setError(`Задание ${i + 1}: ${err instanceof Error ? err.message : 'фото не загружено'}`);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        </div>
        <div className="task__text">
          <div className="field">
            <label htmlFor={id('q')}>Вопрос</label>
            <input id={id('q')} value={t.question} maxLength={300} onChange={(e) => onPatch({ question: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={id('hint')}>Подсказка (необязательно)</label>
            <input id={id('hint')} value={t.hint} maxLength={300} onChange={(e) => onPatch({ hint: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={id('a')}>Варианты ответа, по одному в строке</label>
            <textarea
              id={id('a')}
              rows={3}
              value={answersText}
              onChange={(e) => {
                setAnswersText(e.target.value);
                onPatch({ answers: parseAnswers(e.target.value) });
              }}
              aria-describedby={id('a-hint')}
            />
            <span id={id('a-hint')} className="hint">
              Регистр, лишние пробелы, кавычки и «ё/е» не важны. Принятых вариантов: {t.answers.length}
            </span>
          </div>
          <div className="field">
            <label htmlFor={id('probe')}>Проверить, примется ли ответ</label>
            <input id={id('probe')} value={probe} onChange={(e) => setProbe(e.target.value)} autoComplete="off" />
            {check ? (
              <span className={check.ok ? 'ok small' : 'bad small'} data-testid="probe" aria-live="polite">
                {check.ok ? `Примется: совпал с «${check.matched}»` : `Не примется (после нормализации: «${check.normalized}»)`}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
