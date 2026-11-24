import { parsePackage, type Quest } from './quest-editor';

// Черновик квеста в IndexedDB (картинки не помещаются в localStorage). Если IndexedDB недоступна
// (приватный режим некоторых браузеров), работа продолжается в памяти, и интерфейс говорит об этом.

const DB = 'city-photo-quest';
const STORE = 'drafts';
const KEY = 'current';

export interface QuestStore {
  load(): Promise<Quest | null>;
  save(q: Quest): Promise<void>;
}

export class MemoryStore implements QuestStore {
  private q: Quest | null = null;
  async load() {
    return this.q ? structuredClone(this.q) : null;
  }
  async save(q: Quest) {
    this.q = structuredClone(q);
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB недоступна'));
    req.onblocked = () => reject(new Error('IndexedDB заблокирована другой вкладкой'));
  });
}

export class IdbStore implements QuestStore {
  private db: Promise<IDBDatabase> | null = null;
  private conn() {
    this.db ??= openDb().catch((e) => {
      this.db = null;
      throw e;
    });
    return this.db;
  }
  async load(): Promise<Quest | null> {
    const db = await this.conn();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw) return null;
    const r = parsePackage(raw);
    return r.ok ? r.quest : null;
  }
  async save(q: Quest): Promise<void> {
    const db = await this.conn();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(q, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Не удалось сохранить черновик'));
      tx.onabort = () => reject(tx.error ?? new Error('Сохранение прервано (возможно, не хватает места)'));
    });
  }
}
