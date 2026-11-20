import React from 'react';
import {Keyboard} from 'lucide-react';

interface TouchDeviceGateProps {
  onDismiss: () => void;
}

export const TouchDeviceGate: React.FC<TouchDeviceGateProps> = ({onDismiss}) => {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{backgroundColor: 'var(--tv-bg)', color: 'var(--tv-text)'}}
    >
      <div className="tv-surface max-w-md w-full rounded-2xl p-8 text-center space-y-5">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl"
          style={{backgroundColor: 'var(--tv-surface-elevated)', color: 'var(--tv-accent)'}}
        >
          <Keyboard className="w-7 h-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-balance">
            Connect a physical keyboard
          </h1>
          <p className="text-sm leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
            TypeVerse is designed for desktop browsers and tablets with hardware keyboards so you can build genuine touch-typing muscle memory.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            backgroundColor: 'var(--tv-accent)',
            color: 'var(--tv-accent-fg)',
          }}
        >
          I have a keyboard — continue
        </button>
      </div>
    </div>
  );
};
