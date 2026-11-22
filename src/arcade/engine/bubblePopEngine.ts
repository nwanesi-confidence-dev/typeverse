import {
  ArcadeMetricsTracker,
  DIFFICULTY_META,
  type ArcadeDifficulty,
} from '@/src/components/arcade/arcadeTypes';
import {createSeededRng, pickFromRng} from '@/src/arcade/engine/prng';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';

export const BUBBLE_POP_FIELD_HEIGHT = 360;

export const BUBBLE_COLORS = [
  '#22D3EE',
  '#34D399',
  '#F472B6',
  '#FBBF24',
  '#A78BFA',
  '#60A5FA',
] as const;

export const BUBBLE_FOCUS_ROWS: Array<{id: string; label: string; chars: string}> = [
  {id: 'all', label: 'All Letters', chars: 'abcdefghijklmnopqrstuvwxyz'},
  {id: 'home', label: 'Home Row', chars: 'asdfghjkl'},
  {id: 'top', label: 'Top Row', chars: 'qwertyuiop'},
  {id: 'bottom', label: 'Bottom Row', chars: 'zxcvbnm'},
];

export interface BubblePopConfig {
  speed: number;
  interval: number;
  maxBubbles: number;
  goal: number;
  multiLetter: boolean;
}

export const BUBBLE_POP_CFG: Record<ArcadeDifficulty, BubblePopConfig> = {
  easy: {speed: 32, interval: 1.15, maxBubbles: 6, goal: 28, multiLetter: false},
  medium: {speed: 38, interval: 1.5, maxBubbles: 5, goal: 34, multiLetter: true},
  hard: {speed: 52, interval: 1.2, maxBubbles: 6, goal: 44, multiLetter: true},
};

export interface BubbleEntity {
  id: number;
  text: string;
  typed: number;
  x: number;
  baseX: number;
  y: number;
  speed: number;
  radius: number;
  color: string;
  phase: number;
}

export interface BubblePopBurstEvent {
  xNorm: number;
  yPx: number;
  color: string;
  radius: number;
}

export interface BubblePopState {
  paused: boolean;
  finished: boolean;
  started: boolean;
  lives: number;
  popped: number;
  score: number;
  nextId: number;
  lockedId: number | null;
  spawnTimer: number;
  bubbles: BubbleEntity[];
  pendingBursts3D: Array<{xNorm: number; yPx: number; color: string}>;
  clock: number;
}

export interface BubblePopKeyResult {
  handled: boolean;
  correct: boolean;
  combo: number;
  multiplier: number;
  popped: boolean;
  burstEvent?: BubblePopBurstEvent;
  finishedResult: CompletedSessionStats | null;
}

export interface BubblePopStepResult {
  escapedCount: number;
  finishedResult: CompletedSessionStats | null;
}

export class BubblePopEngine {
  public readonly difficulty: ArcadeDifficulty;
  public readonly cfg: BubblePopConfig;
  public readonly wordPool: readonly string[];
  public readonly focusRowId: string;
  public readonly state: BubblePopState;
  public readonly tracker: ArcadeMetricsTracker;
  public readonly rng: () => number;
  private playedVisuals: '2d' | '3d';

  constructor(params: {
    difficulty: ArcadeDifficulty;
    wordPool: readonly string[];
    focusRowId?: string;
    personalBestWpm?: number;
    seed?: number;
    playedVisuals?: '2d' | '3d';
  }) {
    this.difficulty = params.difficulty;
    this.cfg = BUBBLE_POP_CFG[params.difficulty];
    this.wordPool = params.wordPool;
    this.focusRowId = params.focusRowId ?? 'all';
    this.playedVisuals = params.playedVisuals ?? '2d';
    this.tracker = new ArcadeMetricsTracker(params.personalBestWpm ?? 0);
    this.rng = createSeededRng(params.seed ?? 303);

    this.state = {
      paused: false,
      finished: false,
      started: false,
      lives: 5,
      popped: 0,
      score: 0,
      nextId: 1,
      lockedId: null,
      spawnTimer: 0.2,
      bubbles: [],
      pendingBursts3D: [],
      clock: 0,
    };

    this.spawnBubble(BUBBLE_POP_FIELD_HEIGHT);
    this.spawnBubble(BUBBLE_POP_FIELD_HEIGHT);
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

  public spawnBubble(fieldHeight = BUBBLE_POP_FIELD_HEIGHT): BubbleEntity {
    const st = this.state;
    const row = BUBBLE_FOCUS_ROWS.find((r) => r.id === this.focusRowId) ?? BUBBLE_FOCUS_ROWS[0];
    let token = 'a';

    if (!this.cfg.multiLetter) {
      const used = new Set(st.bubbles.map((b) => b.text));
      const avail = row.chars.split('').filter((c) => !used.has(c));
      const list = avail.length > 0 ? avail : row.chars.split('');
      token = pickFromRng(this.rng, list);
    } else {
      const allowedSet = new Set(row.chars.split(''));
      const matching = this.wordPool.filter(
        (w) =>
          w.length >= 2 &&
          w.length <= (this.difficulty === 'medium' ? 4 : 6) &&
          w.split('').every((ch) => allowedSet.has(ch)),
      );
      if (matching.length > 0) {
        token = pickFromRng(this.rng, matching);
      } else {
        const len = this.difficulty === 'medium' ? 3 : 4;
        token = Array.from(
          {length: len},
          () => row.chars[Math.floor(this.rng() * row.chars.length)],
        ).join('');
      }
    }

    const bx = 0.14 + this.rng() * 0.72;
    const bubble: BubbleEntity = {
      id: st.nextId++,
      text: token,
      typed: 0,
      x: bx,
      baseX: bx,
      y: fieldHeight - 24,
      speed: this.cfg.speed * (0.85 + this.rng() * 0.3),
      radius: this.cfg.multiLetter ? 30 : 24,
      color: BUBBLE_COLORS[(st.nextId - 1) % BUBBLE_COLORS.length],
      phase: this.rng() * Math.PI * 2,
    };
    st.bubbles.push(bubble);
    return bubble;
  }

  public handleKey(rawKey: string, nowMs = performance.now()): BubblePopKeyResult {
    const st = this.state;
    if (st.finished || st.paused) {
      return {
        handled: false,
        correct: false,
        combo: 0,
        multiplier: 1,
        popped: false,
        finishedResult: null,
      };
    }

    const key = rawKey.toLowerCase();
    st.started = true;

    let target = st.bubbles.find((b) => b.id === st.lockedId);
    if (!target) {
      const matches = st.bubbles
        .filter((b) => b.text[0]?.toLowerCase() === key)
        .sort((a, b) => a.y - b.y);
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
        popped: false,
        finishedResult: null,
      };
    }

    const expected = target.text[target.typed]?.toLowerCase();
    if (key === expected) {
      const {combo, multiplier} = this.tracker.recordKey(key, true, nowMs);
      target.typed++;

      if (target.typed >= target.text.length) {
        this.tracker.recordWordCompleted();
        st.popped++;
        st.score += (this.cfg.multiLetter ? 110 : 60) * multiplier;

        const burstEvent: BubblePopBurstEvent = {
          xNorm: target.x,
          yPx: target.y,
          color: target.color,
          radius: target.radius,
        };
        if (st.pendingBursts3D.length < 10) {
          st.pendingBursts3D.push({
            xNorm: target.x,
            yPx: target.y,
            color: target.color,
          });
        }

        st.lockedId = null;
        st.bubbles = st.bubbles.filter((b) => b.id !== target!.id);

        let finishedResult: CompletedSessionStats | null = null;
        if (st.popped >= this.cfg.goal && !st.finished) {
          st.finished = true;
          finishedResult = {
            ...this.tracker.finalize(
              `Arcade · Bubble Pop (${DIFFICULTY_META[this.difficulty].label})`,
              st.score,
              true,
              `Popped all ${this.cfg.goal} bubbles (${st.score} pts)`,
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
          popped: true,
          burstEvent,
          finishedResult,
        };
      }

      return {
        handled: true,
        correct: true,
        combo,
        multiplier,
        popped: false,
        finishedResult: null,
      };
    }

    this.tracker.recordKey(expected ?? key, false, nowMs);
    return {
      handled: true,
      correct: false,
      combo: 0,
      multiplier: this.tracker.getMultiplier(),
      popped: false,
      finishedResult: null,
    };
  }

  public step(
    dtSec: number,
    fieldHeight = BUBBLE_POP_FIELD_HEIGHT,
    nowMs = performance.now(),
  ): BubblePopStepResult {
    const st = this.state;
    if (st.paused || st.finished || !st.started) {
      return {escapedCount: 0, finishedResult: null};
    }

    let escapedCount = 0;
    let finishedResult: CompletedSessionStats | null = null;

    st.clock += dtSec;
    st.spawnTimer -= dtSec;
    if (st.spawnTimer <= 0 && st.bubbles.length < this.cfg.maxBubbles) {
      this.spawnBubble(fieldHeight);
      st.spawnTimer = this.cfg.interval;
    }

    for (let i = st.bubbles.length - 1; i >= 0; i--) {
      const b = st.bubbles[i];
      b.y -= b.speed * dtSec;
      b.x = b.baseX + Math.sin(st.clock * 2 + b.phase) * 0.025;
      if (b.y <= 34) {
        st.bubbles.splice(i, 1);
        if (st.lockedId === b.id) st.lockedId = null;
        st.lives--;
        escapedCount++;
        if (st.lives <= 0 && !st.finished) {
          st.finished = true;
          finishedResult = {
            ...this.tracker.finalize(
              `Arcade · Bubble Pop (${DIFFICULTY_META[this.difficulty].label})`,
              st.score,
              false,
              `Bubbles escaped at ${st.popped}/${this.cfg.goal}`,
              nowMs,
            ),
            playedVisuals: this.playedVisuals,
          };
          break;
        }
      }
    }

    return {escapedCount, finishedResult};
  }

  public getTelemetrySnapshot(nowMs = performance.now()): TypingTelemetrySnapshot {
    const locked = this.state.bubbles.find((b) => b.id === this.state.lockedId);
    const nextChar = locked
      ? locked.text[locked.typed] ?? null
      : this.state.bubbles[0]?.text[0] ?? null;
    return this.tracker.getSnapshot(
      this.state.popped / this.cfg.goal,
      nextChar,
      nowMs,
    );
  }
}
