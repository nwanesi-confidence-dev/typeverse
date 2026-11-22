import {
  DEFAULT_GRAPHICS_STATE,
  DEFAULT_SETTINGS,
  type AppearanceSettings,
  type FreshPack,
  type PersistedGraphicsState,
  type ProfileProgress,
  type UserProfile,
} from '@/src/types/app';

const DB_NAME = 'typeverse-db';
const DB_VERSION = 1;

export type StoreName = 'settings' | 'profiles' | 'progress' | 'wordPacks' | 'meta';

const STORES: StoreName[] = ['settings', 'profiles', 'progress', 'wordPacks', 'meta'];
const LS_PREFIX = 'tv_fallback_v1_';

let dbPromise: Promise<IDBDatabase | null> | null = null;
let storageBackend: 'indexeddb' | 'localstorage' = 'indexeddb';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    storageBackend = 'localstorage';
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        }
      };
      request.onsuccess = () => {
        storageBackend = 'indexeddb';
        resolve(request.result);
      };
      request.onerror = () => {
        storageBackend = 'localstorage';
        resolve(null);
      };
      request.onblocked = () => {
        storageBackend = 'localstorage';
        resolve(null);
      };
    } catch {
      storageBackend = 'localstorage';
      resolve(null);
    }
  });

  return dbPromise;
}

function lsKey(store: StoreName, key: string): string {
  return `${LS_PREFIX}${store}:${key}`;
}

function lsGet<T>(store: StoreName, key: string): T | null {
  try {
    const raw = window.localStorage.getItem(lsKey(store, key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsSet<T>(store: StoreName, key: string, value: T): void {
  try {
    window.localStorage.setItem(lsKey(store, key), JSON.stringify(value));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function lsDel(store: StoreName, key: string): void {
  try {
    window.localStorage.removeItem(lsKey(store, key));
  } catch {
    // Ignore
  }
}

function lsGetAll<T>(store: StoreName): T[] {
  const results: T[] = [];
  const prefix = `${LS_PREFIX}${store}:`;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const raw = window.localStorage.getItem(k);
        if (raw) results.push(JSON.parse(raw) as T);
      }
    }
  } catch {
    // Ignore
  }
  return results;
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return lsGet<T>(store, key);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => {
        resolve((req.result as T | undefined) ?? lsGet<T>(store, key));
      };
      req.onerror = () => resolve(lsGet<T>(store, key));
    } catch {
      resolve(lsGet<T>(store, key));
    }
  });
}

export async function idbSet<T>(store: StoreName, key: string, value: T): Promise<void> {
  lsSet(store, key, value);
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  lsDel(store, key);
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDatabase();
  if (!db) return lsGetAll<T>(store);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => {
        const rows = (req.result as T[] | undefined) ?? [];
        resolve(rows.length > 0 ? rows : lsGetAll<T>(store));
      };
      req.onerror = () => resolve(lsGetAll<T>(store));
    } catch {
      resolve(lsGetAll<T>(store));
    }
  });
}

export async function idbClearStore(store: StoreName): Promise<void> {
  const prefix = `${LS_PREFIX}${store}:`;
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToDelete.push(k);
    }
    keysToDelete.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Ignore
  }
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getStorageBackendName(): 'IndexedDB' | 'localStorage' {
  return storageBackend === 'indexeddb' ? 'IndexedDB' : 'localStorage';
}

export async function loadSettings(): Promise<AppearanceSettings> {
  const saved = await idbGet<Partial<AppearanceSettings>>('settings', 'appearance');
  return {...DEFAULT_SETTINGS, ...(saved ?? {})};
}

export async function saveSettings(settings: AppearanceSettings): Promise<void> {
  await idbSet('settings', 'appearance', settings);
}

export async function loadGraphicsState(): Promise<PersistedGraphicsState> {
  const saved = await idbGet<Partial<PersistedGraphicsState>>('settings', 'graphicsMode');
  return {
    ...DEFAULT_GRAPHICS_STATE,
    ...(saved ?? {}),
    realisticOptions: {
      ...DEFAULT_GRAPHICS_STATE.realisticOptions,
      ...(saved?.realisticOptions ?? {}),
    },
    gameOverrides: {
      ...DEFAULT_GRAPHICS_STATE.gameOverrides,
      ...(saved?.gameOverrides ?? {}),
    },
  };
}

export async function saveGraphicsState(state: PersistedGraphicsState): Promise<void> {
  await idbSet('settings', 'graphicsMode', state);
}

const DEFAULT_PROFILE_ID = 'default-typist';

export const DEFAULT_PROFILE: UserProfile = {
  id: DEFAULT_PROFILE_ID,
  name: 'Typist',
  avatar: 'keyboard',
  colour: '#22D3EE',
  createdAt: Date.now(),
};

export function createEmptyProgress(profileId: string): ProfileProgress {
  return {
    profileId,
    xp: 0,
    streakDays: 0,
    lastPractisedDate: null,
    totalWordsTyped: 0,
    totalTimeSec: 0,
    bestWpm: 0,
    targetWpm: 60,
    dailyGoalMinutes: 15,
    unlockedLessonIndex: 0,
    lessonStars: {},
    badges: [],
    sessions: [],
    keyMetrics: {},
    bigramMetrics: {},
    dailyActivity: {},
  };
}

export async function loadProfiles(): Promise<UserProfile[]> {
  const profiles = await idbGetAll<UserProfile>('profiles');
  if (profiles.length === 0) {
    await idbSet('profiles', DEFAULT_PROFILE.id, DEFAULT_PROFILE);
    return [DEFAULT_PROFILE];
  }
  return profiles.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await idbSet('profiles', profile.id, profile);
}

export async function getActiveProfileId(): Promise<string> {
  const id = await idbGet<string>('meta', 'activeProfileId');
  return id ?? DEFAULT_PROFILE_ID;
}

export async function setActiveProfileId(profileId: string): Promise<void> {
  await idbSet('meta', 'activeProfileId', profileId);
}

export async function loadProfileProgress(profileId: string): Promise<ProfileProgress> {
  const existing = await idbGet<ProfileProgress>('progress', profileId);
  if (existing) return existing;
  const fresh = createEmptyProgress(profileId);
  await idbSet('progress', profileId, fresh);
  return fresh;
}

export async function saveProfileProgress(progress: ProfileProgress): Promise<void> {
  await idbSet('progress', progress.profileId, progress);
}

const MAX_FRESH_PACKS = 30;

function isCurrentPackShape(pack: unknown): pack is FreshPack {
  if (!pack || typeof pack !== 'object') return false;
  const p = pack as Partial<FreshPack>;
  return (
    typeof p.id === 'string' &&
    typeof p.kind === 'string' &&
    typeof p.theme === 'string' &&
    typeof p.level === 'number' &&
    typeof p.spelling === 'string' &&
    Array.isArray(p.items) &&
    p.items.length > 0
  );
}

export async function loadFreshPacks(): Promise<FreshPack[]> {
  const raw = await idbGetAll<unknown>('wordPacks');
  const valid = raw.filter(isCurrentPackShape);
  return valid.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveFreshPack(pack: FreshPack): Promise<void> {
  await idbSet('wordPacks', pack.id, pack);
  const all = await loadFreshPacks();
  if (all.length > MAX_FRESH_PACKS) {
    // Evict oldest (lowest createdAt) packs first
    const excess = all.slice(MAX_FRESH_PACKS);
    for (const oldPack of excess) {
      await idbDelete('wordPacks', oldPack.id);
    }
  }
}
