import React, {useCallback, useEffect, useState} from 'react';
import {
  ArrowLeft,
  CloudRain,
  Disc3,
  Gauge,
  Rocket,
  Sparkles,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {SessionResults} from '@/src/components/SessionResults';
import {WpmHud} from '@/src/components/WpmHud';
import {
  DIFFICULTY_META,
  INITIAL_ARCADE_TELEMETRY,
  type ArcadeDifficulty,
  type ArcadeGameId,
} from '@/src/components/arcade/arcadeTypes';
import {BeatTyperGame} from '@/src/components/arcade/BeatTyperGame';
import {BubblePopGame} from '@/src/components/arcade/BubblePopGame';
import {StarDefenderGame} from '@/src/components/arcade/StarDefenderGame';
import {TurboRacerGame} from '@/src/components/arcade/TurboRacerGame';
import {WordRainGame} from '@/src/components/arcade/WordRainGame';
import {ArcadeVisualsSelector} from '@/src/components/arcade/ArcadeVisualsControl';
import {useAppearance} from '@/src/context/AppearanceContext';
import {queryWordBank} from '@/src/data/wordBank';
import {
  getActiveProfileId,
  loadFreshPacks,
  loadProfileProgress,
  loadProfiles,
} from '@/src/db/storage';
import type {ProfileProgress} from '@/src/types/app';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';
import {
  extractFreshPackIdsFromEntryIds,
  markFreshPacksUsed,
  maybePrefetchFreshPack,
} from '@/src/utils/freshWordsClient';
import {recordSessionAndBadges} from '@/src/utils/progression';

interface ArcadeSceneProps {
  onBack: () => void;
  activeProfileId: string;
}

const ARCADE_GAMES: Array<{
  id: ArcadeGameId;
  title: string;
  tagline: string;
  description: string;
  icon: typeof Gauge;
}> = [
  {
    id: 'turbo-racer',
    title: 'Turbo Racer',
    tagline: 'Speed-Driven Highway',
    description:
      'Your car velocity scales directly with your live WPM. Surge past three rivals across neon lanes.',
    icon: Gauge,
  },
  {
    id: 'star-defender',
    title: 'Star Defender',
    tagline: 'Waves & Boss Asteroids',
    description:
      'Lock onto incoming asteroids with your laser turret and survive escalating boss waves.',
    icon: Rocket,
  },
  {
    id: 'word-rain',
    title: 'Word Rain',
    tagline: 'Serene Pond Drops',
    description:
      'Clear drifting raindrops before they ripple the water; catch golden drops for bonus points and extra lives.',
    icon: CloudRain,
  },
  {
    id: 'bubble-pop',
    title: 'Bubble Pop',
    tagline: 'Learner-Friendly Focus Rows',
    description:
      'Pop rising bubbles targeting all letters or individual keyboard rows at an approachable pace.',
    icon: Sparkles,
  },
  {
    id: 'beat-typer',
    title: 'Beat Typer',
    tagline: 'Synthesised Tempo Lanes',
    description:
      'Type notes down four rhythm lanes synced to an interactive Web Audio beat.',
    icon: Disc3,
  },
];

export const ArcadeScene: React.FC<ArcadeSceneProps> = ({
  onBack,
  activeProfileId,
}) => {
  const {settings} = useAppearance();
  const [selectedGame, setSelectedGame] = useState<ArcadeGameId | null>(null);
  const [difficulty, setDifficulty] = useState<ArcadeDifficulty>('medium');
  const [wordPool, setWordPool] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [profileName, setProfileName] = useState('Typist');
  const [telemetry, setTelemetry] = useState<TypingTelemetrySnapshot>(
    INITIAL_ARCADE_TELEMETRY,
  );
  const [results, setResults] = useState<CompletedSessionStats | null>(null);
  const [sessionNonce, setSessionNonce] = useState(1);
  const usedPackIdsRef = React.useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const pid = activeProfileId || (await getActiveProfileId());
      const [profiles, prog] = await Promise.all([
        loadProfiles(),
        loadProfileProgress(pid),
      ]);
      if (!active) return;
      const found = profiles.find((p) => p.id === pid) ?? profiles[0];
      if (found) setProfileName(found.name);
      setProgress(prog);
    })();
    return () => {
      active = false;
    };
  }, [activeProfileId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const packs = await loadFreshPacks();
      const tier = DIFFICULTY_META[difficulty].tier;
      const entries = await queryWordBank({
        kind: 'words',
        tier,
        spelling: settings.spelling,
        freshPacks: packs,
        seed: sessionNonce * 31,
        limit: 240,
      });
      if (!active) return;
      usedPackIdsRef.current = extractFreshPackIdsFromEntryIds(
        entries.map((e) => e.id),
      );
      const words = entries.map((e) => e.text).filter((w) => /^[a-z]+$/.test(w));
      setWordPool(
        words.length > 0
          ? words
          : ['type', 'fast', 'neon', 'pulse', 'laser', 'star', 'drift', 'turbo'],
      );
    })();
    return () => {
      active = false;
    };
  }, [difficulty, settings.spelling, sessionNonce]);

  const handleFinish = useCallback(
    async (completed: CompletedSessionStats) => {
      setResults(completed);
      if (usedPackIdsRef.current.length > 0) {
        void markFreshPacksUsed(usedPackIdsRef.current);
      }
      if (progress) {
        const updated = await recordSessionAndBadges(
          progress,
          completed,
          'arcade',
        );
        setProgress(updated);
      }
      maybePrefetchFreshPack(settings, {
        level: DIFFICULTY_META[difficulty].tier,
      });
    },
    [progress, settings, difficulty],
  );

  const startGame = (id: ArcadeGameId) => {
    soundEngine.playUiTap();
    setResults(null);
    setTelemetry(INITIAL_ARCADE_TELEMETRY);
    setSelectedGame(id);
    setSessionNonce((n) => n + 1);
  };

  const isFocus = settings.layout === 'focus';

  return (
    <main className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 space-y-5">
      {!isFocus && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                if (selectedGame) {
                  soundEngine.playUiTap();
                  setSelectedGame(null);
                  setResults(null);
                  setTelemetry(INITIAL_ARCADE_TELEMETRY);
                } else {
                  onBack();
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80"
              style={{color: 'var(--tv-accent)'}}
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{selectedGame ? 'All Arcade Games' : 'Back to Hub (Esc)'}</span>
            </button>
            <h1 className="font-display text-3xl font-bold tracking-tight">Arcade</h1>
            <p className="text-sm" style={{color: 'var(--tv-text-muted)'}}>
              Five offline-ready 3D &amp; Classic 2D games with live WPM telemetry and three difficulty tiers.
            </p>
          </div>

          <div
            className="flex items-center gap-1 rounded-xl border p-1"
            style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            role="group"
            aria-label="Arcade difficulty"
          >
            {(['easy', 'medium', 'hard'] as ArcadeDifficulty[]).map((lvl) => {
              const active = difficulty === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiTap();
                    setDifficulty(lvl);
                    setResults(null);
                  }}
                  className="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--tv-accent)' : 'transparent',
                    color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                  }}
                >
                  {DIFFICULTY_META[lvl].label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Live WPM Meter HUD — visible in EVERY arcade mode */}
      <WpmHud
        telemetry={telemetry}
        personalBestWpm={progress?.bestWpm ?? 0}
        targetWpm={progress?.targetWpm ?? 60}
      />

      {/* Game Selector Grid OR Active Game OR Results */}
      {!selectedGame ? (
        <section
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          aria-label="Arcade games"
        >
          {ARCADE_GAMES.map((game) => {
            const Icon = game.icon;
            return (
              <div
                key={game.id}
                className="tv-surface tv-card-hover rounded-2xl p-6 text-left flex flex-col justify-between gap-4"
              >
                <button
                  type="button"
                  onClick={() => startGame(game.id)}
                  className="text-left space-y-2.5 focus:outline-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                      style={{
                        borderColor: 'var(--tv-border)',
                        backgroundColor: 'var(--tv-bg)',
                        color: 'var(--tv-accent)',
                      }}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
                      {DIFFICULTY_META[difficulty].label} · {game.tagline}
                    </span>
                  </div>
                  <h2 className="font-display text-xl font-bold">{game.title}</h2>
                  <p className="text-sm leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
                    {game.description}
                  </p>
                </button>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t" style={{borderColor: 'var(--tv-border)'}}>
                  <ArcadeVisualsSelector gameId={game.id} compact />
                  <button
                    type="button"
                    onClick={() => startGame(game.id)}
                    className="text-xs font-semibold hover:underline"
                    style={{color: 'var(--tv-accent)'}}
                  >
                    Launch {game.title} →
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ) : results ? (
        <SessionResults
          stats={results}
          profileName={profileName}
          showCertificate={false}
          onRetry={() => {
            soundEngine.playUiTap();
            setResults(null);
            setTelemetry(INITIAL_ARCADE_TELEMETRY);
            setSessionNonce((n) => n + 1);
          }}
          onNext={() => {
            soundEngine.playUiTap();
            setResults(null);
            setSelectedGame(null);
            setTelemetry(INITIAL_ARCADE_TELEMETRY);
          }}
          onPractiseWeakKeys={() => {
            soundEngine.playUiTap();
            setResults(null);
            setTelemetry(INITIAL_ARCADE_TELEMETRY);
            setSessionNonce((n) => n + 1);
          }}
        />
      ) : (
        <>
          {selectedGame === 'turbo-racer' && (
            <TurboRacerGame
              key={`racer-${difficulty}-${sessionNonce}`}
              difficulty={difficulty}
              wordPool={wordPool}
              personalBestWpm={progress?.bestWpm ?? 0}
              targetWpm={progress?.targetWpm ?? 60}
              reducedMotion={settings.reducedMotion}
              onTelemetry={setTelemetry}
              onFinish={(s) => void handleFinish(s)}
              onExit={() => setSelectedGame(null)}
            />
          )}
          {selectedGame === 'star-defender' && (
            <StarDefenderGame
              key={`defender-${difficulty}-${sessionNonce}`}
              difficulty={difficulty}
              wordPool={wordPool}
              personalBestWpm={progress?.bestWpm ?? 0}
              targetWpm={progress?.targetWpm ?? 60}
              reducedMotion={settings.reducedMotion}
              onTelemetry={setTelemetry}
              onFinish={(s) => void handleFinish(s)}
              onExit={() => setSelectedGame(null)}
            />
          )}
          {selectedGame === 'word-rain' && (
            <WordRainGame
              key={`rain-${difficulty}-${sessionNonce}`}
              difficulty={difficulty}
              wordPool={wordPool}
              personalBestWpm={progress?.bestWpm ?? 0}
              targetWpm={progress?.targetWpm ?? 60}
              reducedMotion={settings.reducedMotion}
              onTelemetry={setTelemetry}
              onFinish={(s) => void handleFinish(s)}
              onExit={() => setSelectedGame(null)}
            />
          )}
          {selectedGame === 'bubble-pop' && (
            <BubblePopGame
              key={`bubble-${difficulty}-${sessionNonce}`}
              difficulty={difficulty}
              wordPool={wordPool}
              personalBestWpm={progress?.bestWpm ?? 0}
              targetWpm={progress?.targetWpm ?? 60}
              reducedMotion={settings.reducedMotion}
              onTelemetry={setTelemetry}
              onFinish={(s) => void handleFinish(s)}
              onExit={() => setSelectedGame(null)}
            />
          )}
          {selectedGame === 'beat-typer' && (
            <BeatTyperGame
              key={`beat-${difficulty}-${sessionNonce}`}
              difficulty={difficulty}
              wordPool={wordPool}
              personalBestWpm={progress?.bestWpm ?? 0}
              targetWpm={progress?.targetWpm ?? 60}
              reducedMotion={settings.reducedMotion}
              onTelemetry={setTelemetry}
              onFinish={(s) => void handleFinish(s)}
              onExit={() => setSelectedGame(null)}
            />
          )}
        </>
      )}
    </main>
  );
};
