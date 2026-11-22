import type {
  AppearanceSettings,
  PersistedGraphicsState,
  ProfileProgress,
  UserProfile,
} from '@/src/types/app';

export interface DesktopBackupSnapshot {
  version: 1;
  savedAt: number;
  activeProfileId: string;
  profiles: UserProfile[];
  progressByProfile: Record<string, ProfileProgress>;
  settings?: AppearanceSettings;
  graphicsState?: PersistedGraphicsState;
}

export interface DesktopPacksStatus {
  defaultPacksUrl: string | null;
}

export interface DesktopFetchJsonResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface DesktopUpdateEvent {
  status: 'downloaded' | 'available-download';
  version: string;
  releaseUrl?: string;
}

export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  versions: {
    app: string;
    electron: string;
    chrome: string;
    node: string;
  };
  toggleFullscreen: () => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  setTitle: (title: string) => void;
  hwAccel: {
    getDisabled: () => Promise<boolean>;
    getGpuFeatureStatus: () => Promise<Record<string, string>>;
    setDisabled: (disabled: boolean) => Promise<{disabled: boolean; restartRequired: boolean}>;
    relaunch: () => void;
  };
  data: {
    readBackup: () => Promise<DesktopBackupSnapshot | null>;
    writeBackup: (snapshot: DesktopBackupSnapshot) => Promise<boolean>;
    notifyBackupFlushed: () => void;
    onRequestBackupFlush: (callback: () => void) => () => void;
    openDataFolder: () => Promise<boolean>;
    exportProgress: (
      jsonContent: string,
      defaultFilename?: string,
    ) => Promise<{saved: boolean; canceled?: boolean}>;
    importProgress: () => Promise<{content: string | null; canceled?: boolean}>;
  };
  packs: {
    getStatus: () => Promise<DesktopPacksStatus>;
    fetchIndex: (sourceUrl: string) => Promise<DesktopFetchJsonResult>;
    fetchPack: (args: {sourceUrl: string; file: string}) => Promise<DesktopFetchJsonResult>;
    readSeedIndex: () => Promise<DesktopFetchJsonResult>;
    readSeedPack: (file: string) => Promise<DesktopFetchJsonResult>;
  };
  updater: {
    onUpdateEvent: (callback: (event: DesktopUpdateEvent) => void) => () => void;
    quitAndInstall: () => void;
  };
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export {};
