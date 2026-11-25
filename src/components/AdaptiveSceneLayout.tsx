import React, {useEffect} from 'react';
import {X} from 'lucide-react';
import {useScreenInfo} from '@/src/utils/screenInfo';

interface AdaptiveSceneLayoutProps {
  topBar?: React.ReactNode;
  hud?: React.ReactNode;
  children: React.ReactNode;
  belowMain?: React.ReactNode;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  playLocked?: boolean;
  maxCenterWidth?: string;
  drawerOpen?: boolean;
  drawerTitle?: string;
  onCloseDrawer?: () => void;
  drawerContent?: React.ReactNode;
}

export const AdaptiveSceneLayout: React.FC<AdaptiveSceneLayoutProps> = ({
  topBar,
  hud,
  children,
  belowMain,
  leftPanel,
  rightPanel,
  playLocked = false,
  maxCenterWidth,
  drawerOpen = false,
  drawerTitle = 'Panel',
  onCloseDrawer,
  drawerContent,
}) => {
  const screen = useScreenInfo();
  const isCompact = screen.layoutProfile === 'compact';
  const isShort = screen.height < 760;
  const isPortrait = screen.layoutProfile === 'portrait';
  const isSuperUltrawide = screen.layoutProfile === 'super-ultrawide';
  const isWideWithPanels =
    screen.showSidePanels && (Boolean(leftPanel) || Boolean(rightPanel));
  const lockViewport = playLocked && screen.height >= 540;

  useEffect(() => {
    if (!drawerOpen || !onCloseDrawer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseDrawer();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [drawerOpen, onCloseDrawer]);

  const gapClass = isCompact || isShort ? 'gap-1.5' : 'gap-4';
  const spaceYClass = isCompact || isShort ? 'space-y-2' : 'space-y-4';
  const padClass = isCompact ? 'px-3 py-1.5' : isShort ? 'px-4 py-1.5' : 'px-4 sm:px-6 py-4';

  return (
    <div
      className={`relative w-full min-w-0 ${
        lockViewport ? 'h-full min-h-0 flex flex-col overflow-hidden' : 'min-h-full'
      }`}
    >
      {/* Full-bleed subtle ambient gradient bands extending across wide/ultrawide monitors */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(60% 45% at 15% 15%, var(--tv-glow), transparent 70%), radial-gradient(50% 45% at 85% 80%, var(--tv-glow), transparent 70%)',
        }}
      />

      <main
        className={`relative z-10 w-full min-w-0 mx-auto ${padClass} ${
          lockViewport
            ? `flex-1 min-h-0 flex flex-col ${gapClass} overflow-hidden`
            : spaceYClass
        }`}
        style={{
          maxWidth: isWideWithPanels ? 'min(100%, 160rem)' : 'min(100%, 96rem)',
        }}
      >
        {topBar && (
          <div className="shrink-0 w-full min-w-0 mx-auto" style={{maxWidth: isWideWithPanels ? '100%' : 'min(100%, 82rem)'}}>
            {topBar}
          </div>
        )}

        {isWideWithPanels ? (
          <div
            className={`w-full min-w-0 grid items-start ${
              isSuperUltrawide ? 'gap-6' : 'gap-5'
            } ${lockViewport ? 'flex-1 min-h-0 items-stretch overflow-hidden' : ''}`}
            style={{
              gridTemplateColumns:
                leftPanel && rightPanel
                  ? isSuperUltrawide
                    ? 'minmax(18rem, 25rem) minmax(0, 1fr) minmax(18rem, 25rem)'
                    : 'minmax(15.5rem, 21rem) minmax(0, 1fr) minmax(15.5rem, 21rem)'
                  : leftPanel
                    ? 'minmax(16rem, 22rem) minmax(0, 1fr)'
                    : 'minmax(0, 1fr) minmax(16rem, 22rem)',
            }}
          >
            {leftPanel && (
              <aside
                aria-label="Session context panel"
                className={`min-w-0 ${spaceYClass} ${
                  lockViewport ? 'h-full min-h-0 overflow-y-auto pr-1' : ''
                }`}
              >
                {leftPanel}
              </aside>
            )}

            <div
              className={`min-w-0 w-full mx-auto ${
                lockViewport
                  ? `h-full min-h-0 flex flex-col ${belowMain ? 'justify-between overflow-y-auto' : 'justify-center overflow-hidden'} ${gapClass}`
                  : spaceYClass
              }`}
              style={{
                maxWidth: maxCenterWidth ?? 'min(100%, var(--tv-typing-max-ch))',
              }}
            >
              {hud && <div className="shrink-0 w-full min-w-0">{hud}</div>}
              <div className={lockViewport ? (belowMain ? 'shrink-0 w-full' : 'min-h-0 w-full') : 'w-full'}>{children}</div>
              {belowMain && (
                <div className={lockViewport ? 'shrink-0 w-full min-w-0' : 'w-full min-w-0'}>
                  {belowMain}
                </div>
              )}
            </div>

            {rightPanel && (
              <aside
                aria-label="Live telemetry panel"
                className={`min-w-0 ${spaceYClass} ${
                  lockViewport ? 'h-full min-h-0 overflow-y-auto pl-1' : ''
                }`}
              >
                {rightPanel}
              </aside>
            )}
          </div>
        ) : (
          <div
            className={`w-full min-w-0 mx-auto ${
              lockViewport
                ? `flex-1 min-h-0 flex flex-col ${belowMain ? 'justify-between overflow-y-auto' : 'justify-center overflow-hidden'} ${gapClass}`
                : spaceYClass
            }`}
            style={{
              maxWidth: maxCenterWidth ?? 'min(100%, var(--tv-typing-max-ch))',
            }}
          >
            {isPortrait ? (
              <>
                <div className="shrink-0 w-full min-w-0">{children}</div>
                {hud && <div className="shrink-0 w-full min-w-0">{hud}</div>}
                {belowMain && <div className="shrink-0 w-full min-w-0">{belowMain}</div>}
              </>
            ) : (
              <>
                {hud && <div className="shrink-0 w-full min-w-0">{hud}</div>}
                <div className={lockViewport ? (belowMain ? 'shrink-0 w-full' : 'min-h-0 w-full') : 'w-full'}>{children}</div>
                {belowMain && (
                  <div className={lockViewport ? 'shrink-0 w-full min-w-0' : 'w-full min-w-0'}>
                    {belowMain}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Compact / Standard Slide-Out Drawer */}
      {drawerOpen && drawerContent && onCloseDrawer && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={drawerTitle}
          onClick={onCloseDrawer}
        >
          <aside
            className="tv-surface h-full w-[min(100%,26rem)] overflow-y-auto p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-3 pb-3 border-b"
              style={{borderColor: 'var(--tv-border)'}}
            >
              <h2 className="font-display text-base font-bold truncate">{drawerTitle}</h2>
              <button
                type="button"
                onClick={onCloseDrawer}
                className="rounded-lg p-1.5"
                style={{color: 'var(--tv-text-muted)'}}
                aria-label={`Close ${drawerTitle}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">{drawerContent}</div>
          </aside>
        </div>
      )}
    </div>
  );
};
