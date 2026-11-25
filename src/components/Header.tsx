import React from 'react';
import {
  Download,
  HelpCircle,
  Palette,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {renderProfileAvatar} from '@/src/components/ProfileManagerModal';
import {BrandLogoMark} from '@/src/components/SceneArtwork';
import {useAppearance} from '@/src/context/AppearanceContext';
import type {SceneId, UserProfile} from '@/src/types/app';
import {useScreenInfo} from '@/src/utils/screenInfo';

interface HeaderProps {
  activeScene: SceneId;
  onNavigate: (scene: SceneId) => void;
  isOnline: boolean;
  onOpenAppearance: () => void;
  onOpenShortcuts: () => void;
  isInstalled: boolean;
  onInstallClick: () => void;
  activeProfile: UserProfile | null;
  onOpenProfiles: () => void;
}

const NAV_ITEMS: Array<{id: SceneId; label: string}> = [
  {id: 'hub', label: 'Hub'},
  {id: 'classroom', label: 'Classroom'},
  {id: 'speed-test', label: 'Speed Test'},
  {id: 'free-practice', label: 'Practice'},
  {id: 'arcade', label: 'Arcade'},
  {id: 'dashboard', label: 'Progress'},
];

export const Header: React.FC<HeaderProps> = ({
  activeScene,
  onNavigate,
  isOnline,
  onOpenAppearance,
  onOpenShortcuts,
  isInstalled,
  onInstallClick,
  activeProfile,
  onOpenProfiles,
}) => {
  const {settings} = useAppearance();
  const screen = useScreenInfo();
  const isFocusLayout =
    (settings.layout === 'focus' || screen.layoutProfile === 'focus') &&
    activeScene !== 'hub' &&
    activeScene !== 'word-bank';
  const isCompact = screen.layoutProfile === 'compact' || screen.height < 680;
  const showInlineNav = !isFocusLayout && screen.width >= 900;
  const showStatusText = screen.width >= 1060;
  const showInstallText = screen.width >= 760;
  const showProfileName = screen.width >= 600;

  const handleNav = (scene: SceneId) => {
    soundEngine.playUiTap();
    onNavigate(scene);
  };

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{
        backgroundColor: 'var(--tv-glass)',
        borderColor: 'var(--tv-border)',
      }}
    >
      <div
        className={`tv-fluid-container flex items-center justify-between gap-2 ${
          isCompact ? 'py-2' : 'py-2.5'
        }`}
      >
        <button
          type="button"
          onClick={() => handleNav('hub')}
          className="flex items-center gap-2 text-left whitespace-nowrap shrink-0 rounded-lg py-0.5 pr-1 transition-opacity hover:opacity-90"
          aria-label="TypeVerse Home"
        >
          <BrandLogoMark className="w-7 h-7 shrink-0" />
          <span
            className="font-display font-bold tracking-tight"
            style={{fontSize: 'var(--tv-text-lg)'}}
          >
            TypeVerse
          </span>
        </button>

        {showInlineNav && (
          <nav aria-label="Primary navigation" className="flex items-center gap-0.5 min-w-0">
            {NAV_ITEMS.map((item) => {
              const active = activeScene === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleNav(item.id)}
                  className="relative px-2.5 py-1.5 font-medium whitespace-nowrap shrink-0 rounded-lg transition-colors"
                  style={{
                    fontSize: 'var(--tv-text-xs)',
                    color: active ? 'var(--tv-accent)' : 'var(--tv-text-muted)',
                    backgroundColor: active ? 'var(--tv-surface-elevated)' : 'transparent',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <div
            className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
            style={{
              borderColor: 'var(--tv-border)',
              backgroundColor: 'var(--tv-surface)',
              color: isOnline ? 'var(--tv-success)' : 'var(--tv-warning)',
            }}
            role="status"
            aria-live="polite"
            title={
              isOnline
                ? 'Online: fresh AI practice packs are available when enabled'
                : 'Offline: running from locally cached bundled and saved words'
            }
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            {showStatusText && (
              <span>{isOnline ? 'Fresh words on' : 'Using saved words'}</span>
            )}
          </div>

          {activeProfile && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                onOpenProfiles();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
              style={{
                borderColor: 'var(--tv-border)',
                backgroundColor: 'var(--tv-surface)',
                color: 'var(--tv-text)',
              }}
              aria-label={`Switch profile (${activeProfile.name})`}
            >
              <span style={{color: activeProfile.colour}}>
                {renderProfileAvatar(activeProfile.avatar, 'w-3.5 h-3.5')}
              </span>
              {showProfileName && (
                <span className="max-w-[90px] truncate">{activeProfile.name}</span>
              )}
            </button>
          )}

          {!isInstalled && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                onInstallClick();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors hover:opacity-90"
              style={{
                borderColor: 'var(--tv-border)',
                backgroundColor: 'var(--tv-surface-elevated)',
                color: 'var(--tv-text)',
              }}
              aria-label="Install app"
            >
              <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {showInstallText && <span>Install app</span>}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playUiTap();
              onOpenShortcuts();
            }}
            className="inline-flex items-center justify-center rounded-lg border p-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
            style={{
              borderColor: 'var(--tv-border)',
              backgroundColor: 'var(--tv-surface)',
              color: 'var(--tv-text-muted)',
            }}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playUiTap();
              onOpenAppearance();
            }}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'var(--tv-accent)',
              color: 'var(--tv-accent-fg)',
            }}
          >
            <Palette className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Appearance</span>
          </button>
        </div>
      </div>

      {!isFocusLayout && !showInlineNav && (
        <nav
          aria-label="Compact navigation"
          className="flex items-center gap-1 overflow-x-auto border-t px-3 py-1.5"
          style={{borderColor: 'var(--tv-border)'}}
        >
          {NAV_ITEMS.map((item) => {
            const active = activeScene === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => handleNav(item.id)}
                className="px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 rounded-lg transition-colors"
                style={{
                  color: active ? 'var(--tv-accent)' : 'var(--tv-text-muted)',
                  backgroundColor: active ? 'var(--tv-surface-elevated)' : 'transparent',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
};
