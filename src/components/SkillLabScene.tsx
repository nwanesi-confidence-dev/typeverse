import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ArrowLeft, RefreshCw, Target, Zap} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {KeyboardHeatmap} from '@/src/components/KeyboardHeatmap';
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
import type {ProfileProgress} from '@/src/types/app';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';
import {recordSessionAndBadges} from '@/src/utils/progression';

interface SkillLabSceneProps {
  onBack: () => void;
  activeProfileId: string;
}

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

const FALLBACK_BIGRAMS = ['th', 'qu', 'er', 'st', 'ch', 'br'];

export const SkillLabScene: React.FC<SkillLabSceneProps> = ({
  onBack,
  activeProfileId,
}) => {
  const {settings} = useAppearance();
  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [profileName, setProfileName] = useState('Typist');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [drillMode, setDrillMode] = useState<'auto' | 'bigrams' | 'custom'>('auto');
  const [drillText, setDrillText] = useState('');
  const [telemetry, setTelemetry] = useState<TypingTelemetrySnapshot>(INITIAL_TELEMETRY);
  const [results, setResults] = useState<CompletedSessionStats | null>(null);
  const [runSeed, setRunSeed] = useState(1);

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

  const weakKeyRankings = useMemo(() => {
    const metrics = progress?.keyMetrics ?? {};
    return Object.entries(metrics)
      .filter(([k, s]) => /^[a-z0-9]$/.test(k) && s.hits + s.errors >= 2)
      .map(([key, s]) => {
        const avgMs = s.hits > 0 ? Math.round(s.totalLatencyMs / s.hits) : 450;
        const errRate = (s.errors / (s.hits + s.errors)) * 100;
        const score = avgMs + errRate * 14;
        return {key, avgMs, errRate: Math.round(errRate), score};
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [progress?.keyMetrics]);

  const weakBigramRankings = useMemo(() => {
    const metrics = progress?.bigramMetrics ?? {};
    return Object.entries(metrics)
      .filter(([, s]) => s.hits + s.errors >= 2)
      .map(([bigram, s]) => {
        const avgMs = s.hits > 0 ? Math.round(s.totalLatencyMs / s.hits) : 420;
        const errRate = (s.errors / (s.hits + s.errors)) * 100;
        const score = avgMs + errRate * 15;
        return {bigram, avgMs, errRate: Math.round(errRate), score};
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [progress?.bigramMetrics]);

  const buildAdaptiveDrill = useCallback(async () => {
    const packs = await loadFreshPacks();
    const allWords = await queryWordBank({
      kind: 'words',
      spelling: settings.spelling,
      freshPacks: packs,
      seed: runSeed,
      limit: 600,
    });

    const targetKeys =
      drillMode === 'custom' && selectedKeys.length > 0
        ? selectedKeys
        : weakKeyRankings.slice(0, 4).map((k) => k.key);

    const targetBigrams =
      weakBigramRankings.length > 0
        ? weakBigramRankings.slice(0, 4).map((b) => b.bigram)
        : FALLBACK_BIGRAMS;

    let chosen: string[] = [];

    if (drillMode === 'bigrams') {
      const bigramWords = allWords
        .filter((w) => targetBigrams.some((bg) => w.text.includes(bg)))
        .map((w) => w.text);
      const rhythmWarmup = targetBigrams.slice(0, 4).map((bg) => `${bg} ${bg} ${bg}`);
      chosen = [...rhythmWarmup, ...bigramWords.slice(0, 26)];
    } else if (targetKeys.length > 0) {
      const keyWords = allWords
        .filter((w) => targetKeys.some((k) => w.text.toLowerCase().includes(k)))
        .map((w) => w.text);
      const bigramWords = allWords
        .filter((w) => targetBigrams.some((bg) => w.text.includes(bg)))
        .map((w) => w.text);
      const combined = Array.from(new Set([...keyWords.slice(0, 22), ...bigramWords.slice(0, 12)]));
      chosen = combined.slice(0, 30);
    }

    if (chosen.length < 18) {
      chosen = allWords.slice(0, 30).map((w) => w.text);
    }

    setDrillText(chosen.join(' '));
    setResults(null);
    setTelemetry({...INITIAL_TELEMETRY, nextChar: chosen.join(' ')[0] ?? null});
  }, [
    drillMode,
    selectedKeys,
    weakKeyRankings,
    weakBigramRankings,
    settings.spelling,
    runSeed,
  ]);

  useEffect(() => {
    void buildAdaptiveDrill();
  }, [buildAdaptiveDrill]);

  const handleToggleKey = (key: string) => {
    soundEngine.playUiTap();
    setDrillMode('custom');
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].slice(-6),
    );
  };

  const handleComplete = useCallback(
    async (completed: CompletedSessionStats) => {
      soundEngine.playMilestone();
      const enriched: CompletedSessionStats = {
        ...completed,
        mode: 'skill-lab',
        subMode:
          drillMode === 'bigrams'
            ? 'Skill Lab · Bigram Flow'
            : drillMode === 'custom' && selectedKeys.length > 0
              ? `Skill Lab · Keys (${selectedKeys.join('')})`
              : 'Skill Lab · Adaptive Drill',
      };
      setResults(enriched);

      if (progress) {
        const updated = await recordSessionAndBadges(
          progress,
          enriched,
          'skill-lab',
        );
        setProgress(updated);
      }
    },
    [progress, drillMode, selectedKeys],
  );

  const isFocus = settings.layout === 'focus';

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 space-y-5">
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
            <h1 className="font-display text-3xl font-bold tracking-tight">Skill Lab</h1>
            <p className="text-sm" style={{color: 'var(--tv-text-muted)'}}>
              Adaptive drills generated from your slowest keys and error-prone bigrams.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-xl border p-1"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              {(
                [
                  {id: 'auto', label: 'Adaptive Mix'},
                  {id: 'bigrams', label: 'Tricky Bigrams'},
                  {id: 'custom', label: 'Selected Keys'},
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiTap();
                    setDrillMode(m.id);
                  }}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: drillMode === m.id ? 'var(--tv-accent)' : 'transparent',
                    color: drillMode === m.id ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                setRunSeed((s) => s + 1);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>New Drill</span>
            </button>
          </div>
        </div>
      )}

      {/* Live WPM Meter HUD */}
      <WpmHud
        telemetry={telemetry}
        personalBestWpm={progress?.bestWpm ?? 0}
        targetWpm={progress?.targetWpm ?? 60}
      />

      {/* Active Drill or Results */}
      {results ? (
        <SessionResults
          stats={results}
          profileName={profileName}
          showCertificate={false}
          onRetry={() => {
            soundEngine.playUiTap();
            setResults(null);
            setRunSeed((s) => s + 1);
          }}
          onNext={() => {
            soundEngine.playUiTap();
            setResults(null);
            setRunSeed((s) => s + 1);
          }}
          onPractiseWeakKeys={(keys) => {
            soundEngine.playUiTap();
            setSelectedKeys(keys);
            setDrillMode('custom');
            setResults(null);
            setRunSeed((s) => s + 1);
          }}
        />
      ) : (
        drillText && (
          <TypingArena
            key={`lab-${drillMode}-${selectedKeys.join('')}-${runSeed}`}
            text={drillText}
            timeLimitSec={null}
            personalBestWpm={progress?.bestWpm ?? 0}
            targetWpm={progress?.targetWpm ?? 60}
            modeLabel={
              drillMode === 'custom' && selectedKeys.length > 0
                ? `Focused Keys: ${selectedKeys.join(' ').toUpperCase()}`
                : drillMode === 'bigrams'
                  ? 'Bigram Rhythm Drill'
                  : 'Adaptive Weak-Key Drill'
            }
            onTelemetry={setTelemetry}
            onComplete={(s) => void handleComplete(s)}
            onRestart={() => {
              soundEngine.playUiTap();
              setRunSeed((s) => s + 1);
            }}
          />
        )
      )}

      {/* Diagnostics: Heatmap + Weak Keys / Bigrams Cards */}
      {!isFocus && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8">
            <KeyboardHeatmap
              keyMetrics={progress?.keyMetrics ?? {}}
              selectedKeys={selectedKeys}
              onToggleKey={handleToggleKey}
            />
          </div>

          <div className="lg:col-span-4 space-y-4">
            <div className="tv-surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold font-display">
                <Target className="w-4 h-4" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
                <span>Weakest Keys</span>
              </div>
              {weakKeyRankings.length === 0 ? (
                <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                  Complete a short drill above to populate per-key latency and error rankings.
                </p>
              ) : (
                <ul className="space-y-2">
                  {weakKeyRankings.map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center justify-between text-xs py-1 border-b last:border-b-0"
                      style={{borderColor: 'var(--tv-border)'}}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleKey(item.key)}
                        className="font-typing font-bold uppercase px-2 py-0.5 rounded border hover:opacity-80"
                        style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-bg)'}}
                      >
                        {item.key}
                      </button>
                      <span className="font-typing tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                        {item.avgMs} ms · {item.errRate}% err
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="tv-surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold font-display">
                <Zap className="w-4 h-4" style={{color: 'var(--tv-warning)'}} aria-hidden="true" />
                <span>Slowest Bigrams</span>
              </div>
              {weakBigramRankings.length === 0 ? (
                <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                  Default focus pairs: {FALLBACK_BIGRAMS.join(', ')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {weakBigramRankings.map((item) => (
                    <li
                      key={item.bigram}
                      className="flex items-center justify-between text-xs py-1 border-b last:border-b-0"
                      style={{borderColor: 'var(--tv-border)'}}
                    >
                      <span
                        className="font-typing font-bold px-2 py-0.5 rounded border"
                        style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-bg)'}}
                      >
                        {item.bigram}
                      </span>
                      <span className="font-typing tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                        {item.avgMs} ms · {item.errRate}% err
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
