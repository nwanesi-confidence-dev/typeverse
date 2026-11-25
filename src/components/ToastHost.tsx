import React, {useEffect, useState} from 'react';
import {AlertTriangle, Award, Download, Monitor, RefreshCw, X} from 'lucide-react';
import {graphicsModeService, useGraphicsMode} from '@/src/graphics/graphicsModeService';
import {subscribeSystemToasts, type SystemToast} from '@/src/graphics/toastBus';
import type {DesktopUpdateEvent} from '@/src/types/desktop';
import {subscribeBadgeToasts, type BadgeDefinition} from '@/src/utils/progression';

interface ToastHostProps {
  needRefresh: boolean;
  onReload: () => void;
  onDismissRefresh: () => void;
  desktopUpdate?: DesktopUpdateEvent | null;
  onDismissDesktopUpdate?: () => void;
}

export const ToastHost: React.FC<ToastHostProps> = ({
  needRefresh,
  onReload,
  onDismissRefresh,
  desktopUpdate = null,
  onDismissDesktopUpdate,
}) => {
  const gfx = useGraphicsMode();
  const [badgeQueue, setBadgeQueue] = useState<BadgeDefinition[]>([]);
  const [systemQueue, setSystemQueue] = useState<SystemToast[]>([]);

  useEffect(() => {
    return subscribeBadgeToasts((badge) => {
      setBadgeQueue((prev) => [...prev, badge]);
      window.setTimeout(() => {
        setBadgeQueue((prev) => prev.filter((b) => b.id !== badge.id));
      }, 4500);
    });
  }, []);

  useEffect(() => {
    return subscribeSystemToasts((toast) => {
      setSystemQueue((prev) => [...prev, toast]);
      window.setTimeout(() => {
        setSystemQueue((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    });
  }, []);

  if (
    !needRefresh &&
    !desktopUpdate &&
    !gfx.slow3DPromptVisible &&
    !gfx.slowRealisticPromptVisible &&
    badgeQueue.length === 0 &&
    systemQueue.length === 0
  ) {
    return null;
  }

  return (
    <div className="no-print fixed bottom-4 left-4 right-4 z-50 flex flex-col items-end gap-2.5 pointer-events-none">
      {gfx.slowRealisticPromptVisible && (
        <div
          className="pointer-events-auto rounded-xl border px-4 py-3 shadow-2xl w-fit max-w-[min(100%,24rem)] space-y-2.5"
          style={{
            backgroundColor: 'var(--tv-surface-elevated)',
            borderColor: 'var(--tv-warning)',
            color: 'var(--tv-text)',
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{color: 'var(--tv-warning)'}}
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-0.5">
              <div className="text-xs font-semibold" style={{color: 'var(--tv-warning)'}}>
                Realistic is running slowly
              </div>
              <p className="text-xs leading-snug" style={{color: 'var(--tv-text-muted)'}}>
                Realistic is running slowly. Switch to Full detail?
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void graphicsModeService.acceptSlowRealisticSwitchToFull()}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--tv-accent)',
                color: 'var(--tv-accent-fg)',
              }}
            >
              Switch to Full
            </button>
            <button
              type="button"
              onClick={() => graphicsModeService.keepRealisticForSession()}
              className="rounded-lg border px-2.5 py-1 text-xs font-medium"
              style={{
                borderColor: 'var(--tv-border)',
                backgroundColor: 'var(--tv-bg)',
                color: 'var(--tv-text)',
              }}
            >
              Keep Realistic
            </button>
            <button
              type="button"
              onClick={() => void graphicsModeService.dontAskAgainSlowRealistic()}
              className="rounded-lg px-2 py-1 text-xs font-medium"
              style={{color: 'var(--tv-text-muted)'}}
            >
              Don&apos;t ask again
            </button>
          </div>
        </div>
      )}
      {gfx.slow3DPromptVisible && (
        <div
          className="pointer-events-auto rounded-xl border px-4 py-3 shadow-2xl w-fit max-w-[min(100%,24rem)] space-y-2.5"
          style={{
            backgroundColor: 'var(--tv-surface-elevated)',
            borderColor: 'var(--tv-warning)',
            color: 'var(--tv-text)',
          }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{color: 'var(--tv-warning)'}}
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-0.5">
              <div className="text-xs font-semibold" style={{color: 'var(--tv-warning)'}}>
                3D appears slow on this computer
              </div>
              <p className="text-xs leading-snug" style={{color: 'var(--tv-text-muted)'}}>
                You chose 3D manually. Want to switch to 2D Classic for smoother visuals?
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void graphicsModeService.acceptSlow3DSwitchTo2D()}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--tv-accent)',
                color: 'var(--tv-accent-fg)',
              }}
            >
              Switch to 2D
            </button>
            <button
              type="button"
              onClick={() => graphicsModeService.keep3DForSession()}
              className="rounded-lg border px-2.5 py-1 text-xs font-medium"
              style={{
                borderColor: 'var(--tv-border)',
                backgroundColor: 'var(--tv-bg)',
                color: 'var(--tv-text)',
              }}
            >
              Keep 3D
            </button>
            <button
              type="button"
              onClick={() => void graphicsModeService.dontAskAgainSlow3D()}
              className="rounded-lg px-2 py-1 text-xs font-medium"
              style={{color: 'var(--tv-text-muted)'}}
            >
              Don&apos;t ask again
            </button>
          </div>
        </div>
      )}
      {systemQueue.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl w-fit max-w-[min(100%,24rem)]"
          style={{
            backgroundColor: 'var(--tv-surface-elevated)',
            borderColor: item.tone === 'warning' ? 'var(--tv-warning)' : 'var(--tv-accent)',
            color: 'var(--tv-text)',
          }}
          role="status"
          aria-live="polite"
        >
          {item.tone === 'warning' ? (
            <AlertTriangle className="w-5 h-5 shrink-0" style={{color: 'var(--tv-warning)'}} aria-hidden="true" />
          ) : (
            <Monitor className="w-5 h-5 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div
              className="text-xs font-semibold"
              style={{color: item.tone === 'warning' ? 'var(--tv-warning)' : 'var(--tv-accent)'}}
            >
              {item.title}
            </div>
            <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
              {item.message}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setSystemQueue((prev) => prev.filter((t) => t.id !== item.id))
            }
            className="rounded-lg p-1 shrink-0"
            style={{color: 'var(--tv-text-muted)'}}
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {badgeQueue.map((badge) => (
        <div
          key={badge.id}
          className="pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl w-fit max-w-[min(100%,24rem)]"
          style={{
            backgroundColor: 'var(--tv-surface-elevated)',
            borderColor: 'var(--tv-warning)',
            color: 'var(--tv-text)',
          }}
          role="status"
          aria-live="polite"
        >
          <Award className="w-5 h-5 shrink-0" style={{color: 'var(--tv-warning)'}} aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{color: 'var(--tv-warning)'}}>
              Badge Unlocked
            </div>
            <div className="text-sm font-bold truncate">{badge.title}</div>
            <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
              {badge.description}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setBadgeQueue((prev) => prev.filter((b) => b.id !== badge.id))
            }
            className="rounded-lg p-1 shrink-0"
            style={{color: 'var(--tv-text-muted)'}}
            aria-label="Dismiss badge notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {desktopUpdate && (
        <div
          className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl w-fit max-w-full"
          style={{
            backgroundColor: 'var(--tv-surface-elevated)',
            borderColor: 'var(--tv-accent)',
            color: 'var(--tv-text)',
          }}
          role="status"
          aria-live="polite"
        >
          {desktopUpdate.status === 'downloaded' ? (
            <>
              <RefreshCw className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
              <span className="text-sm font-medium min-w-0">
                Update ready{desktopUpdate.version ? ` (v${desktopUpdate.version})` : ''} — restart
              </span>
              <button
                type="button"
                onClick={() => window.desktop?.updater.quitAndInstall()}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: 'var(--tv-accent)',
                  color: 'var(--tv-accent-fg)',
                }}
              >
                Restart
              </button>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
              <span className="text-sm font-medium min-w-0">
                New version available{desktopUpdate.version ? ` (v${desktopUpdate.version})` : ''} — download
              </span>
              <button
                type="button"
                onClick={() => {
                  if (desktopUpdate.releaseUrl) {
                    void window.desktop?.openExternal(desktopUpdate.releaseUrl);
                  }
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: 'var(--tv-accent)',
                  color: 'var(--tv-accent-fg)',
                }}
              >
                Download
              </button>
            </>
          )}
          {onDismissDesktopUpdate && (
            <button
              type="button"
              onClick={onDismissDesktopUpdate}
              className="rounded-lg p-1"
              style={{color: 'var(--tv-text-muted)'}}
              aria-label="Dismiss desktop update notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {needRefresh && (
        <div
          className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl w-fit max-w-full"
          style={{
            backgroundColor: 'var(--tv-surface-elevated)',
            borderColor: 'var(--tv-accent)',
            color: 'var(--tv-text)',
          }}
          role="status"
          aria-live="polite"
        >
          <RefreshCw className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
          <span className="text-sm font-medium min-w-0">Update available — reload</span>
          <button
            type="button"
            onClick={onReload}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0"
            style={{
              backgroundColor: 'var(--tv-accent)',
              color: 'var(--tv-accent-fg)',
            }}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={onDismissRefresh}
            className="rounded-lg p-1"
            style={{color: 'var(--tv-text-muted)'}}
            aria-label="Dismiss update notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
