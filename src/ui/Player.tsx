import { useEffect, useRef, useState } from 'react';
import { loadProgress, saveProgress, startProgress, submit, summary, takeHint, type Progress } from '../core/player-progress';
import { validateQuest, type Quest } from '../core/quest-editor';

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.getItem('cpq.probe');
    return s;
  } catch {
    return null;
  }
}

/** Проигрыватель внутри приложения: те же правила и тот же ключ прогресса, что у выгруженного файла. */
export function Player({ quest }: { quest: Quest }) {
  const [storage] = useState(safeStorage);
  const [p, setP] = useState<Progress>(() => loadProgress(storage, quest));
  const [answer, setAnswer] = useState('');
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'bad' | 'warn' } | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const blocking = validateQuest(quest).filter((i) => i.blocking);
  useEffect(() => {
    setP(loadProgress(storage, quest));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest.id, quest.tasks.length, storage]);
  const n = quest.tasks.length;
  const current = p.current;
  useEffect(() => {
    head.current?.focus();
  }, [current]);
  const set = (next: Progress) => {
    setP(next);
    saveProgress(storage, next);
  };

  if (blocking.length)
    return (
      <main>
        <section className="panel">
          <h2>Квест ещё не готов</h2>
          <ul className="issues">
            {blocking.map((b, k) => (
              <li key={k} className="bad">
                {b.message}
              </li>
            ))}
          </ul>
          <a href="#edit">Вернуться в редактор</a>
        </section>
      </main>
    );

  if (current >= n) {
    const s = summary(p);
    return (
      <main>
        <section className="panel play done" data-testid="done">
          <h2 ref={head} tabIndex={-1}>
            Квест «{quest.title}» пройден!
          </h2>
          <p>
            Заданий: {n} · попыток: {s.attempts} · подсказок: {s.hints}
          </p>
          <button type="button" className="btn" onClick={() => (set(startProgress(quest)), setMsg(null))}>
            Пройти заново
          </button>
        </section>
      </main>
    );
  }
  const t = quest.tasks[current]!;
  return (
    <main>
      <section className="panel play" aria-labelledby="task-h" data-testid="play">
        <h2 id="task-h" ref={head} tabIndex={-1}>
          Задание {current + 1} из {n}
        </h2>
        <div className="bar" role="progressbar" aria-label="Пройдено заданий" aria-valuemin={0} aria-valuemax={n} aria-valuenow={current}>
          <span style={{ width: `${Math.round((current / n) * 100)}%` }} />
        </div>
        {current === 0 && quest.intro ? <p className="muted">{quest.intro}</p> : null}
        {t.photo ? <img className="play__photo" src={t.photo.dataUrl} alt={t.photo.alt || `Фотография к заданию ${current + 1}`} /> : null}
        <p className="play__question">{t.question}</p>
        <form
          className="play__form"
          onSubmit={(e) => {
            e.preventDefault();
            const r = submit(quest, p, answer);
            if (r.result.kind === 'empty') {
              setMsg({ text: 'Введите ответ', kind: 'warn' });
              input.current?.focus();
              return;
            }
            set(r.progress);
            if (r.result.kind === 'wrong') {
              setMsg({ text: `Неверно. Попыток на этом задании: ${r.result.attempts}. Попробуйте ещё.`, kind: 'bad' });
              input.current?.select();
            } else {
              setAnswer('');
              setMsg(r.result.kind === 'right' && !r.result.finished ? { text: 'Верно! Следующее задание.', kind: 'ok' } : null);
            }
          }}
        >
          <label htmlFor="answer">Ваш ответ</label>
          <input id="answer" ref={input} value={answer} onChange={(e) => setAnswer(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <button type="submit" className="btn btn--primary">
            Проверить
          </button>
        </form>
        <p className="muted small">Попыток: {p.attempts[current] ?? 0}</p>
        {t.hint ? (
          p.hints[current] ? (
            <p className="hint-box" data-testid="hint">
              Подсказка: {t.hint}
            </p>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => (set(takeHint(p)), input.current?.focus())}>
              Показать подсказку
            </button>
          )
        ) : null}
        <p className={`play__msg ${msg?.kind ?? ''}`} role="status" aria-live="polite" data-testid="msg">
          {msg?.text ?? ''}
        </p>
        <button type="button" className="btn btn--ghost small" onClick={() => (set(startProgress(quest)), setMsg(null), setAnswer(''))}>
          Начать квест сначала
        </button>
      </section>
    </main>
  );
}
