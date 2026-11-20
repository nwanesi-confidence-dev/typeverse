import React from 'react';
import type {SceneId} from '@/src/types/app';

export const BrandLogoMark: React.FC<{className?: string}> = ({className = 'w-7 h-7'}) => (
  <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
    <rect
      x="2"
      y="5"
      width="32"
      height="26"
      rx="6"
      fill="var(--tv-surface-elevated)"
      stroke="var(--tv-border)"
      strokeWidth="1.5"
    />
    <rect x="6.5" y="10" width="5" height="4.5" rx="1.2" fill="var(--tv-text-muted)" opacity="0.45" />
    <rect x="13" y="10" width="5" height="4.5" rx="1.2" fill="var(--tv-text-muted)" opacity="0.45" />
    <rect x="19.5" y="10" width="5" height="4.5" rx="1.2" fill="var(--tv-accent)" />
    <rect x="26" y="10" width="3.5" height="4.5" rx="1.2" fill="var(--tv-text-muted)" opacity="0.45" />
    <rect x="8" y="16.5" width="5" height="4.5" rx="1.2" fill="var(--tv-text-muted)" opacity="0.45" />
    <rect x="14.5" y="16.5" width="7" height="4.5" rx="1.2" fill="var(--tv-accent-secondary)" />
    <rect x="23" y="16.5" width="5" height="4.5" rx="1.2" fill="var(--tv-text-muted)" opacity="0.45" />
    <rect x="10" y="23" width="16" height="3.5" rx="1.2" fill="var(--tv-accent)" opacity="0.85" />
  </svg>
);

export const SceneIllustration: React.FC<{scene: SceneId}> = ({scene}) => {
  switch (scene) {
    case 'classroom':
      return (
        <svg viewBox="0 0 220 96" fill="none" className="w-full h-24" aria-hidden="true">
          <rect
            x="12"
            y="10"
            width="196"
            height="76"
            rx="10"
            fill="var(--tv-surface-elevated)"
            stroke="var(--tv-border)"
          />
          <line x1="28" y1="30" x2="112" y2="30" stroke="var(--tv-accent)" strokeWidth="3" strokeLinecap="round" />
          <line x1="28" y1="44" x2="148" y2="44" stroke="var(--tv-text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <line x1="28" y1="56" x2="96" y2="56" stroke="var(--tv-text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
          <g opacity="0.9">
            <rect x="134" y="54" width="16" height="16" rx="4" fill="var(--tv-accent)" fillOpacity="0.22" stroke="var(--tv-accent)" />
            <rect x="154" y="54" width="16" height="16" rx="4" fill="var(--tv-accent-secondary)" fillOpacity="0.22" stroke="var(--tv-accent-secondary)" />
            <rect x="174" y="54" width="16" height="16" rx="4" fill="var(--tv-accent)" fillOpacity="0.22" stroke="var(--tv-accent)" />
          </g>
        </svg>
      );
    case 'speed-test':
      return (
        <svg viewBox="0 0 220 96" fill="none" className="w-full h-24" aria-hidden="true">
          <path
            d="M 56 74 A 54 54 0 0 1 164 74"
            stroke="var(--tv-border)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 56 74 A 54 54 0 0 1 144 31"
            stroke="var(--tv-accent)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <line x1="110" y1="74" x2="142" y2="38" stroke="var(--tv-accent-secondary)" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="110" cy="74" r="6" fill="var(--tv-text)" />
          <rect x="16" y="18" width="38" height="10" rx="5" fill="var(--tv-accent)" fillOpacity="0.2" />
          <rect x="166" y="18" width="38" height="10" rx="5" fill="var(--tv-accent-secondary)" fillOpacity="0.2" />
        </svg>
      );
    case 'free-practice':
      return (
        <svg viewBox="0 0 220 96" fill="none" className="w-full h-24" aria-hidden="true">
          <rect x="16" y="14" width="188" height="68" rx="10" fill="var(--tv-surface-elevated)" stroke="var(--tv-border)" />
          <rect x="30" y="28" width="52" height="8" rx="4" fill="var(--tv-success)" opacity="0.8" />
          <rect x="88" y="28" width="36" height="8" rx="4" fill="var(--tv-success)" opacity="0.8" />
          <rect x="130" y="28" width="44" height="8" rx="4" fill="var(--tv-accent)" />
          <rect x="30" y="45" width="66" height="8" rx="4" fill="var(--tv-text-muted)" opacity="0.35" />
          <rect x="102" y="45" width="50" height="8" rx="4" fill="var(--tv-text-muted)" opacity="0.35" />
          <rect x="30" y="62" width="42" height="8" rx="4" fill="var(--tv-text-muted)" opacity="0.25" />
          <rect x="78" y="62" width="68" height="8" rx="4" fill="var(--tv-text-muted)" opacity="0.25" />
        </svg>
      );
    case 'skill-lab':
      return (
        <svg viewBox="0 0 220 96" fill="none" className="w-full h-24" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((col) => {
            const h = [26, 48, 36, 62, 40, 54, 30][col];
            const isPeak = col === 3 || col === 5;
            return (
              <rect
                key={col}
                x={26 + col * 25}
                y={78 - h}
                width="16"
                height={h}
                rx="4"
                fill={isPeak ? 'var(--tv-accent)' : 'var(--tv-text-muted)'}
                fillOpacity={isPeak ? 0.88 : 0.25}
              />
            );
          })}
          <path
            d="M 28 52 L 58 34 L 84 44 L 110 20 L 135 38 L 160 26 L 188 48"
            stroke="var(--tv-accent-secondary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'arcade':
      return (
        <svg viewBox="0 0 220 96" fill="none" className="w-full h-24" aria-hidden="true">
          <path d="M 16 78 L 82 24 L 138 24 L 204 78" stroke="var(--tv-border)" strokeWidth="2" />
          <line x1="110" y1="24" x2="110" y2="78" stroke="var(--tv-accent)" strokeWidth="2" strokeDasharray="6 6" />
          <polygon points="110,46 130,72 90,72" fill="var(--tv-accent)" fillOpacity="0.25" stroke="var(--tv-accent)" strokeWidth="2" />
          <circle cx="52" cy="28" r="9" fill="var(--tv-accent-secondary)" fillOpacity="0.3" stroke="var(--tv-accent-secondary)" />
          <circle cx="168" cy="34" r="12" fill="var(--tv-warning)" fillOpacity="0.25" stroke="var(--tv-warning)" />
        </svg>
      );
    case 'daily-challenge':
      return (
        <svg viewBox="0 0 220 96" fill="none" className="w-full h-24" aria-hidden="true">
          <rect x="34" y="14" width="152" height="68" rx="12" fill="var(--tv-surface-elevated)" stroke="var(--tv-border)" />
          <circle cx="74" cy="48" r="20" stroke="var(--tv-accent)" strokeWidth="4" fill="var(--tv-accent)" fillOpacity="0.12" />
          <path d="M 66 48 L 72 54 L 84 42" stroke="var(--tv-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="108" y="34" width="58" height="8" rx="4" fill="var(--tv-text)" opacity="0.8" />
          <rect x="108" y="50" width="42" height="7" rx="3.5" fill="var(--tv-text-muted)" opacity="0.4" />
        </svg>
      );
    default:
      return null;
  }
};
