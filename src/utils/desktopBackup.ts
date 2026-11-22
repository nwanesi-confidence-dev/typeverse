import {
  createEmptyProgress,
  getActiveProfileId,
  idbGetAll,
  idbSet,
  loadGraphicsState,
  loadProfileProgress,
  loadProfiles,
  loadSettings,
  saveGraphicsState,
  saveProfile,
  saveProfileProgress,
  saveSettings,
  setActiveProfileId,
} from '@/src/db/storage';
import type {
  AppearanceSettings,
  PersistedGraphicsState,
  ProfileProgress,
  UserProfile,
} from '@/src/types/app';
import type {DesktopBackupSnapshot} from '@/src/types/desktop';

const PERIODIC_BACKUP_MS = 3 * 60 * 1000; // 3 minutes

export async function buildDesktopBackupSnapshot(): Promise<DesktopBackupSnapshot> {
  const [profiles, activeProfileId, settings, graphicsState] = await Promise.all([
    loadProfiles(),
    getActiveProfileId(),
    loadSettings(),
    loadGraphicsState(),
  ]);

  const progressEntries = await Promise.all(
    profiles.map(async (p) => [p.id, await loadProfileProgress(p.id)] as const),
  );

  const progressByProfile: Record<string, ProfileProgress> = {};
  for (const [id, prog] of progressEntries) {
    progressByProfile[id] = prog;
  }

  return {
    version: 1,
    savedAt: Date.now(),
    activeProfileId,
    profiles,
    progressByProfile,
    settings,
    graphicsState,
  };
}

export async function applyBackupSnapshotToStorage(
  snapshot: Partial<DesktopBackupSnapshot>,
): Promise<boolean> {
  if (!Array.isArray(snapshot.profiles) || snapshot.profiles.length === 0) {
    return false;
  }

  for (const profile of snapshot.profiles) {
    if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string') {
      continue;
    }
    await saveProfile(profile);
    const prog = snapshot.progressByProfile?.[profile.id];
    if (prog && typeof prog.xp === 'number') {
      await saveProfileProgress({
        ...createEmptyProgress(profile.id),
        ...prog,
        profileId: profile.id,
      });
    }
  }

  if (typeof snapshot.activeProfileId === 'string' && snapshot.activeProfileId) {
    await setActiveProfileId(snapshot.activeProfileId);
  }

  if (snapshot.settings && typeof snapshot.settings === 'object') {
    const current = await loadSettings();
    await saveSettings({...current, ...(snapshot.settings as Partial<AppearanceSettings>)});
  }

  if (snapshot.graphicsState && typeof snapshot.graphicsState === 'object') {
    const currentGfx = await loadGraphicsState();
    const restoredGfx = snapshot.graphicsState as Partial<PersistedGraphicsState>;
    await saveGraphicsState({
      ...currentGfx,
      ...restoredGfx,
      realisticOptions: {
        ...currentGfx.realisticOptions,
        ...(restoredGfx.realisticOptions ?? {}),
      },
      gameOverrides: {
        ...currentGfx.gameOverrides,
        ...(restoredGfx.gameOverrides ?? {}),
      },
    });
  }

  await idbSet('meta', 'restoredBackupAt', Date.now());
  return true;
}

export async function restoreFromDesktopBackupIfNeeded(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.desktop?.isDesktop) return false;
  try {
    const existingProfiles = await idbGetAll<UserProfile>('profiles');
    if (existingProfiles.length > 0) {
      return false;
    }
    const backup = await window.desktop.data.readBackup();
    if (!backup) return false;
    return await applyBackupSnapshotToStorage(backup);
  } catch {
    return false;
  }
}

export async function flushDesktopBackupNow(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.desktop?.isDesktop) return false;
  try {
    const snapshot = await buildDesktopBackupSnapshot();
    return await window.desktop.data.writeBackup(snapshot);
  } catch {
    return false;
  }
}

export function initDesktopBackupSync(): () => void {
  if (typeof window === 'undefined' || !window.desktop?.isDesktop) {
    return () => {};
  }

  const intervalId = window.setInterval(() => {
    void flushDesktopBackupNow();
  }, PERIODIC_BACKUP_MS);

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void flushDesktopBackupNow();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const unsubFlush = window.desktop.data.onRequestBackupFlush(() => {
    void flushDesktopBackupNow().finally(() => {
      window.desktop?.data.notifyBackupFlushed();
    });
  });

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    unsubFlush();
  };
}
