import {useCallback, useEffect, useRef, useState} from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);

  useEffect(() => {
    const isDesktopApp = typeof window !== 'undefined' && Boolean(window.desktop?.isDesktop);
    const standalone =
      isDesktopApp ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as {standalone?: boolean}).standalone === true;
    setIsInstalled(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    if (isDesktopApp) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const {outcome} = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch {
      // Ignore prompt errors
    }
    return false;
  }, [deferredPrompt]);

  return {
    canNativeInstall: deferredPrompt !== null,
    isInstalled,
    isIOS,
    install,
  };
}

export function useServiceWorkerUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // Never register a service worker inside the Electron desktop shell
    const isElectronShell =
      typeof window === 'undefined' ||
      Boolean(window.desktop?.isDesktop) ||
      window.location.protocol === 'file:' ||
      (typeof navigator !== 'undefined' &&
        navigator.userAgent.toLowerCase().includes('electron'));
    if (isElectronShell) return;
    // Register service worker ONLY in production builds and fail silently where unsupported (e.g., preview iframes)
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    const isIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    if (isIframe) {
      // Check carefully: inside preview iframes SW registration can be blocked or stale; fail silently if blocked
    }

    void import('virtual:pwa-register')
      .then(({registerSW}) => {
        if (cancelled) return;
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            if (!cancelled) setNeedRefresh(true);
          },
          onRegisterError() {
            // Fail silently where unsupported
          },
        });
        updateFnRef.current = updateSW;
      })
      .catch(() => {
        // Fail silently
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const reloadApp = useCallback(async () => {
    if (updateFnRef.current) {
      try {
        await updateFnRef.current(true);
        return;
      } catch {
        // Fall through to location reload
      }
    }
    window.location.reload();
  }, []);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  return {
    needRefresh,
    reloadApp,
    dismissUpdate,
  };
}
