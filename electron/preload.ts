import {contextBridge, ipcRenderer} from 'electron';

const desktopApi = {
  isDesktop: true as const,
  platform: process.platform,
  versions: {
    app: ipcRenderer.sendSync('desktop:get-app-version') as string,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
  },
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('desktop:is-fullscreen'),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('desktop:open-external', url),
  setTitle: (title: string): void => {
    ipcRenderer.send('desktop:set-title', title);
  },
  onDisplayMetricsChanged: (
    callback: (info: {
      scaleFactor: number;
      workArea: {x: number; y: number; width: number; height: number};
    }) => void,
  ): (() => void) => {
    const handler = (
      _evt: Electron.IpcRendererEvent,
      payload: {
        scaleFactor: number;
        workArea: {x: number; y: number; width: number; height: number};
      },
    ) => {
      callback(payload);
    };
    ipcRenderer.on('desktop:display-metrics-changed', handler);
    return () => ipcRenderer.removeListener('desktop:display-metrics-changed', handler);
  },
  hwAccel: {
    getDisabled: (): Promise<boolean> => ipcRenderer.invoke('desktop:get-hw-accel-disabled'),
    getGpuFeatureStatus: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke('desktop:get-gpu-feature-status'),
    setDisabled: (disabled: boolean): Promise<{disabled: boolean; restartRequired: boolean}> =>
      ipcRenderer.invoke('desktop:set-hw-accel-disabled', Boolean(disabled)),
    relaunch: (): void => {
      ipcRenderer.send('desktop:relaunch');
    },
  },
  data: {
    readBackup: () => ipcRenderer.invoke('desktop:read-backup'),
    writeBackup: (snapshot: unknown): Promise<boolean> =>
      ipcRenderer.invoke('desktop:write-backup', snapshot),
    notifyBackupFlushed: (): void => {
      ipcRenderer.send('desktop:backup-flushed');
    },
    onRequestBackupFlush: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('desktop:request-backup-flush', handler);
      return () => ipcRenderer.removeListener('desktop:request-backup-flush', handler);
    },
    openDataFolder: (): Promise<boolean> => ipcRenderer.invoke('desktop:open-data-folder'),
    exportProgress: (
      jsonContent: string,
      defaultFilename?: string,
    ): Promise<{saved: boolean; canceled?: boolean}> =>
      ipcRenderer.invoke('desktop:export-progress', {jsonContent, defaultFilename}),
    importProgress: (): Promise<{content: string | null; canceled?: boolean}> =>
      ipcRenderer.invoke('desktop:import-progress'),
  },
  packs: {
    getStatus: () => ipcRenderer.invoke('desktop:packs-status'),
    fetchIndex: (sourceUrl: string) =>
      ipcRenderer.invoke('desktop:packs-fetch-index', sourceUrl),
    fetchPack: (args: {sourceUrl: string; file: string}) =>
      ipcRenderer.invoke('desktop:packs-fetch-pack', args),
    readSeedIndex: () => ipcRenderer.invoke('desktop:packs-read-seed-index'),
    readSeedPack: (file: string) =>
      ipcRenderer.invoke('desktop:packs-read-seed-pack', file),
  },
  updater: {
    onUpdateEvent: (callback: (event: unknown) => void): (() => void) => {
      const handler = (_evt: Electron.IpcRendererEvent, payload: unknown) => {
        callback(payload);
      };
      ipcRenderer.on('desktop:update-event', handler);
      return () => ipcRenderer.removeListener('desktop:update-event', handler);
    },
    quitAndInstall: (): void => {
      ipcRenderer.send('desktop:quit-and-install');
    },
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
