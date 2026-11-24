import { useCallback, useEffect, useRef, useState } from 'react';
import { IdbStore, MemoryStore, type QuestStore } from '../core/store';
import { newQuest, type Quest } from '../core/quest-editor';

export type SaveState = 'loading' | 'saved' | 'saving' | 'error' | 'memory';

// Черновик квеста: IndexedDB. Набор текста сохраняется через 300 мс после паузы, действия
// (фото, порядок, удаление, новый квест, открытие пакета) — сразу. Запись в IndexedDB при закрытии
// вкладки может не успеть, поэтому на pagehide несохранённый текст (без фото, он маленький)
// синхронно кладётся в localStorage и при следующем открытии накладывается на черновик того же квеста.

const TEXT_BACKUP = 'cpq.v1.unsaved-text';

interface TextBackup {
  id: string;
  updatedAt: number;
  title: string;
  intro: string;
  tasks: { id: string; question: string; hint: string; answers: string[] }[];
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    s.getItem('cpq.probe');
    return s;
  } catch {
    return null;
  }
}

export function applyTextBackup(q: Quest, raw: string | null): Quest {
  if (!raw) return q;
  try {
    const b = JSON.parse(raw) as TextBackup;
    if (b.id !== q.id || !(b.updatedAt > q.updatedAt) || !Array.isArray(b.tasks)) return q;
    const byId = new Map(b.tasks.map((t) => [t.id, t]));
    return {
      ...q,
      title: String(b.title ?? q.title),
      intro: String(b.intro ?? q.intro),
      updatedAt: b.updatedAt,
      tasks: q.tasks.map((t) => {
        const x = byId.get(t.id);
        return x ? { ...t, question: String(x.question), hint: String(x.hint), answers: Array.isArray(x.answers) ? x.answers.map(String) : t.answers } : t;
      }),
    };
  } catch {
    return q;
  }
}

export function useQuestDraft() {
  const [quest, setQuest] = useState<Quest>(() => newQuest());
  const [state, setState] = useState<SaveState>('loading');
  const [firstRun, setFirstRun] = useState(false);
  const store = useRef<QuestStore | null>(null);
  const latest = useRef(quest);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const memory = useRef(false);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    chain.current = chain.current.then(async () => {
      if (!store.current) return;
      if (!dirty.current) {
        setState(memory.current ? 'memory' : 'saved');
        return;
      }
      const snap = latest.current;
      try {
        await store.current.save(snap);
        if (latest.current === snap) {
          dirty.current = false;
          try {
            storage()?.removeItem(TEXT_BACKUP);
          } catch {
            /* ignore */
          }
          setState(memory.current ? 'memory' : 'saved');
        }
      } catch {
        setState('error');
      }
    });
    return chain.current;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let s: QuestStore = new IdbStore();
      let loaded: Quest | null = null;
      try {
        loaded = await s.load();
      } catch {
        s = new MemoryStore();
        memory.current = true;
      }
      if (!alive) return;
      store.current = s;
      if (loaded) {
        const merged = applyTextBackup(loaded, storage()?.getItem(TEXT_BACKUP) ?? null);
        latest.current = merged;
        setQuest(merged);
        if (merged !== loaded) {
          dirty.current = true;
          void flush();
        }
      } else setFirstRun(true);
      setState(memory.current ? 'memory' : 'saved');
    })();
    const away = () => {
      if (!dirty.current) return;
      const q = latest.current;
      const b: TextBackup = { id: q.id, updatedAt: q.updatedAt, title: q.title, intro: q.intro, tasks: q.tasks.map((t) => ({ id: t.id, question: t.question, hint: t.hint, answers: t.answers })) };
      try {
        storage()?.setItem(TEXT_BACKUP, JSON.stringify(b));
      } catch {
        /* нет места — остаётся только IndexedDB */
      }
      void flush();
    };
    const vis = () => document.visibilityState === 'hidden' && away();
    window.addEventListener('pagehide', away);
    document.addEventListener('visibilitychange', vis);
    return () => {
      alive = false;
      window.removeEventListener('pagehide', away);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [flush]);

  /** Правка черновика. immediate — сохранить сразу (действие), иначе после паузы в наборе. */
  const update = useCallback(
    (fn: (q: Quest) => Quest, immediate = false) => {
      // Следующее состояние считается сразу от latest, а не в функции-обновителе React: обновитель
      // выполняется при отрисовке, и сохранение, запущенное раньше, записало бы старый черновик.
      const next = { ...fn(latest.current), updatedAt: Date.now() };
      latest.current = next;
      setQuest(next);
      dirty.current = true;
      setFirstRun(false);
      setState((s) => (s === 'memory' ? s : 'saving'));
      window.clearTimeout(timer.current);
      if (immediate) queueMicrotask(() => void flush());
      else timer.current = window.setTimeout(() => void flush(), 300);
    },
    [flush],
  );

  const replace = useCallback((q: Quest) => update(() => q, true), [update]);
  return { quest, update, replace, state, firstRun, flush };
}
