import React, {useEffect, useState} from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Database,
  Flame,
  Gauge,
  Gamepad2,
  Sparkles,
  Target,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {renderProfileAvatar} from '@/src/components/ProfileManagerModal';
import {SceneIllustration} from '@/src/components/SceneArtwork';
import {useAppearance} from '@/src/context/AppearanceContext';
import {loadWordBank, type WordBankSummary} from '@/src/data/wordBank';
import {ThreeCanvasHost} from '@/src/three/ThreeCanvasHost';
import type {LucideIcon} from 'lucide-react';
import type {ProfileProgress, SceneId, UserProfile} from '@/src/types/app';
import {useScreenInfo} from '@/src/utils/screenInfo';

const loadHubOrbitScene = () => import('@/src/three/scenes/hubOrbitScene');

interface HubSceneProps {
  onNavigate: (scene: SceneId) => void;
  onOpenAppearance: () => void;
  onOpenProfiles?: () => void;
  activeProfile?: UserProfile | null;
  profileProgress?: ProfileProgress | null;
  isOnline: boolean;
}

interface ModeCard {
  id: SceneId;
  title: string;
  meta: string;
  description: string;
  icon: LucideIcon;
}

export const HubScene: React.FC<HubSceneProps> = ({
  onNavigate,
  onOpenAppearance,
  onOpenProfiles,
  activeProfile,
  profileProgress,
  isOnline,
}) => {
  const {settings, copy} = useAppearance();
  const [summary, setSummary] = useState<WordBankSummary | null>(null);

  useEffect(() => {
    const id = window.requestIdleCallback
      ? window.requestIdleCallback(() => {
          void loadWordBank().then((b) => setSummary(b.summary));
        })
      : window.setTimeout(() => {
          void loadWordBank().then((b) => setSummary(b.summary));
        }, 50);

    return () => {
      if (window.cancelIdleCallback && typeof id === 'number') {
        window.cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };
  }, []);

  const modeCards: ModeCard[] = [
    {
      id: 'classroom',
      title: 'Classroom',
      meta: '36 Lessons · 8 Stages · Finger Guide',
      description:
        'Structured touch-typing curriculum from the home row to full paragraphs with accuracy gates and star ratings.',
      icon: BookOpen,
    },
    {
      id: 'speed-test',
      title: 'Speed Test',
      meta: 'Timed & Word Runs · Printable Certificate',
      description:
        'Measure Net WPM, Gross WPM, consistency, and key latency across prose, numbers, punctuation, and code.',
      icon: Gauge,
    },
    {
      id: 'free-practice',
      title: `Free ${copy('practise')}`,
      meta: `${copy('customise')} Text · Focus Keys · 8 Themes`,
      description:
        'Choose target difficulty, focus keys, or paste any passage for unhurried flow and muscle-memory drills.',
      icon: Sparkles,
    },
    {
      id: 'skill-lab',
      title: 'Skill Lab',
      meta: 'Adaptive Drills · Key Heatmap',
      description:
        'Automatically builds targeted exercises from your slowest keys and most error-prone bigrams.',
      icon: Target,
    },
    {
      id: 'arcade',
      title: 'Arcade',
      meta: '5 Games · 3 Difficulty Levels Each',
      description:
        'Race in Turbo Racer, defend the sector in Star Defender, or build rhythm in Beat Typer, Word Rain, and Bubble Pop.',
      icon: Gamepad2,
    },
    {
      id: 'daily-challenge',
      title: 'Daily Challenge',
      meta: 'Date-Seeded · Streak Counter',
      description:
        'One fresh daily passage that works seamlessly offline and awards streak milestones on completion.',
      icon: CalendarCheck,
    },
  ];

  const screen = useScreenInfo();
  const isCompact = screen.layoutProfile === 'compact';
  const heroTwoCol = screen.width >= 980;
  const modeCols =
    screen.width < 660
      ? 1
      : screen.width < 1080
        ? 2
        : screen.layoutProfile === 'super-ultrawide' || screen.width >= 2600
          ? 6
          : 3;

  const handleOpenScene = (scene: SceneId) => {
    soundEngine.playUiTap();
    onNavigate(scene);
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const root = document.documentElement;
    if (
      root.getAttribute('data-depth') !== 'on' ||
      root.getAttribute('data-calm') === 'true'
    ) {
      return;
    }
    const el = e.currentTarget;
    if (el.dataset.tiltPending === '1') return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    el.dataset.tiltPending = '1';
    window.requestAnimationFrame(() => {
      el.dataset.tiltPending = '';
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (clientX - rect.left) / rect.width - 0.5;
      const ny = (clientY - rect.top) / rect.height - 0.5;
      const tiltX = (-ny * 6.5).toFixed(2);
      const tiltY = (nx * 7.5).toFixed(2);
      el.style.setProperty('--tv-tilt-x', `${tiltX}deg`);
      el.style.setProperty('--tv-tilt-y', `${tiltY}deg`);
    });
  };

  const handleCardPointerLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty('--tv-tilt-x', '0deg');
    e.currentTarget.style.setProperty('--tv-tilt-y', '0deg');
  };

  return (
    <div className="relative min-h-full">
      <ThreeCanvasHost
        loadScene={loadHubOrbitScene}
        sceneKey="hub-orbit"
        className="fixed inset-0 z-0 pointer-events-none opacity-80"
      />
      <main className={`relative z-10 tv-fluid-container ${isCompact ? 'py-4 space-y-5' : 'py-7 space-y-8'}`}>
      {/* Hero Banner */}
      <section className={`tv-glass tv-dash-card relative overflow-hidden rounded-2xl ${isCompact ? 'p-5' : 'p-7'}`}>
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(640px circle at 88% 20%, var(--tv-glow), transparent 65%)',
          }}
        />

        <div
          className="relative grid gap-6 items-center"
          style={{
            gridTemplateColumns: heroTwoCol
              ? 'minmax(0, 7fr) minmax(0, 5fr)'
              : 'minmax(0, 1fr)',
          }}
        >
          <div className="space-y-4 min-w-0">
            <div className="text-xs font-medium" style={{color: 'var(--tv-accent)'}}>
              Offline-First Touch-Typing Studio · {isOnline ? 'Online Ready' : 'Offline Ready'}
            </div>

            <h1
              className="font-display font-bold tracking-tight text-balance leading-[1.12]"
              style={{fontSize: 'clamp(1.75rem, calc(2.35rem * min(var(--ui-scale), 1.35)), 3.25rem)'}}
            >
              Master touch typing from home row to 80+ WPM.
            </h1>

            <p className="max-w-2xl leading-relaxed" style={{color: 'var(--tv-text-muted)', fontSize: 'var(--tv-text-base)'}}>
              Zero-latency typing telemetry, structured lessons, and rhythm-driven arcade challenges—built to launch instantaneously and run anywhere, online or offline.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleOpenScene('speed-test')}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: 'var(--tv-accent)',
                  color: 'var(--tv-accent-fg)',
                }}
              >
                <span>Open Speed Test</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => handleOpenScene('word-bank')}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
                style={{
                  borderColor: 'var(--tv-border)',
                  backgroundColor: 'var(--tv-surface)',
                  color: 'var(--tv-text)',
                }}
              >
                <Database className="w-4 h-4" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
                <span>Explore Bundled Word Bank</span>
              </button>

              {onOpenProfiles && activeProfile && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiTap();
                    onOpenProfiles();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
                  style={{
                    borderColor: 'var(--tv-border)',
                    backgroundColor: 'var(--tv-surface)',
                    color: 'var(--tv-text)',
                  }}
                >
                  <span style={{color: activeProfile.colour}}>
                    {renderProfileAvatar(activeProfile.avatar, 'w-4 h-4')}
                  </span>
                  <span className="truncate max-w-[14rem]">Profile: {activeProfile.name}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-0">
            <div
              className="tv-dash-card rounded-xl border p-4 space-y-1 min-w-0"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-xs truncate" style={{color: 'var(--tv-text-muted)'}}>
                Bundled Words
              </div>
              <div className="font-display text-2xl font-bold tabular-nums">
                {summary ? summary.totalWords.toLocaleString() : '3,100+'}
              </div>
              <div className="text-xs truncate" style={{color: 'var(--tv-text-muted)'}}>
                5 difficulty tiers
              </div>
            </div>

            <div
              className="tv-dash-card rounded-xl border p-4 space-y-1 min-w-0"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-xs truncate" style={{color: 'var(--tv-text-muted)'}}>
                Sentences & Prose
              </div>
              <div className="font-display text-2xl font-bold tabular-nums">
                {summary ? `${summary.totalSentences}+` : '320+'}
              </div>
              <div className="text-xs truncate" style={{color: 'var(--tv-text-muted)'}}>
                {summary ? `${summary.totalParagraphs} paragraphs` : '64 paragraphs'}
              </div>
            </div>

            <div
              className="tv-dash-card rounded-xl border p-4 space-y-1 min-w-0"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-xs truncate" style={{color: 'var(--tv-text-muted)'}}>
                Active Theme
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiTap();
                  onOpenAppearance();
                }}
                className="font-display text-lg font-bold text-left hover:underline truncate max-w-full block"
                style={{color: 'var(--tv-accent)'}}
              >
                {settings.theme === 'midnight-neon'
                  ? 'Midnight Neon'
                  : settings.theme === 'aurora'
                    ? 'Aurora'
                    : settings.theme === 'sunrise'
                      ? 'Sunrise'
                      : settings.theme === 'classroom-light'
                        ? 'Classroom Light'
                        : 'High Contrast'}
              </button>
              <div className="text-xs truncate" style={{color: 'var(--tv-text-muted)'}}>
                {settings.spelling === 'british' ? 'British English' : 'American English'}
              </div>
            </div>

            <div
              className="tv-dash-card rounded-xl border p-4 space-y-1 min-w-0"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-xs truncate" style={{color: 'var(--tv-text-muted)'}}>
                Goal & Streak
              </div>
              <div className="font-display text-2xl font-bold tabular-nums flex items-center gap-1.5">
                <Flame className="w-5 h-5 shrink-0" style={{color: 'var(--tv-warning)'}} aria-hidden="true" />
                <span className="truncate">{profileProgress?.targetWpm ?? 60} WPM</span>
              </div>
              <div className="text-xs tabular-nums truncate" style={{color: 'var(--tv-text-muted)'}}>
                {profileProgress?.dailyGoalMinutes ?? 15} min daily · {profileProgress?.streakDays ?? 0}d streak
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mode Hub Grid */}
      <section aria-labelledby="modes-heading" className="tv-hub-perspective space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="modes-heading" className="font-display font-bold tracking-tight" style={{fontSize: 'var(--tv-text-xl)'}}>
            Training & Arcade Modes
          </h2>
          <span className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
            Select any mode or press ? for shortcuts
          </span>
        </div>

        <div
          className="grid gap-4"
          style={{gridTemplateColumns: `repeat(${modeCols}, minmax(0, 1fr))`}}
        >
          {modeCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleOpenScene(card.id)}
                onPointerMove={handleCardPointerMove}
                onPointerLeave={handleCardPointerLeave}
                className="tv-surface tv-card-hover tv-tilt-card group rounded-2xl p-4 text-left flex flex-col justify-between gap-3 min-w-0"
              >
                <div className="space-y-3 w-full min-w-0">
                  <div className="rounded-xl overflow-hidden border" style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-bg)'}}>
                    <SceneIllustration scene={card.id} />
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <div className="text-xs font-medium truncate" style={{color: 'var(--tv-text-muted)'}}>
                      {card.meta}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-lg font-bold flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
                        <span className="truncate">{card.title}</span>
                      </h3>
                      <ArrowRight
                        className="w-4 h-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
                        style={{color: 'var(--tv-accent)'}}
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-sm leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
                      {card.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      </main>
    </div>
  );
};
