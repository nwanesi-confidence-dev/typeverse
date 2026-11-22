import {
  ArcadeMetricsTracker,
  DIFFICULTY_META,
  type ArcadeDifficulty,
} from '@/src/components/arcade/arcadeTypes';
import {createSeededRng, pickFromRng} from '@/src/arcade/engine/prng';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';

export const WORD_RAIN_FIELD_HEIGHT = 360;

export interface WordRainConfig {
  speed: number;
  interval: number;
  maxDrops: number;
  goal: number;
}

export const WORD_RAIN_CFG: Record<ArcadeDifficulty, WordRainConfig> = {
  easy: {speed: 22, interval: 2.5, maxDrops: 4, goal: 22},
  medium: {speed: 34, interval: 2.0, maxDrops: 5, goal: 32},
  hard: {speed: 48, interval: 1.5, maxDrops: 6, goal: 42},
};

export interface RaindropEntity {
  id: number;
  word: string;
  typed: number;
  x: number;
  y: number;
  speed: number;
  golden: boolean;
}

export interface WordRainRippleEvent {
  xNorm: number;
  yPx?: number;
  golden: boolean;
  missed: boolean;
}

export interface WordRainState {
  paused: boolean;
  finished: boolean;
  started: boolean;
  lives: number;
  clears: number;
  score: number;
  nextId: number;
  lockedId: number | null;
  spawnTimer: number;
  drops: RaindropEntity[];
  pendingRipples3D: WordRainRippleEvent[];
}

export interface WordRainKeyResult {
  handled: boolean;
  correct: boolean;
  combo: number;
  multiplier: number;
  completedWord: boolean;
  clearedEvent?: WordRainRippleEvent;
  finishedResult: CompletedSessionStats | null;
}

export interface WordRainStepResult {
  missedEvents: WordRainRippleEvent[];
  finishedResult: CompletedSessionStats | null;
}

export class WordRainEngine {
  public readonly difficulty: ArcadeDifficulty;
  public readonly cfg: WordRainConfig;
  public readonly wordPool: readonly string[];
  public readonly state: WordRainState;
  public readonly tracker: ArcadeMetricsTracker;
  public readonly rng: () => number;
  private playedVisuals: '2d' | '3d';

  constructor(params: {
    difficulty: ArcadeDifficulty;
    wordPool: readonly string[];
    personalBestWpm?: number;
    seed?: number;
    playedVisuals?: '2d' | '3d';
  }) {
    this.difficulty = params.difficulty;
    this.cfg = WORD_RAIN_CFG[params.difficulty];
    this.wordPool =
      params.wordPool.length > 0 ? params.wordPool : ['mist', 'cloud', 'river', 'calm'];
    this.playedVisuals = params.playedVisuals ?? '2d';
    this.tracker = new ArcadeMetricsTracker(params.personalBestWpm ?? 0);
    this.rng = createSeededRng(params.seed ?? 202);

    this.state = {
      paused: false,
      finished: false,
      started: false,
      lives: 5,
      clears: 0,
      score: 0,
      nextId: 1,
      lockedId: null,
      spawnTimer: 0.4,
      drops: [],
      pendingRipples3D: [],
    };

    this.spawnDrop();
    this.spawnDrop();
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

  public spawnDrop(): RaindropEntity {
    const st = this.state;
    const golden = st.nextId % 6 === 0;
    const used = new Set(st.drops.map((d) => d.word[0]));
    const filtered = this.wordPool.filter((w) => !used.has(w[0]));
    const choices = filtered.length > 0 ? filtered : this.wordPool;
    const word = pickFromRng(this.rng, choices);

    const drop: RaindropEntity = {
      id: st.nextId++,
      word,
      typed: 0,
      x: 0.14 + this.rng() * 0.72,
      y: 28,
      speed: this.cfg.speed * (0.9 + this.rng() * 0.25),
      golden,
    };
    st.drops.push(drop);
    return drop;
  }

  public handleKey(rawKey: string, nowMs = performance.now()): WordRainKeyResult {
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

    const key = rawKey.toLowerCase();
    st.started = true;

    let target = st.drops.find((d) => d.id === st.lockedId);
    if (!target) {
      const matches = st.drops
        .filter((d) => d.word[0]?.toLowerCase() === key)
        .sort((a, b) => b.y - a.y);
      target = matches[0];
      if (target) st.lockedId = target.id;
    }

    if (!target) {
      this.tracker.recordKey(key, false, nowMs);
      return {
        handled: true,
        correct: false,
        combo: 0,
        multiplier: this.tracker.getMultiplier(),
        completedWord: false,
        finishedResult: null,
      };
    }

    const expected = target.word[target.typed]?.toLowerCase();
    if (key === expected) {
      const {combo, multiplier} = this.tracker.recordKey(key, true, nowMs);
      target.typed++;

      if (target.typed >= target.word.length) {
        this.tracker.recordWordCompleted();
        st.clears++;
        st.score += (target.golden ? 220 : 90) * multiplier;
        if (target.golden && st.lives < 5) st.lives++;

        const clearedEvent: WordRainRippleEvent = {
          xNorm: target.x,
          yPx: target.y,
          golden: target.golden,
          missed: false,
        };
        if (st.pendingRipples3D.length < 10) {
          st.pendingRipples3D.push({
            xNorm: target.x,
            golden: target.golden,
            missed: false,
          });
        }

        st.lockedId = null;
        st.drops = st.drops.filter((d) => d.id !== target!.id);

        let finishedResult: CompletedSessionStats | null = null;
        if (st.clears >= this.cfg.goal && !st.finished) {
          st.finished = true;
          finishedResult = {
            ...this.tracker.finalize(
              `Arcade · Word Rain (${DIFFICULTY_META[this.difficulty].label})`,
              st.score,
              true,
              `Cleared all ${this.cfg.goal} raindrops (${st.score} pts)`,
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
          clearedEvent,
          finishedResult,
        };
      }

      return {
        handled: true,
        correct: true,
        combo,
        multiplier,
        completedWord: false,
        finishedResult: null,
      };
    }

    this.tracker.recordKey(expected ?? key, false, nowMs);
    return {
      handled: true,
      correct: false,
      combo: 0,
      multiplier: this.tracker.getMultiplier(),
      completedWord: false,
      finishedResult: null,
    };
  }

  public step(
    dtSec: number,
    fieldHeight = WORD_RAIN_FIELD_HEIGHT,
    nowMs = performance.now(),
  ): WordRainStepResult {
    const st = this.state;
    if (st.paused || st.finished || !st.started) {
      return {missedEvents: [], finishedResult: null};
    }

    const missedEvents: WordRainRippleEvent[] = [];
    let finishedResult: CompletedSessionStats | null = null;

    st.spawnTimer -= dtSec;
    if (st.spawnTimer <= 0 && st.drops.length < this.cfg.maxDrops) {
      this.spawnDrop();
      st.spawnTimer = this.cfg.interval;
    }

    for (let i = st.drops.length - 1; i >= 0; i--) {
      const d = st.drops[i];
      d.y += d.speed * dtSec;
      if (d.y >= fieldHeight - 34) {
        st.drops.splice(i, 1);
        if (st.lockedId === d.id) st.lockedId = null;
        st.lives--;
        const ev: WordRainRippleEvent = {
          xNorm: d.x,
          yPx: fieldHeight - 26,
          golden: false,
          missed: true,
        };
        missedEvents.push(ev);
        if (st.pendingRipples3D.length < 10) {
          st.pendingRipples3D.push({xNorm: d.x, golden: false, missed: true});
        }

        if (st.lives <= 0 && !st.finished) {
          st.finished = true;
          finishedResult = {
            ...this.tracker.finalize(
              `Arcade · Word Rain (${DIFFICULTY_META[this.difficulty].label})`,
              st.score,
              false,
              `Out of drops at ${st.clears}/${this.cfg.goal} words`,
              nowMs,
            ),
            playedVisuals: this.playedVisuals,
          };
          break;
        }
      }
    }

    return {missedEvents, finishedResult};
  }

  public getTelemetrySnapshot(nowMs = performance.now()): TypingTelemetrySnapshot {
    const locked = this.state.drops.find((d) => d.id === this.state.lockedId);
    const nextChar = locked
      ? locked.word[locked.typed] ?? null
      : this.state.drops[0]?.word[0] ?? null;
    return this.tracker.getSnapshot(
      this.state.clears / this.cfg.goal,
      nextChar,
      nowMs,
    );
  }
}
