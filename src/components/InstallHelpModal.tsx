import React from 'react';
import {MonitorDown, X} from 'lucide-react';

interface InstallHelpModalProps {
  open: boolean;
  isIOS: boolean;
  onClose: () => void;
}

export const InstallHelpModal: React.FC<InstallHelpModalProps> = ({open, isIOS, onClose}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-title"
      onClick={onClose}
    >
      <div
        className="tv-surface w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{borderColor: 'var(--tv-border)'}}>
          <div className="flex items-center gap-2.5">
            <MonitorDown className="w-5 h-5" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
            <h2 id="install-title" className="font-display text-lg font-bold">
              Install TypeVerse Offline
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5"
            style={{color: 'var(--tv-text-muted)'}}
            aria-label="Close install instructions"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <ol className="space-y-2.5 text-sm leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
            <li>1. Tap the Share icon in the Safari toolbar.</li>
            <li>2. Scroll down and select Add to Home Screen.</li>
            <li>3. Launch TypeVerse full-screen anytime, even without internet access.</li>
          </ol>
        ) : (
          <div className="space-y-3 text-sm leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
            <p>
              Install TypeVerse as a standalone desktop app for instant launch and full offline access:
            </p>
            <ol className="space-y-2">
              <li>
                <strong style={{color: 'var(--tv-text)'}}>Chrome:</strong> Click the install icon on the right side of the address bar, or open the menu and select Save and share then Install TypeVerse.
              </li>
              <li>
                <strong style={{color: 'var(--tv-text)'}}>Edge:</strong> Click the Apps icon in the address bar, or open Settings and more then Apps then Install this site as an app.
              </li>
            </ol>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--tv-accent)',
              color: 'var(--tv-accent-fg)',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
