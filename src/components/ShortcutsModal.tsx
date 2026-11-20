import React from 'react';
import {X} from 'lucide-react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {keys: 'Esc', action: 'Pause active session or return to Hub'},
  {keys: 'Tab then Enter', action: 'Quickly restart the current drill or test'},
  {keys: 'F11', action: 'Toggle browser fullscreen mode'},
  {keys: '?', action: 'Open or close this keyboard shortcuts guide'},
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({open, onClose}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={onClose}
    >
      <div
        className="tv-surface w-full max-w-md rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b" style={{borderColor: 'var(--tv-border)'}}>
          <h2 id="shortcuts-title" className="font-display text-lg font-bold">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:opacity-80"
            style={{color: 'var(--tv-text-muted)'}}
            aria-label="Close shortcuts"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {SHORTCUTS.map((item) => (
            <li
              key={item.keys}
              className="flex items-center justify-between gap-4 py-1.5 text-sm"
            >
              <span style={{color: 'var(--tv-text-muted)'}}>{item.action}</span>
              <kbd
                className="font-typing rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0"
                style={{
                  borderColor: 'var(--tv-border)',
                  backgroundColor: 'var(--tv-surface-elevated)',
                  color: 'var(--tv-accent)',
                }}
              >
                {item.keys}
              </kbd>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--tv-accent)',
              color: 'var(--tv-accent-fg)',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
