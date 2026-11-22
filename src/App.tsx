import React, {Suspense, useEffect, useState} from 'react';
import {AppearanceDrawer} from '@/src/components/AppearanceDrawer';
import {FirstRunGraphicsDialog} from '@/src/components/FirstRunGraphicsDialog';
import {Header} from '@/src/components/Header';
import {InstallHelpModal} from '@/src/components/InstallHelpModal';
import {ProfileManagerModal} from '@/src/components/ProfileManagerModal';
import {ShortcutsModal} from '@/src/components/ShortcutsModal';
import {SpeedTestOverlay} from '@/src/components/SpeedTestOverlay';
import {ToastHost} from '@/src/components/ToastHost';
import {TouchDeviceGate} from '@/src/components/TouchDeviceGate';
import {WpmHud} from '@/src/components/WpmHud';
import {AppearanceProvider, useAppearance} from '@/src/context/AppearanceContext';
import {graphicsModeService, useGraphicsMode} from '@/src/graphics/graphicsModeService';
import {
  getActiveProfileId,
  loadProfileProgress,
  loadProfiles,
} from '@/src/db/storage';
import {
  useOnlineStatus,
  usePWAInstall,
  useServiceWorkerUpdate,
} from '@/src/pwa/usePWA';
import type {ProfileProgress, SceneId, UserProfile} from '@/src/types/app';
import type {DesktopUpdateEvent} from '@/src/types/desktop';
import type {TypingTelemetrySnapshot} from '@/src/types/typing';
import {
  initDesktopBackupSync,
  restoreFromDesktopBackupIfNeeded,
} from '@/src/utils/desktopBackup';
import {
  ensureSeedPacksLoaded,
  maybePrefetchFreshPack,
} from '@/src/utils/freshWordsClient';

const HubScene = React.lazy(() =>
  import('@/src/components/HubScene').then((m) => ({default: m.HubScene})),
);
const ClassroomScene = React.lazy(() =>
  import('@/src/components/ClassroomScene').then((m) => ({default: m.ClassroomScene})),
);
const SpeedTestScene = React.lazy(() =>
  import('@/src/components/SpeedTestScene').then((m) => ({default: m.SpeedTestScene})),
);
const FreePracticeScene = React.lazy(() =>
  import('@/src/components/FreePracticeScene').then((m) => ({default: m.FreePracticeScene})),
);
const DailyChallengeScene = React.lazy(() =>
  import('@/src/components/DailyChallengeScene').then((m) => ({default: m.DailyChallengeScene})),
);
const SkillLabScene = React.lazy(() =>
  import('@/src/components/SkillLabScene').then((m) => ({default: m.SkillLabScene})),
);
const ArcadeScene = React.lazy(() =>
  import('@/src/components/ArcadeScene').then((m) => ({default: m.ArcadeScene})),
);
const DashboardScene = React.lazy(() =>
  import('@/src/components/DashboardScene').then((m) => ({default: m.DashboardScene})),
);
const WordBankExplorer = React.lazy(() =>
  import('@/src/components/WordBankExplorer').then((m) => ({default: m.WordBankExplorer})),
);

function SceneLoaderFallback() {
  return (
    <div className="mx-auto max-w-[1360px] px-6 py-16 text-center text-sm" style={{color: 'var(--tv-text-muted)'}}>
      Loading scene...
    </div>
  );
}

const VALID_SCENES: SceneId[] = [
  'hub',
  'classroom',
  'speed-test',
  'free-practice',
  'daily-challenge',
  'skill-lab',
  'arcade',
  'dashboard',
  'word-bank',
];

function readSceneFromHash(): SceneId {
  if (typeof window === 'undefined') return 'hub';
  const raw = window.location.hash.replace(/^#\/?/, '').trim() as SceneId;
  return VALID_SCENES.includes(raw) ? raw : 'hub';
}

function TypeVerseShell() {
  const [activeScene, setActiveScene] = useState<SceneId>(() => readSceneFromHash());
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [touchDismissed, setTouchDismissed] = useState(false);
  const [isTouchOnlyPhone, setIsTouchOnlyPhone] = useState(false);

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string>('default-typist');
  const [profileProgress, setProfileProgress] = useState<ProfileProgress | null>(null);

  const {settings} = useAppearance();
  const gfx = useGraphicsMode();
  const isOnline = useOnlineStatus();
  const {canNativeInstall, isInstalled, isIOS, install} = usePWAInstall();
  const {needRefresh, reloadApp, dismissUpdate} = useServiceWorkerUpdate();
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateEvent | null>(null);

  useEffect(() => {
    let cleanupBackup = () => {};
    void (async () => {
      await restoreFromDesktopBackupIfNeeded();
      void ensureSeedPacksLoaded();
      const [list, pid] = await Promise.all([loadProfiles(), getActiveProfileId()]);
      const resolvedId = list.some((p) => p.id === pid) ? pid : list[0].id;
      setProfiles(list);
      setActiveProfileIdState(resolvedId);
      const prog = await loadProfileProgress(resolvedId);
      setProfileProgress(prog);
      cleanupBackup = initDesktopBackupSync();
    })();
    return () => {
      cleanupBackup();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.desktop?.isDesktop) return;
    return window.desktop.updater.onUpdateEvent((evt) => {
      setDesktopUpdate(evt);
    });
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    maybePrefetchFreshPack(settings);
  }, [isOnline, settings]);

  useEffect(() => {
    if (!activeProfileId) return;
    void loadProfileProgress(activeProfileId).then(setProfileProgress);
  }, [activeProfileId, activeScene]);

  useEffect(() => {
    const targetHash = activeScene === 'hub' ? '#/' : `#/${activeScene}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, [activeScene]);

  // Automatic hardware fingerprint change check — runs strictly from the Hub (never mid-game)
  useEffect(() => {
    if (activeScene === 'hub' && gfx.initialized) {
      void graphicsModeService.checkFingerprintChangeOnHub();
    }
  }, [activeScene, gfx.initialized]);

  useEffect(() => {
    const onHashChange = () => {
      const next = readSceneFromHash();
      setActiveScene((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const checkViewport = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const narrow = window.innerWidth < 768;
      setIsTouchOnlyPhone(coarse && narrow);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (appearanceOpen) setAppearanceOpen(false);
        else if (installHelpOpen) setInstallHelpOpen(false);
        else if (profilesOpen) setProfilesOpen(false);
        else if (activeScene !== 'hub') setActiveScene('hub');
        return;
      }

      if (!isInput && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeScene, appearanceOpen, shortcutsOpen, installHelpOpen, profilesOpen]);

  const handleInstallClick = async () => {
    if (canNativeInstall) {
      const accepted = await install();
      if (!accepted) setInstallHelpOpen(true);
    } else {
      setInstallHelpOpen(true);
    }
  };

  if (isTouchOnlyPhone && !touchDismissed) {
    return <TouchDeviceGate onDismiss={() => setTouchDismissed(true)} />;
  }

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const lastSession = profileProgress?.sessions[0];
  const compactTelemetry: TypingTelemetrySnapshot = {
    netWpm: lastSession?.netWpm ?? 0,
    grossWpm: lastSession?.grossWpm ?? 0,
    rollingWpm: lastSession?.netWpm ?? 0,
    cpm: (lastSession?.netWpm ?? 0) * 5,
    accuracy: lastSession?.accuracy ?? 100,
    consistency: lastSession?.consistency ?? 100,
    errors: lastSession?.errors ?? 0,
    uncorrectedErrors: 0,
    typedChars: 0,
    totalChars: 0,
    elapsedMs: 0,
    remainingMs: null,
    combo: 0,
    multiplier: 1,
    wpmHistory: [],
    capsLock: false,
    strictBlocked: false,
    started: false,
    finished: false,
    paused: false,
    ghostProgress: 0,
    userProgress: 0,
    nextChar: null,
  };

  const hasFullHud =
    activeScene === 'speed-test' ||
    activeScene === 'classroom' ||
    activeScene === 'skill-lab' ||
    activeScene === 'free-practice' ||
    activeScene === 'daily-challenge' ||
    activeScene === 'arcade';

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-xs focus:font-semibold"
        style={{
          backgroundColor: 'var(--tv-accent)',
          color: 'var(--tv-accent-fg)',
        }}
      >
        Skip to main content
      </a>

      <div className="no-print">
        <Header
          activeScene={activeScene}
          onNavigate={setActiveScene}
          isOnline={isOnline}
          onOpenAppearance={() => setAppearanceOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          isInstalled={isInstalled}
          onInstallClick={handleInstallClick}
          activeProfile={activeProfile}
          onOpenProfiles={() => setProfilesOpen(true)}
        />
      </div>

      {!hasFullHud && (
        <div className="no-print mx-auto w-full max-w-[1360px] px-4 pt-4 sm:px-6">
          <WpmHud
            telemetry={compactTelemetry}
            personalBestWpm={profileProgress?.bestWpm ?? 0}
            targetWpm={profileProgress?.targetWpm ?? 60}
            compact
          />
        </div>
      )}

      <div id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <div key={activeScene} className="tv-scene-enter">
          <Suspense fallback={<SceneLoaderFallback />}>
            {activeScene === 'hub' ? (
              <HubScene
                onNavigate={setActiveScene}
                onOpenAppearance={() => setAppearanceOpen(true)}
                onOpenProfiles={() => setProfilesOpen(true)}
                activeProfile={activeProfile}
                profileProgress={profileProgress}
                isOnline={isOnline}
              />
            ) : activeScene === 'classroom' ? (
              <ClassroomScene
                key={activeProfileId}
                activeProfileId={activeProfileId}
                onBack={() => setActiveScene('hub')}
              />
            ) : activeScene === 'speed-test' ? (
              <SpeedTestScene
                key={activeProfileId}
                onBack={() => setActiveScene('hub')}
              />
            ) : activeScene === 'free-practice' ? (
              <FreePracticeScene
                key={activeProfileId}
                activeProfileId={activeProfileId}
                onBack={() => setActiveScene('hub')}
              />
            ) : activeScene === 'daily-challenge' ? (
              <DailyChallengeScene
                key={activeProfileId}
                activeProfileId={activeProfileId}
                onBack={() => setActiveScene('hub')}
              />
            ) : activeScene === 'skill-lab' ? (
              <SkillLabScene
                key={activeProfileId}
                activeProfileId={activeProfileId}
                onBack={() => setActiveScene('hub')}
              />
            ) : activeScene === 'arcade' ? (
              <ArcadeScene
                key={activeProfileId}
                activeProfileId={activeProfileId}
                onBack={() => setActiveScene('hub')}
              />
            ) : activeScene === 'dashboard' ? (
              <DashboardScene
                key={activeProfileId}
                activeProfileId={activeProfileId}
                onBack={() => setActiveScene('hub')}
              />
            ) : (
              <WordBankExplorer onBack={() => setActiveScene('hub')} />
            )}
          </Suspense>
        </div>
      </div>

      <AppearanceDrawer
        open={appearanceOpen}
        isOnline={isOnline}
        onClose={() => setAppearanceOpen(false)}
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <InstallHelpModal
        open={installHelpOpen}
        isIOS={isIOS}
        onClose={() => setInstallHelpOpen(false)}
      />
      <ProfileManagerModal
        open={profilesOpen}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onClose={() => setProfilesOpen(false)}
        onProfileChanged={(nextId, updatedList) => {
          setProfiles(updatedList);
          setActiveProfileIdState(nextId);
        }}
      />
      <ToastHost
        needRefresh={needRefresh}
        onReload={reloadApp}
        onDismissRefresh={dismissUpdate}
        desktopUpdate={desktopUpdate}
        onDismissDesktopUpdate={() => setDesktopUpdate(null)}
      />
      <FirstRunGraphicsDialog />
      <SpeedTestOverlay />
    </div>
  );
}

export default function App() {
  return (
    <AppearanceProvider>
      <TypeVerseShell />
    </AppearanceProvider>
  );
}
