import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Flame,
  Sparkles,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {SessionResults} from '@/src/components/SessionResults';
import {TypingArena} from '@/src/components/TypingArena';
import {WpmHud} from '@/src/components/WpmHud';
import {useAppearance} from '@/src/context/AppearanceContext';
import {queryWordBank} from '@/src/data/wordBank';
import {
  getActiveProfileId,
  loadFreshPacks,
  loadProfileProgress,
  loadProfiles,
} from '@/src/db/storage';
import type {
  ContentTheme,
  ProfileProgress,
  WordDifficultyTier,
} from '@/src/types/app';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';
import {
  extractFreshPackIdsFromEntryIds,
  markFreshPacksUsed,
  maybePrefetchFreshPack,
} from '@/src/utils/freshWordsClient';
import {getLocalDateKey, recordSessionAndBadges} from '@/src/utils/progression';

interface DailyChallengeSceneProps {
  onBack: () => void;
  activeProfileId: string;
}

const DAILY_THEMES: ContentTheme[] = [
  'School life',
  'Technology',
  'Nature',
  'Business',
  'Sports',
  'Stories',
  'Science',
  'Everyday life',
];

const INITIAL_TELEMETRY: TypingTelemetrySnapshot = {
  netWpm: 0,
  grossWpm: 0,
  rollingWpm: 0,
  cpm: 0,
  accuracy: 100,
  consistency: 100,
  errors: 0,
  uncorrectedErrors: 0,
  typedChars: 0,
  totalChars: 0,
  elapsedMs: 0,
  remainingMs: null,
  combo: 0,
  multiplier: 1,
  wpmHistory: [],
  capsLock: false,
  strictBlocked: false,
  started: false,
  finished: false,
  paused: false,
  ghostProgress: 0,
  userProgress: 0,
  nextChar: null,
};

function dateKeyToSeed(dateKey: string): number {
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) + 1;
}

export const DailyChallengeScene: React.FC<DailyChallengeSceneProps> = ({
  onBack,
  activeProfileId,
}) => {
  const {settings} = useAppearance();
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const dailySeed = useMemo(() => dateKeyToSeed(todayKey), [todayKey]);
  const dailyTheme = DAILY_THEMES[dailySeed % DAILY_THEMES.length];
  const dailyTier: WordDifficultyTier = ((dailySeed % 3) + 2) as WordDifficultyTier; // tiers 2-4

  const [passage, setPassage] = useState('');
  const [fromFreshPack, setFromFreshPack] = useState(false);
  const [usedPackIds, setUsedPackIds] = useState<string[]>([]);
  const [attemptKey, setAttemptKey] = useState(1);
  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [profileName, setProfileName] = useState('Typist');
  const [telemetry, setTelemetry] = useState<TypingTelemetrySnapshot>(INITIAL_TELEMETRY);
  const [results, setResults] = useState<CompletedSessionStats | null>(null);

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

  const loadDailyPassage = useCallback(async () => {
    const packs = await loadFreshPacks();
    const todayPacks = packs.filter((p) => p.date === todayKey);

    // If a synced word pack exists specifically for today's date, build today's challenge from it
    if (todayPacks.length > 0) {
      const todayParagraphs = await queryWordBank({
        kind: 'paragraphs',
        date: todayKey,
        spelling: settings.spelling,
        freshPacks: todayPacks,
        seed: dailySeed,
        limit: 4,
      });
      const todaySentences = await queryWordBank({
        kind: 'sentences',
        date: todayKey,
        spelling: settings.spelling,
        freshPacks: todayPacks,
        seed: dailySeed + 17,
        limit: 6,
      });

      const dateMatchedEntries = [...todayParagraphs, ...todaySentences].filter((e) =>
        e.id.startsWith('fp::'),
      );

      if (dateMatchedEntries.length > 0) {
        const chunks: string[] = [];
        const pickedIds: string[] = [];
        let wc = 0;
        for (const entry of dateMatchedEntries) {
          chunks.push(entry.text);
          pickedIds.push(entry.id);
          wc += entry.text.split(/\s+/).length;
          if (wc >= 55) break;
        }
        const txt = chunks.join(' ');
        setFromFreshPack(true);
        setUsedPackIds(extractFreshPackIdsFromEntryIds(pickedIds));
        setPassage(txt);
        setResults(null);
        setTelemetry({...INITIAL_TELEMETRY, nextChar: txt[0] ?? null});
        return;
      }
    }

    // Deterministic daily fallback combining paragraphs/sentences seeded by YYYY-MM-DD
    const paragraphEntries = await queryWordBank({
      kind: 'paragraphs',
      theme: dailyTheme,
      spelling: settings.spelling,
      freshPacks: packs,
      seed: dailySeed,
      limit: 6,
    });

    const sentenceEntries = await queryWordBank({
      kind: 'sentences',
      theme: dailyTheme,
      spelling: settings.spelling,
      freshPacks: packs,
      seed: dailySeed + 17,
      limit: 8,
    });

    const combinedEntries = [...paragraphEntries, ...sentenceEntries];
    const chunks: string[] = [];
    const pickedIds: string[] = [];
    let wc = 0;
    for (const entry of combinedEntries) {
      chunks.push(entry.text);
      pickedIds.push(entry.id);
      wc += entry.text.split(/\s+/).length;
      if (wc >= 55) break;
    }

    if (chunks.length === 0) {
      const fallback = await queryWordBank({
        kind: 'sentences',
        spelling: settings.spelling,
        freshPacks: packs,
        seed: dailySeed,
        limit: 4,
      });
      fallback.forEach((e) => {
        chunks.push(e.text);
        pickedIds.push(e.id);
      });
    }

    const packIds = extractFreshPackIdsFromEntryIds(pickedIds);
    setFromFreshPack(packIds.length > 0);
    setUsedPackIds(packIds);

    const txt = chunks.join(' ');
    setPassage(txt);
    setResults(null);
    setTelemetry({...INITIAL_TELEMETRY, nextChar: txt[0] ?? null});
  }, [todayKey, dailyTheme, dailySeed, settings.spelling]);

  useEffect(() => {
    void loadDailyPassage();
  }, [loadDailyPassage]);

  const handleComplete = useCallback(
    async (completed: CompletedSessionStats) => {
      soundEngine.playMilestone();
      const enriched: CompletedSessionStats = {
        ...completed,
        mode: 'daily-challenge',
        subMode: `Daily Challenge · ${todayKey}`,
      };
      setResults(enriched);

      if (usedPackIds.length > 0) {
        void markFreshPacksUsed(usedPackIds);
      }

      if (progress) {
        const prevHistory = progress.dailyChallengeHistory ?? {};
        const prevToday = prevHistory[todayKey];
        const nextHistory = {
          ...prevHistory,
          [todayKey]: {
            bestWpm: Math.max(prevToday?.bestWpm ?? 0, completed.netWpm),
            bestAccuracy: Math.max(prevToday?.bestAccuracy ?? 0, completed.accuracy),
            attempts: (prevToday?.attempts ?? 0) + 1,
            lastCompletedAt: Date.now(),
          },
        };
        const updated = await recordSessionAndBadges(
          progress,
          enriched,
          'daily-challenge',
          {dailyChallengeHistory: nextHistory},
        );
        setProgress(updated);
      }

      maybePrefetchFreshPack(settings, {
        level: dailyTier,
        theme: dailyTheme,
      });
    },
    [todayKey, progress, settings, dailyTier, dailyTheme, usedPackIds],
  );

  // Build last 7 days check-in strip
  const last7Days = useMemo(() => {
    const hist = progress?.dailyChallengeHistory ?? {};
    const list: Array<{dateKey: string; label: string; completed: boolean; wpm: number}> = [];
    const now = new Date();
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(now);
      d.setDate(now.getDate() - offset);
      const key = getLocalDateKey(d);
      const rec = hist[key];
      list.push({
        dateKey: key,
        label: d.toLocaleDateString(undefined, {weekday: 'short'}),
        completed: Boolean(rec),
        wpm: rec?.bestWpm ?? 0,
      });
    }
    return list;
  }, [progress?.dailyChallengeHistory]);

  const todayRecord = progress?.dailyChallengeHistory?.[todayKey];
  const totalDailyDone = Object.keys(progress?.dailyChallengeHistory ?? {}).length;
  const isFocus = settings.layout === 'focus';

  return (
    <main className="mx-auto max-w-[1260px] px-4 py-6 sm:px-6 space-y-5">
      {!isFocus && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80"
              style={{color: 'var(--tv-accent)'}}
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back to Hub (Esc)</span>
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Daily Challenge
              </h1>
              <span className="font-typing text-xs font-semibold" style={{color: 'var(--tv-accent)'}}>
                {todayKey} · {dailyTheme}
              </span>
            </div>
            <p className="text-sm" style={{color: 'var(--tv-text-muted)'}}>
              Everyone receives the same date-seeded passage today—ready online or offline.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="tv-surface rounded-xl px-3.5 py-2 flex items-center gap-2 text-xs font-semibold"
              style={{color: 'var(--tv-warning)'}}
            >
              <Flame className="w-4 h-4" aria-hidden="true" />
              <span className="tabular-nums">{progress?.streakDays ?? 0} day streak</span>
            </div>
            <div className="tv-surface rounded-xl px-3.5 py-2 flex items-center gap-2 text-xs font-semibold">
              <CalendarCheck className="w-4 h-4" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
              <span className="tabular-nums">{totalDailyDone} dailies finished</span>
            </div>
          </div>
        </div>
      )}

      {/* 7-Day Check-In & Today's Status */}
      {!isFocus && (
        <section
          className="tv-surface rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4"
          aria-label="Daily Challenge 7-day history"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {todayRecord ? (
                <>
                  <CheckCircle2 className="w-4 h-4" style={{color: 'var(--tv-success)'}} aria-hidden="true" />
                  <span>
                    Completed today · Best {todayRecord.bestWpm} WPM ({todayRecord.bestAccuracy.toFixed(1)}%)
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
                  <span>
                    Complete today&apos;s {dailyTheme.toLowerCase()} passage to lock in your daily check-in
                  </span>
                </>
              )}
            </div>
            <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
              {fromFreshPack
                ? "Sourced from today's cached Word Pack."
                : 'Sourced from the deterministic offline word bank.'}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {last7Days.map((day) => {
              const isToday = day.dateKey === todayKey;
              return (
                <div
                  key={day.dateKey}
                  title={
                    day.completed
                      ? `${day.dateKey}: ${day.wpm} WPM`
                      : `${day.dateKey}: not completed`
                  }
                  className="w-11 rounded-xl border py-1.5 px-1 text-center"
                  style={{
                    borderColor: isToday
                      ? 'var(--tv-accent)'
                      : day.completed
                        ? 'var(--tv-success)'
                        : 'var(--tv-border)',
                    backgroundColor: day.completed
                      ? 'var(--tv-surface-elevated)'
                      : 'var(--tv-bg)',
                  }}
                >
                  <div className="text-[10px]" style={{color: 'var(--tv-text-muted)'}}>
                    {day.label}
                  </div>
                  <div
                    className="font-typing text-xs font-bold tabular-nums mt-0.5"
                    style={{
                      color: day.completed ? 'var(--tv-success)' : 'var(--tv-text-muted)',
                    }}
                  >
                    {day.completed ? `${day.wpm}` : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Live WPM Meter HUD */}
      <WpmHud
        telemetry={telemetry}
        personalBestWpm={progress?.bestWpm ?? 0}
        targetWpm={progress?.targetWpm ?? 60}
        showGhostPace
      />

      {/* Arena OR Results */}
      {results ? (
        <SessionResults
          stats={results}
          profileName={profileName}
          showCertificate
          onRetry={() => {
            soundEngine.playUiTap();
            setResults(null);
            setAttemptKey((k) => k + 1);
            void loadDailyPassage();
          }}
          onNext={onBack}
          onPractiseWeakKeys={() => {
            soundEngine.playUiTap();
            setResults(null);
            setAttemptKey((k) => k + 1);
            void loadDailyPassage();
          }}
        />
      ) : (
        passage && (
          <TypingArena
            key={`daily-${todayKey}-${attemptKey}`}
            text={passage}
            timeLimitSec={null}
            personalBestWpm={progress?.bestWpm ?? 0}
            targetWpm={progress?.targetWpm ?? 60}
            modeLabel={`Daily Challenge · ${dailyTheme}`}
            onTelemetry={setTelemetry}
            onComplete={(s) => void handleComplete(s)}
            onRestart={() => {
              soundEngine.playUiTap();
              setAttemptKey((k) => k + 1);
              void loadDailyPassage();
            }}
          />
        )
      )}
    </main>
  );
};
