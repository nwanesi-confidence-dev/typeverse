import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import fs from 'fs';
import path from 'path';

declare const __BUILD_PACKS_URL__: string;

const DEFAULT_DESKTOP_PACKS_URL: string = (() => {
  const runtime = (process.env.VITE_PACKS_URL || '').trim();
  const raw = runtime || (typeof __BUILD_PACKS_URL__ === 'string' ? __BUILD_PACKS_URL__.trim() : '');
  if (!raw) return '';
  return raw.endsWith('/') ? raw : `${raw}/`;
})();

function getHwAccelFlagPath(): string {
  return path.join(app.getPath('userData'), 'hw-accel-disabled.flag');
}

function isHardwareAccelerationDisabledFlag(): boolean {
  try {
    const flagPath = getHwAccelFlagPath();
    return fs.existsSync(flagPath) && fs.readFileSync(flagPath, 'utf8').trim() === '1';
  } catch {
    return false;
  }
}

// Old-PC safety: must run BEFORE app.whenReady()
const initialHwAccelDisabled = isHardwareAccelerationDisabledFlag();
if (initialHwAccelDisabled) {
  app.disableHardwareAcceleration();
}

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 800,
  isMaximized: false,
};

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const devServerUrl = process.env.VITE_DEV_SERVER_URL || '';

let mainWindow: BrowserWindow | null = null;
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;
let didFlushOnClose = false;
let pendingCloseTimer: ReturnType<typeof setTimeout> | null = null;

function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function getBackupFilePath(): string {
  return path.join(app.getPath('userData'), 'typeverse-backup.json');
}

function writeFileAtomic(targetPath: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(targetPath), {recursive: true});
  const tmpPath = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, data);
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch {
    fs.writeFileSync(targetPath, data);
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Ignore temp cleanup failure
      }
    }
  }
}

function isRectVisibleOnAnyDisplay(x: number, y: number, width: number, height: number): boolean {
  const displays = screen.getAllDisplays();
  if (displays.length === 0) return false;
  const centerX = x + Math.floor(width / 2);
  const centerY = y + Math.floor(height / 2);
  return displays.some((display) => {
    const area = display.workArea;
    return (
      centerX >= area.x &&
      centerX <= area.x + area.width &&
      centerY >= area.y &&
      centerY <= area.y + area.height
    );
  });
}

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    const width =
      typeof parsed.width === 'number' && Number.isFinite(parsed.width)
        ? Math.max(960, Math.round(parsed.width))
        : DEFAULT_WINDOW_STATE.width;
    const height =
      typeof parsed.height === 'number' && Number.isFinite(parsed.height)
        ? Math.max(600, Math.round(parsed.height))
        : DEFAULT_WINDOW_STATE.height;

    const hasCoords =
      typeof parsed.x === 'number' &&
      Number.isFinite(parsed.x) &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.y);

    if (hasCoords && isRectVisibleOnAnyDisplay(parsed.x!, parsed.y!, width, height)) {
      return {
        width,
        height,
        x: Math.round(parsed.x!),
        y: Math.round(parsed.y!),
        isMaximized: Boolean(parsed.isMaximized),
      };
    }

    return {
      width,
      height,
      isMaximized: Boolean(parsed.isMaximized),
    };
  } catch {
    return {...DEFAULT_WINDOW_STATE};
  }
}

function persistWindowStateNow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    const state: WindowState = {
      width: Math.max(960, bounds.width),
      height: Math.max(600, bounds.height),
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    };
    writeFileAtomic(getWindowStatePath(), JSON.stringify(state, null, 2));
  } catch {
    // Ignore window state write errors
  }
}

function schedulePersistWindowState(): void {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    persistWindowStateNow();
  }, 250);
}

function isSafeHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafePackFetchUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isAllowedAppNavigation(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (devServerUrl) {
      const devOrigin = new URL(devServerUrl).origin;
      return parsed.origin === devOrigin;
    }
    if (parsed.protocol === 'file:') {
      const targetPath = path.normalize(decodeURIComponent(parsed.pathname));
      const allowedRoot = path.normalize(path.resolve(__dirname, '..', '..', 'dist'));
      const normalizedTarget =
        isWin && targetPath.startsWith('\\') ? targetPath.slice(1) : targetPath;
      return normalizedTarget.toLowerCase().startsWith(allowedRoot.toLowerCase());
    }
    return false;
  } catch {
    return false;
  }
}

function buildApplicationMenu(): Menu {
  const toggleFullscreenItem: MenuItemConstructorOptions = {
    label: 'Toggle Full Screen',
    accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
    click: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    },
  };

  if (isMac) {
    const template: MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          {role: 'about'},
          {type: 'separator'},
          {role: 'services'},
          {type: 'separator'},
          {role: 'hide'},
          {role: 'hideOthers'},
          {role: 'unhide'},
          {type: 'separator'},
          {role: 'quit'},
        ],
      },
      {
        label: 'Edit',
        submenu: [
          {role: 'undo'},
          {role: 'redo'},
          {type: 'separator'},
          {role: 'cut'},
          {role: 'copy'},
          {role: 'paste'},
          {role: 'pasteAndMatchStyle'},
          {role: 'delete'},
          {role: 'selectAll'},
        ],
      },
      {
        label: 'View',
        submenu: [
          toggleFullscreenItem,
          ...(devServerUrl
            ? ([
                {type: 'separator'},
                {role: 'reload'},
                {role: 'forceReload'},
                {role: 'toggleDevTools'},
              ] as MenuItemConstructorOptions[])
            : []),
        ],
      },
      {
        label: 'Window',
        submenu: [{role: 'minimize'}, {role: 'zoom'}, {type: 'separator'}, {role: 'front'}, {role: 'close'}],
      },
    ];
    return Menu.buildFromTemplate(template);
  }

  const winTemplate: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{role: 'quit'}],
    },
    {
      label: 'Edit',
      submenu: [
        {role: 'undo'},
        {role: 'redo'},
        {type: 'separator'},
        {role: 'cut'},
        {role: 'copy'},
        {role: 'paste'},
        {role: 'selectAll'},
      ],
    },
    {
      label: 'View',
      submenu: [
        toggleFullscreenItem,
        ...(devServerUrl
          ? ([
              {type: 'separator'},
              {role: 'reload'},
              {role: 'forceReload'},
              {role: 'toggleDevTools'},
            ] as MenuItemConstructorOptions[])
          : []),
      ],
    },
  ];
  return Menu.buildFromTemplate(winTemplate);
}

function resolveWindowIcon(): string | undefined {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'build', 'icon.png'),
    path.resolve(process.resourcesPath || '', 'build', 'icon.png'),
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function resolveSeedPacksDir(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'dist', 'packs'),
    path.resolve(process.resourcesPath || '', 'packs'),
    path.resolve(__dirname, '..', '..', 'packs'),
  ];
  return candidates.find((dir) => dir && fs.existsSync(dir)) ?? null;
}

function readLocalSeedJson(filename: string): {ok: boolean; data?: unknown; error?: string} {
  try {
    const safeName = path.basename(filename);
    if (!safeName || !safeName.endsWith('.json') || safeName.includes('..')) {
      return {ok: false, error: 'Invalid seed pack filename.'};
    }
    const seedDir = resolveSeedPacksDir();
    if (!seedDir) return {ok: false, error: 'Seed packs folder not found.'};
    const filePath = path.join(seedDir, safeName);
    if (!fs.existsSync(filePath)) return {ok: false, error: 'Seed pack file missing.'};
    const raw = fs.readFileSync(filePath, 'utf8');
    return {ok: true, data: JSON.parse(raw) as unknown};
  } catch {
    return {ok: false, error: 'Failed to read starter pack.'};
  }
}

async function fetchJsonWithTimeout(url: string): Promise<{ok: boolean; data?: unknown; error?: string}> {
  if (!isSafePackFetchUrl(url)) {
    return {ok: false, error: 'Pack source URL must use HTTPS.'};
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {ok: false, error: `Pack source returned HTTP ${res.status}.`};
    }
    const data = (await res.json()) as unknown;
    return {ok: true, data};
  } catch (err: unknown) {
    const msg =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'Pack download timed out after 8 seconds.'
        : 'Unable to reach pack source. Using saved words.';
    return {ok: false, error: msg};
  }
}

async function getAutoUpdater() {
  const updaterMod = await import('electron-updater');
  const fallback = (
    updaterMod as unknown as {default?: {autoUpdater?: typeof updaterMod.autoUpdater}}
  ).default?.autoUpdater;
  return updaterMod.autoUpdater ?? fallback ?? null;
}

function getReleasesFallbackUrl(): string {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      repository?: string | {url?: string};
      build?: {publish?: Array<{owner?: string; repo?: string}>};
    };
    const pub = pkg.build?.publish?.[0];
    if (pub?.owner && pub?.repo) {
      return `https://github.com/${pub.owner}/${pub.repo}/releases/latest`;
    }
    const repoUrl =
      typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
    const match = repoUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/i);
    if (match) {
      return `https://github.com/${match[1]}/releases/latest`;
    }
  } catch {
    // Fallback below
  }
  return 'https://github.com/releases';
}

async function setupAutoUpdater(): Promise<void> {
  if (!app.isPackaged) return;
  try {
    const autoUpdater = await getAutoUpdater();
    if (!autoUpdater) return;

    autoUpdater.autoDownload = isWin;
    autoUpdater.autoInstallOnAppQuit = isWin;

    autoUpdater.on('update-available', (info) => {
      if (!isWin && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop:update-event', {
          status: 'available-download',
          version: info?.version ?? '',
          releaseUrl: getReleasesFallbackUrl(),
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      if (isWin && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('desktop:update-event', {
          status: 'downloaded',
          version: info?.version ?? '',
        });
      }
    });

    autoUpdater.on('error', () => {
      // Non-blocking: ignore update check errors offline
    });

    setTimeout(() => {
      void autoUpdater.checkForUpdates().catch(() => {});
    }, 8000);
  } catch {
    // Fail silently if updater config is absent
  }
}

function createMainWindow(): void {
  const state = loadWindowState();
  const preloadPath = path.join(__dirname, 'preload.cjs');
  didFlushOnClose = false;

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#080B14',
    show: false,
    autoHideMenuBar: !isMac,
    title: 'TypeVerse',
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  });

  if (!isMac) {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (state.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    void setupAutoUpdater();
  });

  mainWindow.on('resize', schedulePersistWindowState);
  mainWindow.on('move', schedulePersistWindowState);
  mainWindow.on('maximize', schedulePersistWindowState);
  mainWindow.on('unmaximize', schedulePersistWindowState);

  mainWindow.on('close', (event) => {
    persistWindowStateNow();
    if (!didFlushOnClose && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      didFlushOnClose = true;
      try {
        mainWindow.webContents.send('desktop:request-backup-flush');
      } catch {
        mainWindow.close();
        return;
      }
      pendingCloseTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.close();
        }
      }, 500);
    }
  });

  mainWindow.on('closed', () => {
    if (pendingCloseTimer) {
      clearTimeout(pendingCloseTimer);
      pendingCloseTimer = null;
    }
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    if (isSafeHttpsUrl(url)) {
      void shell.openExternal(url);
    }
    return {action: 'deny'};
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) {
      return;
    }
    event.preventDefault();
    if (isSafeHttpsUrl(url)) {
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11' && !input.control && !input.alt && !input.meta) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
    }
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    const indexHtmlPath = path.resolve(__dirname, '..', '..', 'dist', 'index.html');
    void mainWindow.loadFile(indexHtmlPath);
  }
}

function registerIpcHandlers(): void {
  ipcMain.on('desktop:get-app-version', (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.handle('desktop:toggle-fullscreen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return next;
  });

  ipcMain.handle('desktop:is-fullscreen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.isFullScreen();
  });

  ipcMain.handle('desktop:open-external', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isSafeHttpsUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.on('desktop:set-title', (_event, title: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed() || typeof title !== 'string') return;
    mainWindow.setTitle(title.slice(0, 120));
  });

  // Old-PC safety: Hardware acceleration toggle
  ipcMain.handle('desktop:get-hw-accel-disabled', () => {
    return isHardwareAccelerationDisabledFlag();
  });

  ipcMain.handle('desktop:set-hw-accel-disabled', (_event, disabled: unknown) => {
    const next = Boolean(disabled);
    try {
      const flagPath = getHwAccelFlagPath();
      if (next) {
        writeFileAtomic(flagPath, '1');
      } else if (fs.existsSync(flagPath)) {
        fs.unlinkSync(flagPath);
      }
    } catch {
      // Ignore write failures
    }
    return {
      disabled: next,
      restartRequired: next !== initialHwAccelDisabled,
    };
  });

  ipcMain.on('desktop:relaunch', () => {
    app.relaunch();
    app.exit(0);
  });

  // Data Safety: Atomic JSON backup + native file dialogs
  ipcMain.handle('desktop:read-backup', () => {
    try {
      const backupPath = getBackupFilePath();
      if (!fs.existsSync(backupPath)) return null;
      const raw = fs.readFileSync(backupPath, 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  });

  ipcMain.handle('desktop:write-backup', (_event, snapshot: unknown) => {
    try {
      if (!snapshot || typeof snapshot !== 'object') return false;
      const serialized = JSON.stringify(snapshot, null, 2);
      if (serialized.length > 10 * 1024 * 1024) return false;
      writeFileAtomic(getBackupFilePath(), serialized);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.on('desktop:backup-flushed', () => {
    if (pendingCloseTimer) {
      clearTimeout(pendingCloseTimer);
      pendingCloseTimer = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle('desktop:open-data-folder', async () => {
    const userDataDir = app.getPath('userData');
    fs.mkdirSync(userDataDir, {recursive: true});
    const errMsg = await shell.openPath(userDataDir);
    return errMsg === '';
  });

  ipcMain.handle(
    'desktop:export-progress',
    async (_event, args: {jsonContent?: unknown; defaultFilename?: unknown}) => {
      if (!mainWindow || mainWindow.isDestroyed()) return {saved: false};
      if (typeof args?.jsonContent !== 'string') return {saved: false};
      const defaultName =
        typeof args.defaultFilename === 'string' && args.defaultFilename.trim()
          ? path.basename(args.defaultFilename.trim())
          : 'typeverse-progress-backup.json';

      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export TypeVerse Progress',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{name: 'JSON Backup', extensions: ['json']}],
      });

      if (result.canceled || !result.filePath) {
        return {saved: false, canceled: true};
      }
      writeFileAtomic(result.filePath, args.jsonContent);
      return {saved: true};
    },
  );

  ipcMain.handle('desktop:import-progress', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return {content: null};
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import TypeVerse Progress',
      properties: ['openFile'],
      filters: [{name: 'JSON Backup', extensions: ['json']}],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return {content: null, canceled: true};
    }
    const chosen = result.filePaths[0];
    const stat = fs.statSync(chosen);
    if (stat.size > 10 * 1024 * 1024) {
      return {content: null};
    }
    const content = fs.readFileSync(chosen, 'utf8');
    return {content};
  });

  // Static JSON Word Pack Factory IPC (zero Gemini keys, zero API routes)
  ipcMain.handle('desktop:packs-status', () => {
    return {
      defaultPacksUrl: DEFAULT_DESKTOP_PACKS_URL || null,
    };
  });

  ipcMain.handle('desktop:packs-fetch-index', async (_event, sourceUrl: unknown) => {
    const raw =
      typeof sourceUrl === 'string' && sourceUrl.trim()
        ? sourceUrl.trim()
        : DEFAULT_DESKTOP_PACKS_URL;
    if (!raw) {
      return {ok: false, error: 'Pack source URL is not configured yet.'};
    }
    const base = raw.endsWith('/') ? raw : `${raw}/`;
    return fetchJsonWithTimeout(`${base}index.json`);
  });

  ipcMain.handle(
    'desktop:packs-fetch-pack',
    async (_event, args: {sourceUrl?: unknown; file?: unknown}) => {
      const raw =
        typeof args?.sourceUrl === 'string' && args.sourceUrl.trim()
          ? args.sourceUrl.trim()
          : DEFAULT_DESKTOP_PACKS_URL;
      const file = typeof args?.file === 'string' ? args.file.trim() : '';
      if (!raw || !file || file.includes('..') || !/^[a-zA-Z0-9._/-]+\.json$/.test(file)) {
        return {ok: false, error: 'Invalid pack URL or filename.'};
      }
      const base = raw.endsWith('/') ? raw : `${raw}/`;
      return fetchJsonWithTimeout(`${base}${file.replace(/^\/+/, '')}`);
    },
  );

  ipcMain.handle('desktop:packs-read-seed-index', () => {
    return readLocalSeedJson('index.json');
  });

  ipcMain.handle('desktop:packs-read-seed-pack', (_event, file: unknown) => {
    if (typeof file !== 'string') return {ok: false, error: 'Invalid filename.'};
    return readLocalSeedJson(file);
  });

  ipcMain.on('desktop:quit-and-install', () => {
    if (!isWin || !app.isPackaged) return;
    void getAutoUpdater()
      .then((autoUpdater) => {
        autoUpdater?.quitAndInstall();
      })
      .catch(() => {});
  });
}

// Single-instance enforcement
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId('com.typeverse.app');

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    Menu.setApplicationMenu(buildApplicationMenu());
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) {
      app.quit();
    }
  });
}
