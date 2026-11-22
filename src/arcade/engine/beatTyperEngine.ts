import {
  ArcadeMetricsTracker,
  DIFFICULTY_META,
  type ArcadeDifficulty,
} from '@/src/components/arcade/arcadeTypes';
import {createSeededRng, pickFromRng} from '@/src/arcade/engine/prng';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';

export const BEAT_TYPER_FIELD_HEIGHT = 360;

export const BEAT_LANE_CHARS: [string[], string[], string[], string[]] = [
  ['a', 's', 'd', 'q', 'w', 'z'],
  ['f', 'g', 'r', 't', 'v', 'c'],
  ['h', 'j', 'y', 'u', 'n', 'b'],
  ['k', 'l', 'i', 'o', 'p', 'm'],
];

export const BEAT_LANE_COLORS = ['#F472B6', '#34D399', '#22D3EE', '#A78BFA'] as const;

export interface BeatTyperConfig {
  bpm: number;
  noteSpeed: number;
  totalNotes: number;
}

export const BEAT_TYPER_CFG: Record<ArcadeDifficulty, BeatTyperConfig> = {
  easy: {bpm: 84, noteSpeed: 135, totalNotes: 32},
  medium: {bpm: 106, noteSpeed: 175, totalNotes: 44},
  hard: {bpm: 128, noteSpeed: 220, totalNotes: 60},
};

export interface BeatNoteEntity {
  id: number;
  lane: 0 | 1 | 2 | 3;
  keyChar: string;
  y: number;
  resolved: boolean;
}

export interface BeatHitSparkEvent {
  lane: 0 | 1 | 2 | 3;
  grade: 'perfect' | 'good' | 'miss';
}

export interface BeatTyperState {
  paused: boolean;
  finished: boolean;
  started: boolean;
  score: number;
  perfects: number;
  goods: number;
  misses: number;
  spawned: number;
  resolvedCount: number;
  beatTimer: number;
  beatCount: number;
  nextId: number;
  notes: BeatNoteEntity[];
  laneFlash: [number, number, number, number];
  pendingHits3D: BeatHitSparkEvent[];
  lastJudgement: '' | 'PERFECT!' | 'GOOD' | 'MISS';
}

export interface BeatTyperKeyResult {
  handled: boolean;
  grade: 'perfect' | 'good' | 'miss';
  lane?: 0 | 1 | 2 | 3;
  finishedResult: CompletedSessionStats | null;
}

export interface BeatTyperStepResult {
  beatTicked: boolean;
  accentBeat: boolean;
  missedNotes: Array<{lane: 0 | 1 | 2 | 3}>;
  finishedResult: CompletedSessionStats | null;
}

export class BeatTyperEngine {
  public readonly difficulty: ArcadeDifficulty;
  public readonly cfg: BeatTyperConfig;
  public readonly beatSec: number;
  public readonly state: BeatTyperState;
  public readonly tracker: ArcadeMetricsTracker;
  public readonly rng: () => number;
  private playedVisuals: '2d' | '3d';

  constructor(params: {
    difficulty: ArcadeDifficulty;
    personalBestWpm?: number;
    seed?: number;
    playedVisuals?: '2d' | '3d';
  }) {
    this.difficulty = params.difficulty;
    this.cfg = BEAT_TYPER_CFG[params.difficulty];
    this.beatSec = 60 / this.cfg.bpm;
    this.playedVisuals = params.playedVisuals ?? '2d';
    this.tracker = new ArcadeMetricsTracker(params.personalBestWpm ?? 0);
    this.rng = createSeededRng(params.seed ?? 404);

    this.state = {
      paused: false,
      finished: false,
      started: false,
      score: 0,
      perfects: 0,
      goods: 0,
      misses: 0,
      spawned: 0,
      resolvedCount: 0,
      beatTimer: 0.2,
      beatCount: 0,
      nextId: 1,
      notes: [],
      laneFlash: [0, 0, 0, 0],
      pendingHits3D: [],
      lastJudgement: '',
    };

    this.spawnNote();
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

  public spawnNote(): BeatNoteEntity | null {
    const st = this.state;
    if (st.spawned >= this.cfg.totalNotes) return null;
    const lane = ((st.spawned * 3 + Math.floor(this.rng() * 2)) % 4) as 0 | 1 | 2 | 3;
    const pool = BEAT_LANE_CHARS[lane];
    const keyChar = pickFromRng(this.rng, pool);
    const note: BeatNoteEntity = {
      id: st.nextId++,
      lane,
      keyChar,
      y: -16,
      resolved: false,
    };
    st.notes.push(note);
    st.spawned++;
    return note;
  }

  private finalizeResult(nowMs: number): CompletedSessionStats {
    const st = this.state;
    st.finished = true;
    return {
      ...this.tracker.finalize(
        `Arcade · Beat Typer (${DIFFICULTY_META[this.difficulty].label})`,
        st.score,
        st.misses <= Math.floor(this.cfg.totalNotes * 0.25),
        `${st.perfects} Perfect · ${st.goods} Good · ${st.misses} Miss`,
        nowMs,
      ),
      playedVisuals: this.playedVisuals,
    };
  }

  public handleKey(
    rawKey: string,
    fieldHeight = BEAT_TYPER_FIELD_HEIGHT,
    nowMs = performance.now(),
  ): BeatTyperKeyResult {
    const st = this.state;
    if (st.finished || st.paused) {
      return {handled: false, grade: 'miss', finishedResult: null};
    }

    const key = rawKey.toLowerCase();
    st.started = true;
    const strikeY = fieldHeight - 58;

    const candidates = st.notes
      .filter((n) => !n.resolved && n.keyChar === key && n.y >= 20)
      .sort((a, b) => Math.abs(a.y - strikeY) - Math.abs(b.y - strikeY));

    const note = candidates[0];
    if (!note) {
      this.tracker.recordKey(key, false, nowMs);
      return {handled: true, grade: 'miss', finishedResult: null};
    }

    const dist = Math.abs(note.y - strikeY);
    if (dist > 95) {
      this.tracker.recordKey(key, false, nowMs);
      return {handled: true, grade: 'miss', finishedResult: null};
    }

    note.resolved = true;
    st.resolvedCount++;
    const {multiplier} = this.tracker.recordKey(key, true, nowMs);
    this.tracker.recordWordCompleted();
    st.laneFlash[note.lane] = 1;

    const grade: 'perfect' | 'good' = dist <= 32 ? 'perfect' : 'good';
    if (grade === 'perfect') {
      st.perfects++;
      st.score += 150 * multiplier;
      st.lastJudgement = 'PERFECT!';
    } else {
      st.goods++;
      st.score += 90 * multiplier;
      st.lastJudgement = 'GOOD';
    }

    if (st.pendingHits3D.length < 12) {
      st.pendingHits3D.push({lane: note.lane, grade});
    }

    let finishedResult: CompletedSessionStats | null = null;
    if (st.resolvedCount >= this.cfg.totalNotes && !st.finished) {
      finishedResult = this.finalizeResult(nowMs);
    }

    return {
      handled: true,
      grade,
      lane: note.lane,
      finishedResult,
    };
  }

  public step(
    dtSec: number,
    fieldHeight = BEAT_TYPER_FIELD_HEIGHT,
    nowMs = performance.now(),
  ): BeatTyperStepResult {
    const st = this.state;

    for (let l = 0; l < 4; l++) {
      if (st.laneFlash[l] > 0) {
        st.laneFlash[l] = Math.max(0, st.laneFlash[l] - dtSec * 4);
      }
    }

    if (st.paused || st.finished || !st.started) {
      return {beatTicked: false, accentBeat: false, missedNotes: [], finishedResult: null};
    }

    let beatTicked = false;
    let accentBeat = false;
    const missedNotes: Array<{lane: 0 | 1 | 2 | 3}> = [];
    let finishedResult: CompletedSessionStats | null = null;

    st.beatTimer -= dtSec;
    if (st.beatTimer <= 0) {
      st.beatTimer += this.beatSec;
      st.beatCount++;
      beatTicked = true;
      accentBeat = st.beatCount % 4 === 0;
      if (st.spawned < this.cfg.totalNotes) {
        this.spawnNote();
      }
    }

    for (let i = st.notes.length - 1; i >= 0; i--) {
      const n = st.notes[i];
      if (n.resolved) {
        st.notes.splice(i, 1);
        continue;
      }
      n.y += this.cfg.noteSpeed * dtSec;
      if (n.y > fieldHeight - 14) {
        n.resolved = true;
        st.notes.splice(i, 1);
        st.resolvedCount++;
        st.misses++;
        st.lastJudgement = 'MISS';
        this.tracker.recordKey(n.keyChar, false, nowMs);
        missedNotes.push({lane: n.lane});
        if (st.pendingHits3D.length < 12) {
          st.pendingHits3D.push({lane: n.lane, grade: 'miss'});
        }

        if (st.resolvedCount >= this.cfg.totalNotes && !st.finished) {
          finishedResult = this.finalizeResult(nowMs);
          break;
        }
      }
    }

    return {beatTicked, accentBeat, missedNotes, finishedResult};
  }

  public getTelemetrySnapshot(nowMs = performance.now()): TypingTelemetrySnapshot {
    const nextNote = this.state.notes
      .filter((n) => !n.resolved)
      .sort((a, b) => b.y - a.y)[0];
    return this.tracker.getSnapshot(
      this.state.resolvedCount / this.cfg.totalNotes,
      nextNote?.keyChar ?? null,
      nowMs,
    );
  }
}
