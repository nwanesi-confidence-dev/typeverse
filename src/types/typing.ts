import type {BackspaceMode, ContentKind, SceneId} from '@/src/types/app';

export type CharStatus = 'pending' | 'correct' | 'incorrect' | 'corrected';

export interface PerKeyStat {
  key: string;
  hits: number;
  errors: number;
  totalLatencyMs: number;
}

export interface TypingTelemetrySnapshot {
  netWpm: number;
  grossWpm: number;
  rollingWpm: number;
  cpm: number;
  accuracy: number;
  consistency: number;
  errors: number;
  uncorrectedErrors: number;
  typedChars: number;
  totalChars: number;
  elapsedMs: number;
  remainingMs: number | null;
  combo: number;
  multiplier: number;
  wpmHistory: number[];
  capsLock: boolean;
  strictBlocked: boolean;
  started: boolean;
  finished: boolean;
  paused: boolean;
  ghostProgress: number;
  userProgress: number;
  nextChar: string | null;
}

export interface SlowKeyMetric {
  key: string;
  avgMs: number;
  errors: number;
  hits: number;
}

export interface CompletedSessionStats {
  mode: SceneId;
  subMode: string;
  netWpm: number;
  grossWpm: number;
  cpm: number;
  accuracy: number;
  consistency: number;
  errors: number;
  uncorrectedErrors: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  durationSec: number;
  wordsTyped: number;
  stars: 1 | 2 | 3;
  xpEarned: number;
  isNewBest: boolean;
  previousBestWpm: number;
  slowestKeys: SlowKeyMetric[];
  weakKeys: string[];
  wpmOverTime: number[];
  textKind: ContentKind;
  passed?: boolean;
  passRequirementText?: string;
  playedVisuals?: '2d' | '3d';
  keyStats?: PerKeyStat[];
  bigramStats?: PerKeyStat[];
}

export interface TypingEngineConfig {
  text: string;
  backspaceMode: BackspaceMode;
  timeLimitSec: number | null; // null for word-count / completion mode
  targetWpm?: number;
  personalBestWpm?: number;
  onTelemetry: (snapshot: TypingTelemetrySnapshot) => void;
  onComplete: (stats: CompletedSessionStats) => void;
  onKeyFeedback?: (correct: boolean, combo: number, key: string) => void;
  onAppendTextNeeded?: () => string | null;
}
