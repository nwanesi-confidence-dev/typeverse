import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, SlidersHorizontal} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {AdaptiveSceneLayout} from '@/src/components/AdaptiveSceneLayout';
import {
  CompactKeyHeatmapPanel,
  LiveSessionStatsPanel,
} from '@/src/components/LiveSessionSidePanels';
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
import type {ContentKind, ProfileProgress, WordDifficultyTier} from '@/src/types/app';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';
import {
  extractFreshPackIdsFromEntryIds,
  markFreshPacksUsed,
  maybePrefetchFreshPack,
} from '@/src/utils/freshWordsClient';
import {getTodayActivitySeconds, recordSessionAndBadges} from '@/src/utils/progression';
import {useScreenInfo} from '@/src/utils/screenInfo';

interface SpeedTestSceneProps {
  onBack: () => void;
}

type DurationMode =
  | {type: 'time'; seconds: 30 | 60 | 180 | 300; label: string}
  | {type: 'words'; count: number; label: string};

const PRESETS: DurationMode[] = [
  {type: 'time', seconds: 30, label: '30s'},
  {type: 'time', seconds: 60, label: '1 min'},
  {type: 'time', seconds: 180, label: '3 min'},
  {type: 'time', seconds: 300, label: '5 min'},
  {type: 'words', count: 25, label: '25 words'},
  {type: 'words', count: 50, label: '50 words'},
];

const TEXT_TYPES: Array<{id: ContentKind; label: string}> = [
  {id: 'words', label: 'Words'},
  {id: 'sentences', label: 'Sentences'},
  {id: 'paragraphs', label: 'Paragraph'},
  {id: 'numbers', label: 'Numbers'},
  {id: 'punctuation', label: 'Punctuation'},
  {id: 'code', label: 'Code'},
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

export const SpeedTestScene: React.FC<SpeedTestSceneProps> = ({onBack}) => {
  const {settings} = useAppearance();
  const screen = useScreenInfo();
  const [setupDrawerOpen, setSetupDrawerOpen] = useState(false);
  const [duration, setDuration] = useState<DurationMode>(PRESETS[1]); // 1 min default
  const [customWordCount, setCustomWordCount] = useState<number>(40);
  const [useCustomCount, setUseCustomCount] = useState(false);
  const [textKind, setTextKind] = useState<ContentKind>('paragraphs');
  const [tier, setTier] = useState<WordDifficultyTier | 0>(0);
  const [weakKeyFilter, setWeakKeyFilter] = useState<string[]>([]);
  const [runSeed, setRunSeed] = useState(1);

  const [passage, setPassage] = useState<string>('');
  const [telemetry, setTelemetry] = useState<TypingTelemetrySnapshot>(INITIAL_TELEMETRY);
  const [results, setResults] = useState<CompletedSessionStats | null>(null);

  const [profileName, setProfileName] = useState('Typist');
  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const extraPoolRef = useRef<string[]>([]);
  const usedPackIdsRef = useRef<string[]>([]);

  // Load active profile & progress from IndexedDB
  useEffect(() => {
    let active = true;
    void (async () => {
      const pid = await getActiveProfileId();
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
  }, []);

  // Build passage from Fresh Packs + Bundled Word Bank (never blocks on network)
  const buildPassage = useCallback(
    async (seedVal: number, focusKeysOverride?: string[]) => {
      const packs = await loadFreshPacks();
      const effectiveFocus = focusKeysOverride ?? weakKeyFilter;
      const wordTarget =
        useCustomCount
          ? Math.max(5, Math.min(300, customWordCount))
          : duration.type === 'words'
            ? duration.count
            : 120;

      // If weak-key drill is active on non-words, query matching words first
      const effectiveKind: ContentKind =
        effectiveFocus.length > 0 ? 'words' : textKind;

      let entries = await queryWordBank({
        kind: effectiveKind,
        tier: tier === 0 ? undefined : tier,
        focusKeys: effectiveFocus.length > 0 ? effectiveFocus : undefined,
        spelling: settings.spelling,
        freshPacks: packs,
        seed: seedVal,
        limit: effectiveKind === 'words' ? Math.max(wordTarget, 100) : 24,
      });

      // Fallback if strict focus-key filter returned too few words
      if (entries.length < 10 && effectiveFocus.length > 0) {
        const allWords = await queryWordBank({
          kind: 'words',
          spelling: settings.spelling,
          freshPacks: packs,
          seed: seedVal,
          limit: 300,
        });
        const containingWeak = allWords.filter((w) =>
          effectiveFocus.some((k) => w.text.toLowerCase().includes(k)),
        );
        entries = containingWeak.length > 0 ? containingWeak : allWords;
      }

      usedPackIdsRef.current = extractFreshPackIdsFromEntryIds(
        entries.map((e) => e.id),
      );

      if (effectiveKind === 'words') {
        const wordsList: string[] = [];
        for (let i = 0; i < wordTarget; i++) {
          wordsList.push(entries[i % entries.length].text);
        }
        extraPoolRef.current = entries.slice(0, 60).map((e) => e.text);
        setPassage(wordsList.join(' '));
      } else {
        const chunks: string[] = [];
        let totalWords = 0;
        let idx = 0;
        while (totalWords < wordTarget && entries.length > 0 && idx < 40) {
          const txt = entries[idx % entries.length].text;
          chunks.push(txt);
          totalWords += txt.split(/\s+/).length;
          idx++;
        }
        extraPoolRef.current = entries.map((e) => e.text);
        setPassage(chunks.join(' '));
      }

      setResults(null);
      setTelemetry({
        ...INITIAL_TELEMETRY,
        remainingMs:
          !useCustomCount && duration.type === 'time'
            ? duration.seconds * 1000
            : null,
      });
    },
    [
      duration,
      useCustomCount,
      customWordCount,
      textKind,
      tier,
      weakKeyFilter,
      settings.spelling,
    ],
  );

  useEffect(() => {
    void buildPassage(runSeed);
  }, [buildPassage, runSeed]);

  const handleRestart = useCallback(() => {
    soundEngine.playUiTap();
    void buildPassage(runSeed);
  }, [buildPassage, runSeed]);

  const handleNext = useCallback(() => {
    soundEngine.playUiTap();
    setWeakKeyFilter([]);
    setRunSeed((s) => s + 1);
  }, []);

  const handlePractiseWeakKeys = useCallback(
    (keys: string[]) => {
      soundEngine.playUiTap();
      setWeakKeyFilter(keys);
      setTextKind('words');
      setDuration({type: 'words', count: 35, label: '35 words'});
      setUseCustomCount(false);
      setRunSeed((s) => s + 1);
    },
    [],
  );

  const handleComplete = useCallback(
    async (completed: CompletedSessionStats) => {
      soundEngine.playMilestone();
      const enriched: CompletedSessionStats = {
        ...completed,
        mode: 'speed-test',
        textKind,
      };
      setResults(enriched);

      if (usedPackIdsRef.current.length > 0) {
        void markFreshPacksUsed(usedPackIdsRef.current);
      }

      if (progress) {
        const nextProgress = await recordSessionAndBadges(
          progress,
          enriched,
          'speed-test',
        );
        setProgress(nextProgress);
      }

      maybePrefetchFreshPack(settings, {
        level: tier === 0 ? undefined : tier,
      });
    },
    [progress, textKind, settings, tier],
  );

  const handleExtendText = useCallback((): string | null => {
    const pool = extraPoolRef.current;
    if (pool.length === 0) return null;
    const chunk = pool[Math.floor(Math.random() * pool.length)];
    return chunk ?? null;
  }, []);

  const activeTimeLimit =
    !useCustomCount && duration.type === 'time' ? duration.seconds : null;

  const subModeLabel = useCustomCount
    ? `${customWordCount} words · ${textKind}`
    : `${duration.label} · ${textKind}`;

  const isFocus = settings.layout === 'focus';
  const showInlinePresets =
    !results &&
    !screen.showSidePanels &&
    screen.layoutProfile !== 'compact' &&
    screen.width >= 1080 &&
    screen.height >= 720;

  const durationControls = (
    <div
      className="flex flex-wrap items-center gap-1 rounded-xl border p-1"
      style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
    >
      {PRESETS.map((p) => {
        const selected =
          !useCustomCount &&
          duration.type === p.type &&
          duration.label === p.label;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              soundEngine.playUiTap();
              setUseCustomCount(false);
              setDuration(p);
            }}
            className="rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: selected ? 'var(--tv-accent)' : 'transparent',
              color: selected ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
            }}
          >
            {p.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => {
          soundEngine.playUiTap();
          setUseCustomCount(true);
        }}
        className="rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
        style={{
          backgroundColor: useCustomCount ? 'var(--tv-accent)' : 'transparent',
          color: useCustomCount ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
        }}
      >
        Custom
      </button>
      {useCustomCount && (
        <input
          type="number"
          min={5}
          max={300}
          value={customWordCount}
          onChange={(e) => setCustomWordCount(Number(e.target.value) || 25)}
          aria-label="Custom word count"
          className="font-typing w-16 rounded-md border px-2 py-0.5 text-xs"
          style={{
            backgroundColor: 'var(--tv-bg)',
            borderColor: 'var(--tv-border)',
            color: 'var(--tv-text)',
          }}
        />
      )}
    </div>
  );

  const textAndTierControls = (
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-medium mb-1.5" style={{color: 'var(--tv-text-muted)'}}>
          Content Type
        </div>
        <div
          className="flex flex-wrap items-center gap-1 rounded-xl border p-1"
          style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
        >
          {TEXT_TYPES.map((t) => {
            const selected = textKind === t.id && weakKeyFilter.length === 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  soundEngine.playUiTap();
                  setWeakKeyFilter([]);
                  setTextKind(t.id);
                }}
                className="rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: selected ? 'var(--tv-surface-elevated)' : 'transparent',
                  color: selected ? 'var(--tv-accent)' : 'var(--tv-text-muted)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor="speed-test-tier"
          className="block text-[11px] font-medium mb-1.5"
          style={{color: 'var(--tv-text-muted)'}}
        >
          Difficulty Tier
        </label>
        <select
          id="speed-test-tier"
          value={tier}
          onChange={(e) => setTier(Number(e.target.value) as WordDifficultyTier | 0)}
          aria-label="Difficulty tier"
          className="w-full rounded-xl border px-3 py-2 text-xs font-medium"
          style={{
            backgroundColor: 'var(--tv-surface)',
            borderColor: 'var(--tv-border)',
            color: 'var(--tv-text)',
          }}
        >
          <option value={0}>Mixed Tier</option>
          <option value={1}>Tier 1</option>
          <option value={2}>Tier 2</option>
          <option value={3}>Tier 3</option>
          <option value={4}>Tier 4</option>
          <option value={5}>Tier 5</option>
        </select>
      </div>
    </div>
  );

  const testSetupPanel = (
    <section className="tv-surface rounded-2xl p-4 space-y-3" aria-label="Test setup">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
          <span>Test Configuration</span>
        </h3>
        <span className="text-[11px] font-typing" style={{color: 'var(--tv-text-muted)'}}>
          {subModeLabel}
        </span>
      </div>
      <div>
        <div className="text-[11px] font-medium mb-1.5" style={{color: 'var(--tv-text-muted)'}}>
          Duration / Word Count
        </div>
        {durationControls}
      </div>
      {textAndTierControls}
    </section>
  );

  return (
    <AdaptiveSceneLayout
      playLocked={!results}
      drawerOpen={setupDrawerOpen}
      drawerTitle="Speed Test Setup"
      onCloseDrawer={() => setSetupDrawerOpen(false)}
      drawerContent={
        <>
          {testSetupPanel}
          <LiveSessionStatsPanel telemetry={telemetry} progress={progress} modeFilter="speed-test" />
        </>
      }
      topBar={
        !isFocus ? (
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80 shrink-0"
                style={{color: 'var(--tv-accent)'}}
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Hub (Esc)</span>
              </button>
              <h1
                className="font-display font-bold tracking-tight truncate"
                style={{fontSize: 'var(--tv-text-xl)'}}
              >
                Speed Test
              </h1>
              {weakKeyFilter.length > 0 && (
                <span className="text-xs font-typing truncate" style={{color: 'var(--tv-warning)'}}>
                  Weak-key focus: {weakKeyFilter.join(', ')}
                </span>
              )}
            </div>

            {!results && (
              <div className="flex flex-wrap items-center gap-2">
                {showInlinePresets && durationControls}
                {!screen.showSidePanels && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiTap();
                      setSetupDrawerOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--tv-surface)',
                      borderColor: 'var(--tv-border)',
                      color: 'var(--tv-text)',
                    }}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
                    <span>{showInlinePresets ? 'Text & Tier' : `Setup (${subModeLabel})`}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : undefined
      }
      leftPanel={
        !isFocus ? (
          <>
            {!results && testSetupPanel}
            <LiveSessionStatsPanel telemetry={telemetry} progress={progress} modeFilter="speed-test" />
          </>
        ) : undefined
      }
      rightPanel={
        !isFocus ? (
          <CompactKeyHeatmapPanel keyMetrics={progress?.keyMetrics ?? {}} />
        ) : undefined
      }
      hud={
        <div className="no-print">
          <WpmHud
            telemetry={telemetry}
            personalBestWpm={progress?.bestWpm ?? 0}
            targetWpm={progress?.targetWpm ?? 60}
            dailyGoalMinutes={progress?.dailyGoalMinutes ?? 15}
            todayActivitySeconds={getTodayActivitySeconds(progress)}
            showGhostPace
          />
        </div>
      }
    >
      {results ? (
        <SessionResults
          stats={results}
          profileName={profileName}
          onRetry={handleRestart}
          onNext={handleNext}
          onPractiseWeakKeys={handlePractiseWeakKeys}
          showCertificate
        />
      ) : passage ? (
        <TypingArena
          key={`${passage.slice(0, 24)}-${runSeed}-${activeTimeLimit ?? 'wc'}`}
          text={passage}
          timeLimitSec={activeTimeLimit}
          personalBestWpm={progress?.bestWpm ?? 0}
          targetWpm={progress?.targetWpm ?? 60}
          modeLabel={subModeLabel}
          onTelemetry={setTelemetry}
          onComplete={handleComplete}
          onRestart={handleRestart}
          onExtendText={handleExtendText}
        />
      ) : (
        <div className="tv-surface rounded-2xl p-10 text-center text-sm" style={{color: 'var(--tv-text-muted)'}}>
          Preparing passage...
        </div>
      )}
    </AdaptiveSceneLayout>
  );
};
