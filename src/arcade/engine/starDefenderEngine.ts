import {
  ArcadeMetricsTracker,
  DIFFICULTY_META,
  type ArcadeDifficulty,
} from '@/src/components/arcade/arcadeTypes';
import {createSeededRng, pickFromRng} from '@/src/arcade/engine/prng';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';

export const STAR_DEFENDER_FIELD_HEIGHT = 360;

export interface DefenderConfig {
  baseSpeed: number;
  spawnInterval: number;
  maxActive: number;
  targetClears: number;
}

export const STAR_DEFENDER_CFG: Record<ArcadeDifficulty, DefenderConfig> = {
  easy: {baseSpeed: 28, spawnInterval: 2.35, maxActive: 4, targetClears: 22},
  medium: {baseSpeed: 40, spawnInterval: 1.85, maxActive: 5, targetClears: 30},
  hard: {baseSpeed: 56, spawnInterval: 1.4, maxActive: 6, targetClears: 40},
};

export interface AsteroidEntity {
  id: number;
  word: string;
  typed: number;
  x: number;
  y: number;
  speed: number;
  isBoss: boolean;
  radius: number;
}

export interface StarDefenderLaserEvent {
  xNorm: number;
  yNorm: number;
}

export interface StarDefenderExplosionEvent {
  xNorm: number;
  yNorm: number;
  isBoss: boolean;
}

export interface StarDefenderState {
  paused: boolean;
  finished: boolean;
  started: boolean;
  shields: number;
  score: number;
  clears: number;
  wave: number;
  spawnTimer: number;
  nextId: number;
  lockedId: number | null;
  asteroids: AsteroidEntity[];
  pendingLasers3D: StarDefenderLaserEvent[];
  pendingExplosions3D: StarDefenderExplosionEvent[];
}

export interface StarDefenderKeyResult {
  handled: boolean;
  correct: boolean;
  combo: number;
  multiplier: number;
  targetXNorm?: number;
  targetY?: number;
  destroyed: boolean;
  destroyedBoss: boolean;
  finishedResult: CompletedSessionStats | null;
}

export interface StarDefenderStepResult {
  shieldsLost: number;
  finishedResult: CompletedSessionStats | null;
}

export class StarDefenderEngine {
  public readonly difficulty: ArcadeDifficulty;
  public readonly cfg: DefenderConfig;
  public readonly wordPool: readonly string[];
  public readonly state: StarDefenderState;
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
    this.cfg = STAR_DEFENDER_CFG[params.difficulty];
    this.wordPool =
      params.wordPool.length > 0 ? params.wordPool : ['comet', 'orbit', 'nova', 'pulsar'];
    this.playedVisuals = params.playedVisuals ?? '2d';
    this.tracker = new ArcadeMetricsTracker(params.personalBestWpm ?? 0);
    this.rng = createSeededRng(params.seed ?? 101);

    this.state = {
      paused: false,
      finished: false,
      started: false,
      shields: 3,
      score: 0,
      clears: 0,
      wave: 1,
      spawnTimer: 0.25,
      nextId: 1,
      lockedId: null,
      asteroids: [],
      pendingLasers3D: [],
      pendingExplosions3D: [],
    };

    this.spawnAsteroid(false);
    this.spawnAsteroid(false);
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

  public spawnAsteroid(isBoss: boolean): AsteroidEntity {
    const st = this.state;
    const candidates = isBoss
      ? this.wordPool.filter((w) => w.length >= 7)
      : this.wordPool.filter((w) => w.length <= (this.difficulty === 'easy' ? 5 : 8));
    const list = candidates.length > 0 ? candidates : this.wordPool;
    const usedFirstLetters = new Set(st.asteroids.map((a) => a.word[0]));
    const distinct = list.filter((w) => !usedFirstLetters.has(w[0]));
    const chosenList = distinct.length > 0 ? distinct : list;
    const word = pickFromRng(this.rng, chosenList);

    const asteroid: AsteroidEntity = {
      id: st.nextId++,
      word,
      typed: 0,
      x: 0.14 + this.rng() * 0.72,
      y: 26,
      speed:
        (this.cfg.baseSpeed + (st.wave - 1) * 7) *
        (isBoss ? 0.68 : 0.9 + this.rng() * 0.25),
      isBoss,
      radius: isBoss ? 30 : 20,
    };
    st.asteroids.push(asteroid);
    return asteroid;
  }

  private finalizeResult(victory: boolean, nowMs: number): CompletedSessionStats {
    const st = this.state;
    st.finished = true;
    return {
      ...this.tracker.finalize(
        `Arcade · Star Defender (${DIFFICULTY_META[this.difficulty].label})`,
        st.score,
        victory,
        victory
          ? `Sector defended through Wave ${st.wave} (${st.score} pts)`
          : `Shields depleted at ${st.clears}/${this.cfg.targetClears} asteroids`,
        nowMs,
      ),
      playedVisuals: this.playedVisuals,
    };
  }

  public handleKey(rawKey: string, nowMs = performance.now()): StarDefenderKeyResult {
    const st = this.state;
    if (st.finished || st.paused) {
      return {
        handled: false,
        correct: false,
        combo: 0,
        multiplier: 1,
        destroyed: false,
        destroyedBoss: false,
        finishedResult: null,
      };
    }

    const key = rawKey.toLowerCase();
    st.started = true;

    let target = st.asteroids.find((a) => a.id === st.lockedId);
    if (!target) {
      const matches = st.asteroids
        .filter((a) => a.word[0]?.toLowerCase() === key)
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
        destroyed: false,
        destroyedBoss: false,
        finishedResult: null,
      };
    }

    const expected = target.word[target.typed]?.toLowerCase();
    if (key === expected) {
      const {combo, multiplier} = this.tracker.recordKey(key, true, nowMs);
      target.typed++;

      if (st.pendingLasers3D.length < 12) {
        st.pendingLasers3D.push({xNorm: target.x, yNorm: target.y});
      }

      const targetXNorm = target.x;
      const targetY = target.y;
      const wasBoss = target.isBoss;
      let destroyed = false;
      let finishedResult: CompletedSessionStats | null = null;

      if (target.typed >= target.word.length) {
        destroyed = true;
        this.tracker.recordWordCompleted();
        st.clears++;
        st.wave = 1 + Math.floor(st.clears / 8);
        st.score += (wasBoss ? 350 : 100) * multiplier;
        st.lockedId = null;

        if (st.pendingExplosions3D.length < 8) {
          st.pendingExplosions3D.push({
            xNorm: targetXNorm,
            yNorm: targetY,
            isBoss: wasBoss,
          });
        }

        st.asteroids = st.asteroids.filter((a) => a.id !== target!.id);

        if (st.clears >= this.cfg.targetClears) {
          finishedResult = this.finalizeResult(true, nowMs);
        } else if (st.clears % 8 === 0) {
          this.spawnAsteroid(true);
        }
      }

      return {
        handled: true,
        correct: true,
        combo,
        multiplier,
        targetXNorm,
        targetY,
        destroyed,
        destroyedBoss: wasBoss,
        finishedResult,
      };
    }

    this.tracker.recordKey(expected ?? key, false, nowMs);
    return {
      handled: true,
      correct: false,
      combo: 0,
      multiplier: this.tracker.getMultiplier(),
      destroyed: false,
      destroyedBoss: false,
      finishedResult: null,
    };
  }

  public step(
    dtSec: number,
    fieldHeight = STAR_DEFENDER_FIELD_HEIGHT,
    nowMs = performance.now(),
  ): StarDefenderStepResult {
    const st = this.state;
    if (st.paused || st.finished || !st.started) {
      return {shieldsLost: 0, finishedResult: null};
    }

    let shieldsLost = 0;
    let finishedResult: CompletedSessionStats | null = null;

    st.spawnTimer -= dtSec;
    if (st.spawnTimer <= 0 && st.asteroids.length < this.cfg.maxActive) {
      this.spawnAsteroid(false);
      st.spawnTimer = Math.max(0.85, this.cfg.spawnInterval - (st.wave - 1) * 0.14);
    }

    for (let i = st.asteroids.length - 1; i >= 0; i--) {
      const a = st.asteroids[i];
      a.y += a.speed * dtSec;
      if (a.y >= fieldHeight - 42) {
        st.asteroids.splice(i, 1);
        if (st.lockedId === a.id) st.lockedId = null;
        st.shields--;
        shieldsLost++;
        if (st.shields <= 0 && !st.finished) {
          finishedResult = this.finalizeResult(false, nowMs);
          break;
        }
      }
    }

    return {shieldsLost, finishedResult};
  }

  public getTelemetrySnapshot(nowMs = performance.now()): TypingTelemetrySnapshot {
    const locked = this.state.asteroids.find((a) => a.id === this.state.lockedId);
    const nextChar = locked
      ? locked.word[locked.typed] ?? null
      : this.state.asteroids[0]?.word[0] ?? null;
    return this.tracker.getSnapshot(
      this.state.clears / this.cfg.targetClears,
      nextChar,
      nowMs,
    );
  }
}
