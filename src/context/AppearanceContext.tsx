import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {soundEngine} from '@/src/audio/soundEngine';
import {loadSettings, saveSettings} from '@/src/db/storage';
import {
  DEFAULT_SETTINGS,
  type AppearanceSettings,
  type FontChoice,
  type ThemeId,
} from '@/src/types/app';
import {tCopy, type CopyKey} from '@/src/utils/copy';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  isDark: boolean;
  previewBg: string;
  previewSurface: string;
  previewAccent: string;
  previewText: string;
}

export const THEME_OPTIONS: ThemeMeta[] = [
  {
    id: 'midnight-neon',
    name: 'Midnight Neon',
    isDark: true,
    previewBg: '#080B14',
    previewSurface: '#0F1629',
    previewAccent: '#22D3EE',
    previewText: '#F1F5F9',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    isDark: true,
    previewBg: '#061214',
    previewSurface: '#0C1F23',
    previewAccent: '#2DD4BF',
    previewText: '#ECFDF5',
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    isDark: false,
    previewBg: '#FFFBF5',
    previewSurface: '#FFFFFF',
    previewAccent: '#C2410C',
    previewText: '#1F1610',
  },
  {
    id: 'classroom-light',
    name: 'Classroom Light',
    isDark: false,
    previewBg: '#F6F8FB',
    previewSurface: '#FFFFFF',
    previewAccent: '#0284C7',
    previewText: '#0F172A',
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    isDark: true,
    previewBg: '#000000',
    previewSurface: '#171717',
    previewAccent: '#FFD400',
    previewText: '#FFFFFF',
  },
];

const FONT_STACK_MAP: Record<FontChoice, string> = {
  'jetbrains-mono': '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  'ibm-plex-mono': '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace',
  'system-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

interface AppearanceContextValue {
  settings: AppearanceSettings;
  isLoaded: boolean;
  updateSetting: <K extends keyof AppearanceSettings>(
    key: K,
    value: AppearanceSettings[K],
  ) => void;
  resetSettings: () => void;
  copy: (key: CopyKey) => string;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function applyDocumentAppearance(settings: AppearanceSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const meta = THEME_OPTIONS.find((t) => t.id === settings.theme) ?? THEME_OPTIONS[0];

  root.setAttribute('data-theme', settings.theme);
  root.setAttribute('data-layout', settings.layout);
  root.setAttribute('data-reduced-motion', String(settings.reducedMotion));
  root.style.setProperty('--tv-font-mono', FONT_STACK_MAP[settings.fontChoice]);

  if (meta.isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const themeMetaTag = document.querySelector('meta[name="theme-color"]');
  if (themeMetaTag) {
    themeMetaTag.setAttribute('content', meta.previewBg);
  }
}

export const AppearanceProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadSettings().then((loaded) => {
      if (!active) return;
      setSettings(loaded);
      applyDocumentAppearance(loaded);
      soundEngine.setVolume(loaded.soundVolume);
      setIsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyDocumentAppearance(settings);
    soundEngine.setVolume(settings.soundVolume);
  }, [settings]);

  const updateSetting = useCallback(
    <K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
      setSettings((prev) => {
        const next = {...prev, [key]: value};
        void saveSettings(next);
        return next;
      });
    },
    [],
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    void saveSettings(DEFAULT_SETTINGS);
  }, []);

  const copy = useCallback(
    (key: CopyKey) => tCopy(key, settings.spelling),
    [settings.spelling],
  );

  const value = useMemo(
    () => ({settings, isLoaded, updateSetting, resetSettings, copy}),
    [settings, isLoaded, updateSetting, resetSettings, copy],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useAppearance must be used inside AppearanceProvider');
  }
  return ctx;
}
