import {
  validatePackIndex,
  validatePackObject,
  type StaticPackIndexEntry,
} from '@/shared/pack-rules.mjs';
import {
  idbGet,
  idbSet,
  loadFreshPacks,
  saveFreshPack,
} from '@/src/db/storage';
import type {
  AppearanceSettings,
  ContentTheme,
  FreshPack,
  PackKind,
  WordDifficultyTier,
} from '@/src/types/app';
import {getLocalDateKey} from '@/src/utils/progression';

const META_KEY = 'freshPacksMeta';
const MIN_SYNC_INTERVAL_MS = 60_000; // avoid redundant re-fetches within 60s unless user manually refreshes
const FETCH_TIMEOUT_MS = 8000;
const MAX_PACKS_PER_RUN = 6;

function normalisePacksBaseUrl(raw?: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const ENV_PACKS_URL = normalisePacksBaseUrl(
  import.meta.env.VITE_PACKS_URL as string | undefined,
);

export const PACKS_URL: string =
  typeof window !== 'undefined' && window.desktop?.isDesktop
    ? ENV_PACKS_URL
    : ENV_PACKS_URL || './packs/';

interface FreshPacksMeta {
  lastUpdatedAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
}

export interface FreshWordsStatus {
  lastUpdatedAt: number | null;
  packCount: number;
  inFlight: boolean;
  effectiveSourceUrl: string;
  lastError: string | null;
}

export interface FreshFetchOutcome {
  ok: boolean;
  reason: 'fetched' | 'up-to-date' | 'offline' | 'in-flight' | 'no-source' | 'error';
  downloadedCount: number;
  message?: string;
}

export interface SyncPreferences {
  level?: WordDifficultyTier;
  theme?: ContentTheme;
  kind?: PackKind;
  manual?: boolean;
}

let inFlightPromise: Promise<FreshFetchOutcome> | null = null;
let seedLoadedThisSession = false;
const statusListeners = new Set<() => void>();

export function subscribeFreshWordsStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function notifyStatusListeners(): void {
  statusListeners.forEach((fn) => fn());
}

async function loadMeta(): Promise<FreshPacksMeta> {
  const saved = await idbGet<Partial<FreshPacksMeta>>('meta', META_KEY);
  return {
    lastUpdatedAt: saved?.lastUpdatedAt ?? null,
    lastAttemptAt: saved?.lastAttemptAt ?? null,
    lastError: saved?.lastError ?? null,
  };
}

async function saveMeta(meta: FreshPacksMeta): Promise<void> {
  await idbSet('meta', META_KEY, meta);
  notifyStatusListeners();
}

export function isValidPackSourceUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true; // empty = use default
  if (trimmed.startsWith('./') || trimmed.startsWith('/')) return true;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'https:') return true;
    if (
      u.protocol === 'http:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function resolvePacksBaseUrl(
  settings?: Pick<AppearanceSettings, 'customPacksUrl'>,
): Promise<string> {
  const custom = normalisePacksBaseUrl(settings?.customPacksUrl);
  if (custom && isValidPackSourceUrl(custom)) {
    return custom;
  }

  if (typeof window !== 'undefined' && window.desktop?.isDesktop && window.desktop.packs) {
    try {
      const desktopStatus = await window.desktop.packs.getStatus();
      const desktopDefault = normalisePacksBaseUrl(desktopStatus.defaultPacksUrl ?? '');
      if (desktopDefault) return desktopDefault;
    } catch {
      // Fall through to PACKS_URL
    }
  }

  return PACKS_URL;
}

export async function getFreshWordsStatus(
  settings?: Pick<AppearanceSettings, 'customPacksUrl'>,
): Promise<FreshWordsStatus> {
  const [meta, packs, effectiveSourceUrl] = await Promise.all([
    loadMeta(),
    loadFreshPacks(),
    resolvePacksBaseUrl(settings),
  ]);

  return {
    lastUpdatedAt: meta.lastUpdatedAt ?? packs[0]?.createdAt ?? null,
    packCount: packs.length,
    inFlight: inFlightPromise !== null,
    effectiveSourceUrl,
    lastError: meta.lastError,
  };
}

async function readSeedIndexJson(): Promise<unknown | null> {
  if (typeof window === 'undefined') return null;

  if (window.desktop?.isDesktop && window.desktop.packs) {
    const res = await window.desktop.packs.readSeedIndex();
    return res.ok ? res.data : null;
  }

  try {
    const res = await fetch('./packs/index.json', {cache: 'no-cache'});
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function readSeedPackJson(file: string): Promise<unknown | null> {
  if (typeof window === 'undefined') return null;

  if (window.desktop?.isDesktop && window.desktop.packs) {
    const res = await window.desktop.packs.readSeedPack(file);
    return res.ok ? res.data : null;
  }

  try {
    const cleanFile = file.replace(/^\/+/, '');
    const res = await fetch(`./packs/${cleanFile}`, {cache: 'no-cache'});
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Ensures bundled starter packs from dist/packs/ (or resources/packs/) are imported
 * into IndexedDB so first-ever offline launches immediately have rich fresh packs.
 */
export async function ensureSeedPacksLoaded(): Promise<void> {
  if (seedLoadedThisSession) return;
  seedLoadedThisSession = true;

  try {
    const existing = await loadFreshPacks();
    if (existing.length > 0) return;

    const rawIndex = await readSeedIndexJson();
    if (!rawIndex) return;

    const validatedIndex = validatePackIndex(rawIndex);
    if (!validatedIndex.ok) return;

    for (const entry of validatedIndex.index.packs.slice(0, 8)) {
      const rawPack = await readSeedPackJson(entry.file);
      if (!rawPack) continue;
      const validatedPack = validatePackObject(rawPack);
      if (!validatedPack.ok) continue;

      const freshPack: FreshPack = {
        ...validatedPack.pack,
        createdAt: entry.createdAt,
        date: entry.date,
        usedCount: 0,
        isSeed: true,
      };
      await saveFreshPack(freshPack);
    }
    notifyStatusListeners();
  } catch {
    // Non-fatal: bundled JS word bank always remains available
  }
}

async function fetchRemoteIndex(
  baseUrl: string,
): Promise<{ok: boolean; data?: unknown; error?: string}> {
  if (typeof window !== 'undefined' && window.desktop?.isDesktop && window.desktop.packs) {
    return window.desktop.packs.fetchIndex(baseUrl);
  }

  try {
    const url = new URL('index.json', new URL(baseUrl, window.location.href)).toString();
    const res = await fetch(url, {
      cache: 'no-cache',
      signal:
        typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
          : undefined,
    });
    if (!res.ok) {
      return {ok: false, error: `Pack index returned HTTP ${res.status}.`};
    }
    const data = (await res.json()) as unknown;
    return {ok: true, data};
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach pack index.',
    };
  }
}

async function fetchRemotePack(
  baseUrl: string,
  file: string,
): Promise<{ok: boolean; data?: unknown; error?: string}> {
  if (typeof window !== 'undefined' && window.desktop?.isDesktop && window.desktop.packs) {
    return window.desktop.packs.fetchPack({sourceUrl: baseUrl, file});
  }

  try {
    const cleanFile = file.replace(/^\/+/, '');
    const url = new URL(cleanFile, new URL(baseUrl, window.location.href)).toString();
    const res = await fetch(url, {
      cache: 'no-cache',
      signal:
        typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
          : undefined,
    });
    if (!res.ok) {
      return {ok: false, error: `Pack file returned HTTP ${res.status}.`};
    }
    const data = (await res.json()) as unknown;
    return {ok: true, data};
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to fetch pack file.',
    };
  }
}

function scoreCandidateEntry(
  entry: StaticPackIndexEntry,
  todayKey: string,
  settings: AppearanceSettings,
  prefs: SyncPreferences,
): number {
  let score = 0;
  if (entry.date === todayKey) score += 200;
  if (entry.spelling === settings.spelling) score += 100;
  if (prefs.level) {
    const diff = Math.abs(entry.level - prefs.level);
    score += Math.max(0, 60 - diff * 15);
  }
  if (prefs.theme && entry.theme === prefs.theme) score += 45;
  if (prefs.kind && entry.kind === prefs.kind) score += 30;
  return score;
}

async function executePackSync(
  settings: AppearanceSettings,
  prefs: SyncPreferences = {},
): Promise<FreshFetchOutcome> {
  await ensureSeedPacksLoaded();

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      reason: 'offline',
      downloadedCount: 0,
      message: 'Offline: using saved words.',
    };
  }

  if (inFlightPromise) {
    return {
      ok: false,
      reason: 'in-flight',
      downloadedCount: 0,
      message: 'A word pack check is already in progress.',
    };
  }

  const baseUrl = await resolvePacksBaseUrl(settings);
  if (!baseUrl) {
    return {
      ok: false,
      reason: 'no-source',
      downloadedCount: 0,
      message: 'No word pack source URL is configured yet.',
    };
  }

  const meta = await loadMeta();
  const now = Date.now();
  if (
    !prefs.manual &&
    meta.lastAttemptAt !== null &&
    now - meta.lastAttemptAt < MIN_SYNC_INTERVAL_MS
  ) {
    return {
      ok: true,
      reason: 'up-to-date',
      downloadedCount: 0,
      message: 'Word packs checked recently.',
    };
  }

  inFlightPromise = (async (): Promise<FreshFetchOutcome> => {
    const attemptTime = Date.now();
    try {
      const indexRes = await fetchRemoteIndex(baseUrl);
      if (!indexRes.ok || !indexRes.data) {
        const message = indexRes.error ?? 'Could not fetch word pack index.';
        await saveMeta({
          ...meta,
          lastAttemptAt: attemptTime,
          lastError: message,
        });
        return {
          ok: false,
          reason: 'error',
          downloadedCount: 0,
          message,
        };
      }

      const validatedIndex = validatePackIndex(indexRes.data);
      if (!validatedIndex.ok) {
        await saveMeta({
          ...meta,
          lastAttemptAt: attemptTime,
          lastError: validatedIndex.reason,
        });
        return {
          ok: false,
          reason: 'error',
          downloadedCount: 0,
          message: validatedIndex.reason,
        };
      }

      const existing = await loadFreshPacks();
      const existingById = new Map(existing.map((p) => [p.id, p]));
      const todayKey = getLocalDateKey();

      const changedOrNew = validatedIndex.index.packs.filter((entry) => {
        const prev = existingById.get(entry.id);
        if (!prev) return true;
        if (prev.createdAt !== entry.createdAt) return true;
        if (prev.items.length !== entry.count) return true;
        return false;
      });

      if (changedOrNew.length === 0) {
        await saveMeta({
          lastUpdatedAt: meta.lastUpdatedAt ?? Date.now(),
          lastAttemptAt: attemptTime,
          lastError: null,
        });
        return {
          ok: true,
          reason: 'up-to-date',
          downloadedCount: 0,
          message: 'All available word packs are already saved offline.',
        };
      }

      const sortedCandidates = [...changedOrNew].sort((a, b) => {
        const scoreDiff =
          scoreCandidateEntry(b, todayKey, settings, prefs) -
          scoreCandidateEntry(a, todayKey, settings, prefs);
        if (scoreDiff !== 0) return scoreDiff;
        return b.createdAt - a.createdAt;
      });

      const batch = sortedCandidates.slice(0, MAX_PACKS_PER_RUN);
      let downloadedCount = 0;

      for (const entry of batch) {
        const packRes = await fetchRemotePack(baseUrl, entry.file);
        if (!packRes.ok || !packRes.data) continue;

        const validatedPack = validatePackObject(packRes.data);
        if (!validatedPack.ok) continue;

        const prev = existingById.get(entry.id);
        const stored: FreshPack = {
          ...validatedPack.pack,
          createdAt: entry.createdAt,
          date: entry.date,
          usedCount: prev?.usedCount ?? 0,
          isSeed: false,
        };
        await saveFreshPack(stored);
        downloadedCount += 1;
      }

      const syncedAt = Date.now();
      await saveMeta({
        lastUpdatedAt: downloadedCount > 0 ? syncedAt : meta.lastUpdatedAt,
        lastAttemptAt: syncedAt,
        lastError: null,
      });

      return {
        ok: true,
        reason: downloadedCount > 0 ? 'fetched' : 'up-to-date',
        downloadedCount,
        message:
          downloadedCount > 0
            ? `Saved ${downloadedCount} new word pack${downloadedCount === 1 ? '' : 's'} for offline play.`
            : 'No valid new packs found; kept existing saved words.',
      };
    } catch {
      await saveMeta({
        ...meta,
        lastAttemptAt: attemptTime,
        lastError: 'Network unavailable; using saved words.',
      });
      return {
        ok: false,
        reason: 'error',
        downloadedCount: 0,
        message: 'Network unavailable. Continuing smoothly with saved words.',
      };
    } finally {
      inFlightPromise = null;
      notifyStatusListeners();
    }
  })();

  notifyStatusListeners();
  return inFlightPromise;
}

export function maybePrefetchFreshPack(
  settings: AppearanceSettings,
  prefs: SyncPreferences = {},
): void {
  if (typeof window === 'undefined') return;

  const trigger = () => {
    void executePackSync(settings, prefs);
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(trigger, {timeout: 3000});
  } else {
    window.setTimeout(trigger, 400);
  }
}

export async function manualRefreshFreshPack(
  settings: AppearanceSettings,
  prefs: SyncPreferences = {},
): Promise<FreshFetchOutcome> {
  return executePackSync(settings, {...prefs, manual: true});
}

export async function markFreshPacksUsed(packIds: string[]): Promise<void> {
  if (packIds.length === 0) return;
  const uniqueIds = Array.from(new Set(packIds));
  try {
    const existing = await loadFreshPacks();
    const byId = new Map(existing.map((p) => [p.id, p]));
    let changed = false;
    for (const id of uniqueIds) {
      const pack = byId.get(id);
      if (!pack) continue;
      await saveFreshPack({
        ...pack,
        usedCount: (pack.usedCount ?? 0) + 1,
      });
      changed = true;
    }
    if (changed) notifyStatusListeners();
  } catch {
    // Non-fatal
  }
}

export function extractFreshPackIdsFromEntryIds(entryIds: string[]): string[] {
  const ids = new Set<string>();
  for (const entryId of entryIds) {
    if (entryId.startsWith('fp::')) {
      const parts = entryId.split('::');
      if (parts[1]) ids.add(parts[1]);
    }
  }
  return Array.from(ids);
}
