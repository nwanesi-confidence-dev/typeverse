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
import type {LucideIcon} from 'lucide-react';
import type {ProfileProgress, SceneId, UserProfile} from '@/src/types/app';

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

  const isCompact = settings.layout === 'compact';

  const handleOpenScene = (scene: SceneId) => {
    soundEngine.playUiTap();
    onNavigate(scene);
  };

  return (
    <main className={`mx-auto max-w-[1360px] px-4 sm:px-6 ${isCompact ? 'py-5 space-y-6' : 'py-8 space-y-10'}`}>
      {/* Hero Banner */}
      <section className="tv-glass relative overflow-hidden rounded-2xl p-7 sm:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(640px circle at 88% 20%, var(--tv-glow), transparent 65%)',
          }}
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-medium" style={{color: 'var(--tv-accent)'}}>
              Offline-First Touch-Typing Studio · {isOnline ? 'Online Ready' : 'Offline Ready'}
            </div>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-balance leading-[1.12]">
              Master touch typing from home row to 80+ WPM.
            </h1>

            <p className="max-w-2xl text-base leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
              Zero-latency typing telemetry, structured lessons, and rhythm-driven arcade challenges—built to launch instantaneously and run anywhere, online or offline.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleOpenScene('speed-test')}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
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
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors"
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
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors"
                  style={{
                    borderColor: 'var(--tv-border)',
                    backgroundColor: 'var(--tv-surface)',
                    color: 'var(--tv-text)',
                  }}
                >
                  <span style={{color: activeProfile.colour}}>
                    {renderProfileAvatar(activeProfile.avatar, 'w-4 h-4')}
                  </span>
                  <span>Profile: {activeProfile.name}</span>
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            <div
              className="rounded-xl border p-4 space-y-1"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                Bundled Words
              </div>
              <div className="font-display text-2xl font-bold tabular-nums">
                {summary ? summary.totalWords.toLocaleString() : '3,100+'}
              </div>
              <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                5 difficulty tiers
              </div>
            </div>

            <div
              className="rounded-xl border p-4 space-y-1"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                Sentences & Prose
              </div>
              <div className="font-display text-2xl font-bold tabular-nums">
                {summary ? `${summary.totalSentences}+` : '320+'}
              </div>
              <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                {summary ? `${summary.totalParagraphs} paragraphs` : '64 paragraphs'}
              </div>
            </div>

            <div
              className="rounded-xl border p-4 space-y-1"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                Active Theme
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiTap();
                  onOpenAppearance();
                }}
                className="font-display text-lg font-bold text-left hover:underline"
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
              <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                {settings.spelling === 'british' ? 'British English' : 'American English'}
              </div>
            </div>

            <div
              className="rounded-xl border p-4 space-y-1"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                Goal & Streak
              </div>
              <div className="font-display text-2xl font-bold tabular-nums flex items-center gap-1.5">
                <Flame className="w-5 h-5" style={{color: 'var(--tv-warning)'}} aria-hidden="true" />
                <span>{profileProgress?.targetWpm ?? 60} WPM</span>
              </div>
              <div className="text-xs tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                {profileProgress?.dailyGoalMinutes ?? 15} min daily · {profileProgress?.streakDays ?? 0}d streak
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mode Hub Grid */}
      <section aria-labelledby="modes-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="modes-heading" className="font-display text-xl font-bold tracking-tight">
            Training & Arcade Modes
          </h2>
          <span className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
            Select any mode or press ? for shortcuts
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {modeCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleOpenScene(card.id)}
                className="tv-surface tv-card-hover group rounded-2xl p-5 text-left flex flex-col justify-between gap-4"
              >
                <div className="space-y-3 w-full">
                  <div className="rounded-xl overflow-hidden border" style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-bg)'}}>
                    <SceneIllustration scene={card.id} />
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
                      {card.meta}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-lg font-bold flex items-center gap-2">
                        <Icon className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
                        <span>{card.title}</span>
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
  );
};
