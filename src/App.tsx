import { useEffect, useState } from 'react';
import { demoQuest } from './core/demo';
import { newQuest } from './core/quest-editor';
import { Editor } from './ui/Editor';
import { Player } from './ui/Player';
import { useQuestDraft, type SaveState } from './ui/useQuestDraft';

type View = 'edit' | 'play';
const parse = (): View => (location.hash === '#play' ? 'play' : 'edit');
const SAVE_TEXT: Record<SaveState, string> = {
  loading: 'Открываю черновик…',
  saved: 'Черновик сохранён в этом браузере',
  saving: 'Сохраняю черновик…',
  error: 'Не удалось сохранить черновик: скачайте пакет .json, чтобы не потерять работу',
  memory: 'Хранилище браузера недоступно: черновик живёт до закрытия вкладки, скачайте пакет .json',
};

export function App() {
  const [view, setView] = useState<View>(parse);
  const draft = useQuestDraft();
  useEffect(() => {
    const h = () => setView(parse());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => {
    document.title = view === 'play' ? `Игра · ${draft.quest.title}` : 'Городской фотоквест — редактор';
  }, [view, draft.quest.title]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="kicker">Городской фотоквест</p>
          <h1>{view === 'play' ? 'Игра' : 'Редактор квеста'}</h1>
        </div>
        <p className={`save save--${draft.state}`} role="status" data-testid="save">
          {SAVE_TEXT[draft.state]}
        </p>
      </header>
      <nav className="tabs" aria-label="Режим">
        <a href="#edit" className={`tab ${view === 'edit' ? 'tab--on' : ''}`} aria-current={view === 'edit' ? 'page' : undefined}>
          Редактор
        </a>
        <a href="#play" className={`tab ${view === 'play' ? 'tab--on' : ''}`} aria-current={view === 'play' ? 'page' : undefined}>
          Пройти квест
        </a>
      </nav>
      {draft.state === 'loading' ? (
        <p className="muted">Загрузка…</p>
      ) : view === 'play' ? (
        <Player quest={draft.quest} />
      ) : (
        <>
          {draft.firstRun ? (
            <section className="panel welcome" aria-labelledby="welcome-h">
              <h2 id="welcome-h">С чего начать</h2>
              <p>Соберите задания из фотографий деталей города: вопрос, подсказка и варианты ответа. Готовый квест скачивается одним HTML-файлом и открывается на телефоне без интернета.</p>
              <button type="button" className="btn btn--primary" onClick={() => draft.replace(demoQuest())}>
                Открыть демо-квест из трёх заданий
              </button>
            </section>
          ) : null}
          <Editor quest={draft.quest} update={draft.update} replace={draft.replace} onNew={() => draft.replace(newQuest())} onDemo={() => draft.replace(demoQuest())} />
        </>
      )}
    </div>
  );
}
