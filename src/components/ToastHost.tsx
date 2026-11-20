import React, {useEffect, useState} from 'react';
import {Award, Download, RefreshCw, X} from 'lucide-react';
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
  const [badgeQueue, setBadgeQueue] = useState<BadgeDefinition[]>([]);

  useEffect(() => {
    return subscribeBadgeToasts((badge) => {
      setBadgeQueue((prev) => [...prev, badge]);
      window.setTimeout(() => {
        setBadgeQueue((prev) => prev.filter((b) => b.id !== badge.id));
      }, 4500);
    });
  }, []);

  if (!needRefresh && !desktopUpdate && badgeQueue.length === 0) return null;

  return (
    <div className="no-print fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5">
      {badgeQueue.map((badge) => (
        <div
          key={badge.id}
          className="flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl max-w-sm"
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
          className="flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl"
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
              <span className="text-sm font-medium whitespace-nowrap">
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
              <span className="text-sm font-medium whitespace-nowrap">
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
          className="flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl"
          style={{
            backgroundColor: 'var(--tv-surface-elevated)',
            borderColor: 'var(--tv-accent)',
            color: 'var(--tv-text)',
          }}
          role="status"
          aria-live="polite"
        >
          <RefreshCw className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
          <span className="text-sm font-medium whitespace-nowrap">Update available — reload</span>
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
