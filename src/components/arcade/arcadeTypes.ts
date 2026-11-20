import type {WordDifficultyTier} from '@/src/types/app';
import type {
  CompletedSessionStats,
  PerKeyStat,
  SlowKeyMetric,
  TypingTelemetrySnapshot,
} from '@/src/types/typing';

export type ArcadeGameId =
  | 'turbo-racer'
  | 'star-defender'
  | 'word-rain'
  | 'bubble-pop'
  | 'beat-typer';

export type ArcadeDifficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_META: Record<
  ArcadeDifficulty,
  {label: string; tier: WordDifficultyTier; speedScale: number; summary: string}
> = {
  easy: {
    label: 'Easy',
    tier: 1,
    speedScale: 0.78,
    summary: 'Short words · gentle pace',
  },
  medium: {
    label: 'Medium',
    tier: 2,
    speedScale: 1.0,
    summary: 'Everyday words · steady pace',
  },
  hard: {
    label: 'Hard',
    tier: 4,
    speedScale: 1.32,
    summary: 'Longer words · brisk wave escalation',
  },
};

export interface ArcadeCommonProps {
  difficulty: ArcadeDifficulty;
  wordPool: string[];
  personalBestWpm: number;
  targetWpm: number;
  reducedMotion: boolean;
  onTelemetry: (snap: TypingTelemetrySnapshot) => void;
  onFinish: (stats: CompletedSessionStats) => void;
  onExit: () => void;
}

export const INITIAL_ARCADE_TELEMETRY: TypingTelemetrySnapshot = {
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

/**
 * Shared real-time arcade typing telemetry tracker so all 5 canvas games
 * report authentic WPM, rolling 8s speed, accuracy, consistency, combo,
 * and per-key latency directly to the WpmHud and SessionResults.
 */
export class ArcadeMetricsTracker {
  private startTs: number | null = null;
  private pausedAccumMs = 0;
  private pauseStartTs: number | null = null;
  private lastKeyTs: number | null = null;

  private correctCount = 0;
  private errorCount = 0;
  private wordsCompleted = 0;
  private combo = 0;
  private maxCombo = 0;
  private capsLock = false;
  private paused = false;
  private finished = false;

  private rollingEvents: Array<{ts: number}> = [];
  private perSecondWpm: number[] = [];
  private lastSampleSec = 0;
  private lastSampleCorrect = 0;

  private keyMap = new Map<string, PerKeyStat>();
  private previousBestWpm: number;

  constructor(previousBestWpm = 0) {
    this.previousBestWpm = previousBestWpm;
  }

  public startIfNeeded(now = performance.now()): void {
    if (this.startTs === null) {
      this.startTs = now;
      this.lastKeyTs = now;
    }
  }

  public setPaused(paused: boolean, now = performance.now()): void {
    if (this.paused === paused || this.finished) return;
    this.paused = paused;
    if (paused) {
      this.pauseStartTs = now;
    } else if (this.pauseStartTs !== null) {
      this.pausedAccumMs += now - this.pauseStartTs;
      this.pauseStartTs = null;
      this.lastKeyTs = now;
    }
  }

  public setCapsLock(caps: boolean): void {
    this.capsLock = caps;
  }

  public getElapsedMs(now = performance.now()): number {
    if (this.startTs === null) return 0;
    const pausedDelta =
      this.pauseStartTs !== null ? now - this.pauseStartTs : 0;
    return Math.max(0, now - this.startTs - this.pausedAccumMs - pausedDelta);
  }

  public recordKey(
    key: string,
    correct: boolean,
    now = performance.now(),
  ): {combo: number; multiplier: number} {
    this.startIfNeeded(now);
    const normKey = key.toLowerCase();
    const latency =
      this.lastKeyTs !== null ? Math.min(2500, Math.max(20, now - this.lastKeyTs)) : 180;
    this.lastKeyTs = now;

    const stat = this.keyMap.get(normKey) ?? {
      key: normKey,
      hits: 0,
      errors: 0,
      totalLatencyMs: 0,
    };

    if (correct) {
      this.correctCount++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.rollingEvents.push({ts: now});
      stat.hits++;
      stat.totalLatencyMs += latency;
    } else {
      this.errorCount++;
      this.combo = 0;
      stat.errors++;
    }
    this.keyMap.set(normKey, stat);

    return {combo: this.combo, multiplier: this.getMultiplier()};
  }

  public recordWordCompleted(): void {
    this.wordsCompleted++;
  }

  public getMultiplier(): number {
    if (this.combo >= 45) return 4;
    if (this.combo >= 25) return 3;
    if (this.combo >= 10) return 2;
    return 1;
  }

  public getSnapshot(
    progressFraction: number,
    nextChar: string | null = null,
    now = performance.now(),
  ): TypingTelemetrySnapshot {
    const elapsedMs = this.getElapsedMs(now);
    const minutes = elapsedMs / 60000;

    // Sample per-second pace
    const elapsedSec = Math.floor(elapsedMs / 1000);
    if (elapsedSec > this.lastSampleSec && this.startTs !== null) {
      const deltaCorrect = this.correctCount - this.lastSampleCorrect;
      const dtSec = elapsedSec - this.lastSampleSec;
      const instWpm = Math.round((deltaCorrect / 5) / (dtSec / 60));
      this.perSecondWpm.push(Math.min(260, Math.max(0, instWpm)));
      this.lastSampleSec = elapsedSec;
      this.lastSampleCorrect = this.correctCount;
    }

    // Rolling 8s WPM
    const cutoff = now - 8000;
    while (this.rollingEvents.length > 0 && this.rollingEvents[0].ts < cutoff) {
      this.rollingEvents.shift();
    }
    const windowMs = Math.min(8000, Math.max(1200, elapsedMs));
    const rollingWpm =
      this.startTs !== null && elapsedMs > 350
        ? Math.round((this.rollingEvents.length / 5) / (windowMs / 60000))
        : 0;

    const totalKeys = this.correctCount + this.errorCount;
    const grossWpm =
      minutes > 0.015 ? Math.round((totalKeys / 5) / minutes) : 0;
    const netWpm =
      minutes > 0.015
        ? Math.max(0, Math.round((this.correctCount / 5) / minutes))
        : 0;
    const cpm = minutes > 0.015 ? Math.round(this.correctCount / minutes) : 0;
    const accuracy =
      totalKeys > 0
        ? Math.round((this.correctCount / totalKeys) * 1000) / 10
        : 100;

    return {
      netWpm,
      grossWpm,
      rollingWpm,
      cpm,
      accuracy,
      consistency: this.computeConsistency(),
      errors: this.errorCount,
      uncorrectedErrors: 0,
      typedChars: this.correctCount,
      totalChars: Math.max(this.correctCount, 1),
      elapsedMs,
      remainingMs: null,
      combo: this.combo,
      multiplier: this.getMultiplier(),
      wpmHistory: this.perSecondWpm.slice(-24),
      capsLock: this.capsLock,
      strictBlocked: false,
      started: this.startTs !== null,
      finished: this.finished,
      paused: this.paused,
      ghostProgress: 0,
      userProgress: Math.max(0, Math.min(1, progressFraction)),
      nextChar,
    };
  }

  private computeConsistency(): number {
    if (this.perSecondWpm.length < 3) return 100;
    const nonZero = this.perSecondWpm.filter((v) => v > 0);
    if (nonZero.length < 2) return 100;
    const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    if (mean <= 1) return 100;
    const variance =
      nonZero.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / nonZero.length;
    const cv = (Math.sqrt(variance) / mean) * 100;
    return Math.max(0, Math.min(100, Math.round(100 - cv)));
  }

  public finalize(
    subMode: string,
    scoreBonus: number,
    passed: boolean,
    passSummary: string,
  ): CompletedSessionStats {
    this.finished = true;
    const snap = this.getSnapshot(1, null);
    const totalKeys = this.correctCount + this.errorCount;
    const durationSec = Math.max(1, Math.round(snap.elapsedMs / 1000));

    const keyStats = Array.from(this.keyMap.values());
    const slowestKeys: SlowKeyMetric[] = keyStats
      .filter((k) => k.hits >= 2 && k.key.length === 1)
      .map((k) => ({
        key: k.key,
        avgMs: Math.round(k.totalLatencyMs / k.hits),
        errors: k.errors,
        hits: k.hits,
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5);

    const weakKeys = keyStats
      .filter((k) => k.key.length === 1 && (k.errors > 0 || k.hits >= 3))
      .sort(
        (a, b) =>
          b.errors * 80 +
          (b.hits ? b.totalLatencyMs / b.hits : 0) -
          (a.errors * 80 + (a.hits ? a.totalLatencyMs / a.hits : 0)),
      )
      .slice(0, 4)
      .map((k) => k.key);

    const stars: 1 | 2 | 3 =
      passed && snap.accuracy >= 95 && snap.netWpm >= 45
        ? 3
        : passed && snap.accuracy >= 88
          ? 2
          : 1;

    const xpEarned = Math.max(
      15,
      Math.round(
        this.wordsCompleted * 2.5 +
          snap.netWpm * 0.9 +
          scoreBonus * 0.02 +
          (passed ? 25 : 8),
      ),
    );

    return {
      mode: 'arcade',
      subMode,
      netWpm: snap.netWpm,
      grossWpm: snap.grossWpm,
      cpm: snap.cpm,
      accuracy: snap.accuracy,
      consistency: snap.consistency,
      errors: this.errorCount,
      uncorrectedErrors: 0,
      totalKeystrokes: totalKeys,
      correctKeystrokes: this.correctCount,
      durationSec,
      wordsTyped: Math.max(this.wordsCompleted, Math.round(this.correctCount / 5)),
      stars,
      xpEarned,
      isNewBest: snap.netWpm > this.previousBestWpm && snap.netWpm > 0,
      previousBestWpm: this.previousBestWpm,
      slowestKeys,
      weakKeys,
      wpmOverTime: snap.wpmHistory,
      textKind: 'words',
      passed,
      passRequirementText: passSummary,
      keyStats,
    };
  }
}
