import {
  ArcadeMetricsTracker,
  DIFFICULTY_META,
  type ArcadeDifficulty,
} from '@/src/components/arcade/arcadeTypes';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';

export interface TurboRacerConfig {
  targetWords: number;
  rivalWpms: [number, number, number];
}

export const TURBO_RACE_CONFIG: Record<ArcadeDifficulty, TurboRacerConfig> = {
  easy: {targetWords: 28, rivalWpms: [20, 26, 33]},
  medium: {targetWords: 40, rivalWpms: [36, 46, 56]},
  hard: {targetWords: 55, rivalWpms: [56, 68, 82]},
};

export interface TurboRacerRival {
  name: string;
  color: string;
  dist: number;
  targetWpm: number;
  lane: number;
}

export interface TurboRacerState {
  paused: boolean;
  finished: boolean;
  started: boolean;
  playerDist: number;
  boostTimer: number;
  rivals: TurboRacerRival[];
  wordIdx: number;
  typed: string;
  score: number;
  rank: number;
}

export interface TurboRacerKeyResult {
  handled: boolean;
  correct: boolean;
  combo: number;
  multiplier: number;
  completedWord: boolean;
  finishedResult: CompletedSessionStats | null;
}

export class TurboRacerEngine {
  public readonly difficulty: ArcadeDifficulty;
  public readonly cfg: TurboRacerConfig;
  public readonly wordSeq: string[];
  public readonly state: TurboRacerState;
  public readonly tracker: ArcadeMetricsTracker;
  private playedVisuals: '2d' | '3d';

  constructor(params: {
    difficulty: ArcadeDifficulty;
    wordPool: readonly string[];
    personalBestWpm?: number;
    seed?: number;
    playedVisuals?: '2d' | '3d';
  }) {
    this.difficulty = params.difficulty;
    this.cfg = TURBO_RACE_CONFIG[params.difficulty];
    this.playedVisuals = params.playedVisuals ?? '2d';
    this.tracker = new ArcadeMetricsTracker(params.personalBestWpm ?? 0);

    const safePool =
      params.wordPool.length > 0 ? params.wordPool : ['turbo', 'speed', 'track', 'glide'];
    const seedOffset = params.seed ?? 0;
    const seq: string[] = [];
    for (let i = 0; i < this.cfg.targetWords; i++) {
      seq.push(safePool[(i * 7 + seedOffset * 13) % safePool.length]);
    }
    this.wordSeq = seq;

    this.state = {
      paused: false,
      finished: false,
      started: false,
      playerDist: 0,
      boostTimer: 0,
      rivals: [
        {name: 'Bolt', color: '#F472B6', dist: 0, targetWpm: this.cfg.rivalWpms[0], lane: 0},
        {name: 'Nova', color: '#FBBF24', dist: 0, targetWpm: this.cfg.rivalWpms[1], lane: 1},
        {name: 'Apex', color: '#A78BFA', dist: 0, targetWpm: this.cfg.rivalWpms[2], lane: 3},
      ],
      wordIdx: 0,
      typed: '',
      score: 0,
      rank: 4,
    };
  }

  public setVisualsTag(visuals: '2d' | '3d'): void {
    this.playedVisuals = visuals;
  }

  public setPaused(paused: boolean, nowMs = performance.now()): void {
    this.state.paused = paused;
    this.tracker.setPaused(paused, nowMs);
  }

  public start(nowMs = performance.now()): void {
    this.state.started = true;
    this.tracker.startIfNeeded(nowMs);
  }

  public getExpectedChar(): string | null {
    const word = this.wordSeq[this.state.wordIdx];
    if (!word) return null;
    return this.state.typed.length < word.length ? word[this.state.typed.length] : ' ';
  }

  public handleKey(key: string, nowMs = performance.now()): TurboRacerKeyResult {
    const st = this.state;
    if (st.finished || st.paused) {
      return {
        handled: false,
        correct: false,
        combo: 0,
        multiplier: 1,
        completedWord: false,
        finishedResult: null,
      };
    }

    const currentWord = this.wordSeq[st.wordIdx];
    if (!currentWord) {
      return {
        handled: false,
        correct: false,
        combo: 0,
        multiplier: 1,
        completedWord: false,
        finishedResult: null,
      };
    }

    const nextExpected =
      st.typed.length < currentWord.length ? currentWord[st.typed.length] : ' ';
    st.started = true;

    if (key === nextExpected) {
      const {combo, multiplier} = this.tracker.recordKey(key, true, nowMs);
      const isLastCharOfFinalWord =
        st.typed.length + 1 === currentWord.length && st.wordIdx + 1 >= this.wordSeq.length;

      if (nextExpected === ' ' || isLastCharOfFinalWord) {
        this.tracker.recordWordCompleted();
        st.wordIdx++;
        st.typed = '';
        st.boostTimer = 0.45;
        st.score += 100 * multiplier;
        st.playerDist = (st.wordIdx / this.wordSeq.length) * 1000;

        let finishedResult: CompletedSessionStats | null = null;
        if (st.wordIdx >= this.wordSeq.length && !st.finished) {
          st.finished = true;
          const rank = st.rank;
          const summary = `Finished in ${
            rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : '4th'
          } place (${DIFFICULTY_META[this.difficulty].label})`;
          finishedResult = {
            ...this.tracker.finalize(
              `Arcade · Turbo Racer (${DIFFICULTY_META[this.difficulty].label})`,
              st.score + (rank === 1 ? 300 : 0),
              rank <= 2,
              summary,
              nowMs,
            ),
            playedVisuals: this.playedVisuals,
          };
        }

        return {
          handled: true,
          correct: true,
          combo,
          multiplier,
          completedWord: true,
          finishedResult,
        };
      }

      st.typed = st.typed + key;
      st.score += 12 * multiplier;
      return {
        handled: true,
        correct: true,
        combo,
        multiplier,
        completedWord: false,
        finishedResult: null,
      };
    }

    this.tracker.recordKey(nextExpected, false, nowMs);
    return {
      handled: true,
      correct: false,
      combo: 0,
      multiplier: this.tracker.getMultiplier(),
      completedWord: false,
      finishedResult: null,
    };
  }

  public step(dtSec: number): void {
    const st = this.state;
    if (st.paused || st.finished || !st.started) return;

    const trackCharsTotal = Math.max(120, this.cfg.targetWords * 5.2);
    const distPerChar = 1000 / trackCharsTotal;
    for (const rival of st.rivals) {
      const charsPerSec = (rival.targetWpm * 5) / 60;
      rival.dist = Math.min(995, rival.dist + charsPerSec * distPerChar * dtSec);
    }

    const activeWord = this.wordSeq[st.wordIdx];
    const partialWord = activeWord?.length ? st.typed.length / activeWord.length : 0;
    const targetDist =
      ((st.wordIdx + partialWord * 0.9) / Math.max(1, this.wordSeq.length)) * 1000;
    st.playerDist += (targetDist - st.playerDist) * Math.min(1, dtSec * 12);

    if (st.boostTimer > 0) {
      st.boostTimer = Math.max(0, st.boostTimer - dtSec);
    }

    const ahead = st.rivals.filter((r) => r.dist > st.playerDist).length;
    st.rank = ahead + 1;
  }

  public getTelemetrySnapshot(nowMs = performance.now()): TypingTelemetrySnapshot {
    const curWord = this.wordSeq[this.state.wordIdx] ?? '';
    const nextChar =
      this.state.typed.length < curWord.length
        ? curWord[this.state.typed.length]
        : curWord
          ? ' '
          : null;
    return this.tracker.getSnapshot(
      this.wordSeq.length > 0 ? this.state.wordIdx / this.wordSeq.length : 0,
      nextChar,
      nowMs,
    );
  }
}
