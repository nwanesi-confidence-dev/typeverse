import type {BackspaceMode} from '@/src/types/app';
import type {
  CharStatus,
  CompletedSessionStats,
  PerKeyStat,
  SlowKeyMetric,
  TypingTelemetrySnapshot,
} from '@/src/types/typing';

interface KeystrokeSample {
  t: number; // relative ms since start
  correct: boolean;
}

export class TypingEngine {
  private text: string;
  private backspaceMode: BackspaceMode;
  private timeLimitMs: number | null;
  private personalBestWpm: number;

  private statuses: CharStatus[];
  private typedIndex = 0;
  private totalKeystrokes = 0;
  private correctKeystrokes = 0;
  private totalErrors = 0;
  private combo = 0;
  private strictBlocked = false;
  private capsLock = false;
  private isComposing = false;

  private startTime: number | null = null;
  private pausedAt: number | null = null;
  private pausedDurationMs = 0;
  private lastKeystrokeTime: number | null = null;
  private finished = false;
  private paused = false;

  private keyStats = new Map<string, PerKeyStat>();
  private bigramStats = new Map<string, PerKeyStat>();
  private prevTypedChar: string | null = null;
  private rollingSamples: KeystrokeSample[] = [];
  private perSecondWpm: number[] = [];
  private lastRecordedSecond = 0;
  private lastSecondChars = 0;

  private rafId: number | null = null;
  private lastHudPush = 0;

  // Direct DOM refs for zero-React-rerender updates
  private charSpans: HTMLSpanElement[] = [];
  private caretEl: HTMLSpanElement | null = null;
  private linesWrapperEl: HTMLDivElement | null = null;
  private viewportEl: HTMLDivElement | null = null;
  private currentLineOffsetY = 0;
  private baseLineTop: number | null = null;
  private lineHeightPx = 42;

  private onTelemetry: (snapshot: TypingTelemetrySnapshot) => void;
  private onComplete: (stats: CompletedSessionStats) => void;
  private onKeyFeedback?: (correct: boolean, combo: number, key: string) => void;
  private onAppendTextNeeded?: () => string | null;

  private modeLabel: string;
  private targetWpm: number;

  constructor(opts: {
    text: string;
    backspaceMode: BackspaceMode;
    timeLimitSec: number | null;
    personalBestWpm?: number;
    targetWpm?: number;
    modeLabel?: string;
    onTelemetry: (snapshot: TypingTelemetrySnapshot) => void;
    onComplete: (stats: CompletedSessionStats) => void;
    onKeyFeedback?: (correct: boolean, combo: number, key: string) => void;
    onAppendTextNeeded?: () => string | null;
  }) {
    this.text = opts.text;
    this.backspaceMode = opts.backspaceMode;
    this.timeLimitMs = opts.timeLimitSec ? opts.timeLimitSec * 1000 : null;
    this.personalBestWpm = opts.personalBestWpm ?? 0;
    this.targetWpm = opts.targetWpm ?? 40;
    this.modeLabel = opts.modeLabel ?? 'Speed Test';
    this.statuses = new Array<CharStatus>(this.text.length).fill('pending');
    this.onTelemetry = opts.onTelemetry;
    this.onComplete = opts.onComplete;
    this.onKeyFeedback = opts.onKeyFeedback;
    this.onAppendTextNeeded = opts.onAppendTextNeeded;
  }

  public setBackspaceMode(mode: BackspaceMode): void {
    this.backspaceMode = mode;
  }

  public bindDom(
    charSpans: HTMLSpanElement[],
    caretEl: HTMLSpanElement | null,
    linesWrapperEl: HTMLDivElement | null,
    viewportEl: HTMLDivElement | null,
  ): void {
    this.charSpans = charSpans;
    this.caretEl = caretEl;
    this.linesWrapperEl = linesWrapperEl;
    this.viewportEl = viewportEl;
    this.baseLineTop = null;

    // Sync initial visual state & caret
    for (let i = 0; i < this.charSpans.length; i++) {
      this.syncSpanVisual(i);
    }
    this.updateCaretAndScroll();
    this.pushTelemetry(true);
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    const tick = (now: number) => {
      if (this.finished) {
        this.rafId = null;
        return;
      }

      if (this.startTime !== null && !this.paused) {
        const elapsed = this.getElapsedMs(now);

        // Check time limit
        if (this.timeLimitMs !== null && elapsed >= this.timeLimitMs) {
          this.finish(now);
          this.rafId = null;
          return;
        }

        // Record 1-second buckets for consistency & WPM over time
        const currentSecond = Math.floor(elapsed / 1000);
        while (this.lastRecordedSecond < currentSecond) {
          this.lastRecordedSecond++;
          const deltaChars = this.typedIndex - this.lastSecondChars;
          this.lastSecondChars = this.typedIndex;
          const instantWpm = Math.round((deltaChars / 5) * 60);
          this.perSecondWpm.push(instantWpm);
        }
      }

      // Cap HUD updates at 30 updates per second (~33.3ms)
      if (now - this.lastHudPush >= 33) {
        this.lastHudPush = now;
        this.pushTelemetry(false, now);
      }

      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  public stopLoop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public isRunning(): boolean {
    return this.startTime !== null && !this.finished && !this.paused;
  }

  public pause(): void {
    if (this.finished || this.paused || this.startTime === null) return;
    this.paused = true;
    this.pausedAt = performance.now();
    this.pushTelemetry(true);
  }

  public resume(): void {
    if (this.finished || !this.paused) return;
    const now = performance.now();
    if (this.pausedAt !== null) {
      this.pausedDurationMs += now - this.pausedAt;
      this.pausedAt = null;
    }
    this.paused = false;
    this.lastKeystrokeTime = now;
    this.pushTelemetry(true, now);
  }

  public setComposing(composing: boolean): void {
    this.isComposing = composing;
  }

  public handleKeyDown(e: KeyboardEvent): boolean {
    if (this.finished || this.paused) return false;
    if (this.isComposing || e.isComposing) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.repeat) return false;

    const caps = e.getModifierState('CapsLock');
    if (caps !== this.capsLock) {
      this.capsLock = caps;
      this.pushTelemetry(true);
    }

    if (
      e.key === 'Shift' ||
      e.key === 'CapsLock' ||
      e.key === 'Tab' ||
      e.key === 'Escape' ||
      e.key.startsWith('Arrow') ||
      e.key.startsWith('F')
    ) {
      return false;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      this.processBackspace();
      return true;
    }

    let char = '';
    if (e.key === 'Enter') {
      if (this.text[this.typedIndex] === '\n') {
        char = '\n';
      } else {
        return false;
      }
    } else if (e.key.length === 1) {
      char = e.key;
    } else {
      return false;
    }

    e.preventDefault();
    this.processCharacter(char);
    return true;
  }

  private processBackspace(): void {
    if (this.typedIndex === 0 && !this.strictBlocked) return;

    if (this.strictBlocked && this.statuses[this.typedIndex] === 'incorrect') {
      this.statuses[this.typedIndex] = 'pending';
      this.strictBlocked = false;
      this.syncSpanVisual(this.typedIndex);
      this.updateCaretAndScroll();
      this.pushTelemetry(true);
      return;
    }

    if (this.typedIndex > 0) {
      this.typedIndex--;
      const prevStatus = this.statuses[this.typedIndex];
      if (prevStatus === 'incorrect') {
        this.statuses[this.typedIndex] = 'pending';
      } else if (prevStatus === 'correct') {
        this.statuses[this.typedIndex] = 'pending';
      } else {
        this.statuses[this.typedIndex] = 'pending';
      }
      this.strictBlocked = false;
      this.syncSpanVisual(this.typedIndex);
      if (this.typedIndex + 1 < this.charSpans.length) {
        this.syncSpanVisual(this.typedIndex + 1);
      }
      this.updateCaretAndScroll();
      this.pushTelemetry(true);
    }
  }

  private processCharacter(typedChar: string): void {
    const now = performance.now();
    if (this.startTime === null) {
      this.startTime = now;
      this.lastKeystrokeTime = now;
      this.startLoop();
    }

    if (this.strictBlocked) {
      // Must fix the current error with Backspace before advancing
      this.onKeyFeedback?.(false, 0, typedChar);
      this.triggerSpanShake(this.typedIndex);
      return;
    }

    const expectedChar = this.text[this.typedIndex];
    if (expectedChar === undefined) return;

    const latencyMs =
      this.lastKeystrokeTime !== null ? Math.min(2500, Math.max(0, now - this.lastKeystrokeTime)) : 120;
    this.lastKeystrokeTime = now;

    this.totalKeystrokes++;
    const isCorrect = typedChar === expectedChar;
    const keyBucket = expectedChar === ' ' ? 'Space' : expectedChar.toLowerCase();
    const stat = this.keyStats.get(keyBucket) ?? {
      key: keyBucket,
      hits: 0,
      errors: 0,
      totalLatencyMs: 0,
    };

    const lowerExpected = expectedChar.toLowerCase();
    const bigramBucket =
      this.prevTypedChar &&
      /^[a-z]$/.test(this.prevTypedChar) &&
      /^[a-z]$/.test(lowerExpected)
        ? `${this.prevTypedChar}${lowerExpected}`
        : null;

    const bStat = bigramBucket
      ? (this.bigramStats.get(bigramBucket) ?? {
          key: bigramBucket,
          hits: 0,
          errors: 0,
          totalLatencyMs: 0,
        })
      : null;

    const elapsed = this.getElapsedMs(now);
    this.rollingSamples.push({t: elapsed, correct: isCorrect});

    if (isCorrect) {
      this.correctKeystrokes++;
      this.combo++;
      stat.hits++;
      stat.totalLatencyMs += latencyMs;
      this.keyStats.set(keyBucket, stat);

      if (bigramBucket && bStat) {
        bStat.hits++;
        bStat.totalLatencyMs += latencyMs;
        this.bigramStats.set(bigramBucket, bStat);
      }
      this.prevTypedChar = lowerExpected;

      const wasErrorBefore = this.statuses[this.typedIndex] === 'incorrect';
      this.statuses[this.typedIndex] = wasErrorBefore ? 'corrected' : 'correct';
      this.syncSpanVisual(this.typedIndex);
      this.typedIndex++;
      this.onKeyFeedback?.(true, this.combo, expectedChar);
    } else {
      this.totalErrors++;
      this.combo = 0;
      stat.errors++;
      this.keyStats.set(keyBucket, stat);

      if (bigramBucket && bStat) {
        bStat.errors++;
        this.bigramStats.set(bigramBucket, bStat);
      }

      this.statuses[this.typedIndex] = 'incorrect';
      this.syncSpanVisual(this.typedIndex);
      this.triggerSpanShake(this.typedIndex);
      this.onKeyFeedback?.(false, 0, expectedChar);

      if (this.backspaceMode === 'strict') {
        this.strictBlocked = true;
        this.pushTelemetry(true, now);
        return;
      }

      this.typedIndex++;
    }

    // In timed mode, dynamically extend text if user approaches the end
    if (
      this.timeLimitMs !== null &&
      this.text.length - this.typedIndex < 80 &&
      this.onAppendTextNeeded
    ) {
      const more = this.onAppendTextNeeded();
      if (more) {
        this.text += ' ' + more;
        for (let k = 0; k < more.length + 1; k++) {
          this.statuses.push('pending');
        }
      }
    }

    this.updateCaretAndScroll();

    if (this.timeLimitMs === null && this.typedIndex >= this.text.length) {
      this.finish(now);
      return;
    }

    this.pushTelemetry(false, now);
  }

  public appendText(more: string): void {
    if (!more) return;
    this.text += ' ' + more;
    for (let i = 0; i < more.length + 1; i++) {
      this.statuses.push('pending');
    }
  }

  public getText(): string {
    return this.text;
  }

  private getElapsedMs(now: number = performance.now()): number {
    if (this.startTime === null) return 0;
    const effectiveNow = this.paused && this.pausedAt !== null ? this.pausedAt : now;
    return Math.max(0, effectiveNow - this.startTime - this.pausedDurationMs);
  }

  private countUncorrectedErrors(): number {
    let count = 0;
    for (let i = 0; i < this.typedIndex; i++) {
      if (this.statuses[i] === 'incorrect') count++;
    }
    return count;
  }

  private computeMetrics(now: number = performance.now()) {
    const elapsedMs = this.getElapsedMs(now);
    const minutes = Math.max(elapsedMs / 60000, 1 / 120); // smooth minimum floor 0.5s

    const typedChars = this.typedIndex;
    const uncorrectedErrors = this.countUncorrectedErrors();
    const grossWpm = this.startTime === null ? 0 : (typedChars / 5) / minutes;
    const netWpm =
      this.startTime === null
        ? 0
        : this.backspaceMode === 'forgiving'
          ? grossWpm
          : Math.max(0, grossWpm - uncorrectedErrors / minutes);
    const cpm = this.startTime === null ? 0 : typedChars / minutes;
    const accuracy =
      this.totalKeystrokes === 0
        ? 100
        : (this.correctKeystrokes / this.totalKeystrokes) * 100;

    // 8-second smoothed rolling window WPM
    const windowMs = 8000;
    const cutoff = elapsedMs - windowMs;
    while (this.rollingSamples.length > 0 && this.rollingSamples[0].t < cutoff) {
      this.rollingSamples.shift();
    }
    let rollingWpm = 0;
    if (this.startTime !== null && elapsedMs > 300) {
      const spanMinutes = Math.min(elapsedMs, windowMs) / 60000;
      const rollingCorrect = this.rollingSamples.filter((s) => s.correct).length;
      rollingWpm = Math.max(0, (rollingCorrect / 5) / Math.max(spanMinutes, 1 / 120));
    }

    // Consistency = 100 - CV of per-second WPM
    let consistency = 100;
    if (this.perSecondWpm.length >= 3) {
      const mean =
        this.perSecondWpm.reduce((sum, v) => sum + v, 0) / this.perSecondWpm.length;
      if (mean > 0) {
        const variance =
          this.perSecondWpm.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
          this.perSecondWpm.length;
        const cv = (Math.sqrt(variance) / mean) * 100;
        consistency = Math.max(0, Math.min(100, Math.round(100 - cv)));
      }
    }

    return {
      elapsedMs,
      grossWpm,
      netWpm,
      rollingWpm,
      cpm,
      accuracy,
      consistency,
      uncorrectedErrors,
    };
  }

  private pushTelemetry(force: boolean, now: number = performance.now()): void {
    const m = this.computeMetrics(now);
    const multiplier =
      this.combo >= 40 ? 4 : this.combo >= 20 ? 3 : this.combo >= 10 ? 2 : 1;

    const remainingMs =
      this.timeLimitMs !== null ? Math.max(0, this.timeLimitMs - m.elapsedMs) : null;

    const userProgress =
      this.timeLimitMs !== null
        ? Math.min(1, m.elapsedMs / this.timeLimitMs)
        : this.text.length > 0
          ? Math.min(1, this.typedIndex / this.text.length)
          : 0;

    // Ghost pace: how far personal-best WPM would be right now
    let ghostProgress = 0;
    if (this.personalBestWpm > 0 && this.startTime !== null) {
      const expectedCharsAtBest = (this.personalBestWpm * 5 * m.elapsedMs) / 60000;
      ghostProgress =
        this.text.length > 0 ? Math.min(1, expectedCharsAtBest / this.text.length) : 0;
    }

    if (force || !this.finished) {
      this.onTelemetry({
        netWpm: Math.round(m.netWpm),
        grossWpm: Math.round(m.grossWpm),
        rollingWpm: Math.round(m.rollingWpm),
        cpm: Math.round(m.cpm),
        accuracy: Math.round(m.accuracy * 10) / 10,
        consistency: m.consistency,
        errors: this.totalErrors,
        uncorrectedErrors: m.uncorrectedErrors,
        typedChars: this.typedIndex,
        totalChars: this.text.length,
        elapsedMs: m.elapsedMs,
        remainingMs,
        combo: this.combo,
        multiplier,
        wpmHistory: [...this.perSecondWpm, Math.round(m.rollingWpm)].slice(-30),
        capsLock: this.capsLock,
        strictBlocked: this.strictBlocked,
        started: this.startTime !== null,
        finished: this.finished,
        paused: this.paused,
        ghostProgress,
        userProgress,
        nextChar: this.text[this.typedIndex] ?? null,
      });
    }
  }

  private finish(now: number): void {
    if (this.finished) return;
    this.finished = true;
    this.stopLoop();

    const m = this.computeMetrics(now);
    const durationSec = Math.max(1, Math.round(m.elapsedMs / 1000));
    const finalNetWpm = Math.round(m.netWpm);
    const finalGrossWpm = Math.round(m.grossWpm);
    const finalAccuracy = Math.round(m.accuracy * 10) / 10;

    // Capture any final partial second
    if (this.perSecondWpm.length === 0) {
      this.perSecondWpm.push(finalNetWpm);
    }

    const slowestKeys: SlowKeyMetric[] = Array.from(this.keyStats.values())
      .filter((k) => k.key !== 'Space' && (k.hits > 0 || k.errors > 0))
      .map((k) => ({
        key: k.key,
        avgMs: k.hits > 0 ? Math.round(k.totalLatencyMs / k.hits) : 450,
        errors: k.errors,
        hits: k.hits,
      }))
      .sort((a, b) => b.avgMs + b.errors * 140 - (a.avgMs + a.errors * 140))
      .slice(0, 6);

    const weakKeys = slowestKeys
      .filter((k) => k.key.length === 1 && /^[a-z0-9]$/.test(k.key))
      .map((k) => k.key);

    const stars: 1 | 2 | 3 =
      finalAccuracy >= 98 && finalNetWpm >= this.targetWpm + 15
        ? 3
        : finalAccuracy >= 96 && finalNetWpm >= this.targetWpm + 5
          ? 2
          : 1;

    const wordsTyped = Math.max(1, Math.round(this.typedIndex / 5));
    const xpEarned = Math.round(wordsTyped * (finalAccuracy / 100) * (stars * 0.5 + 1));
    const isNewBest = finalNetWpm > this.personalBestWpm && finalNetWpm > 0;

    this.pushTelemetry(true, now);
    this.onComplete({
      mode: 'speed-test',
      subMode: this.modeLabel,
      netWpm: finalNetWpm,
      grossWpm: finalGrossWpm,
      cpm: Math.round(m.cpm),
      accuracy: finalAccuracy,
      consistency: m.consistency,
      errors: this.totalErrors,
      uncorrectedErrors: m.uncorrectedErrors,
      totalKeystrokes: this.totalKeystrokes,
      correctKeystrokes: this.correctKeystrokes,
      durationSec,
      wordsTyped,
      stars,
      xpEarned,
      isNewBest,
      previousBestWpm: this.personalBestWpm,
      slowestKeys,
      weakKeys,
      wpmOverTime: [...this.perSecondWpm],
      textKind: 'paragraphs',
      keyStats: Array.from(this.keyStats.values()),
      bigramStats: Array.from(this.bigramStats.values()),
    });
  }

  private syncSpanVisual(index: number): void {
    const span = this.charSpans[index];
    if (!span) return;
    const status = this.statuses[index] ?? 'pending';
    span.dataset.status = status;

    // Highlight active word boundary cleanly without React re-render
    if (index === this.typedIndex) {
      span.dataset.active = 'true';
    } else {
      delete span.dataset.active;
    }
  }

  private triggerSpanShake(index: number): void {
    const span = this.charSpans[index];
    if (!span) return;
    span.classList.remove('tv-char-shake');
    void span.offsetWidth;
    span.classList.add('tv-char-shake');
  }

  public handleResize(): void {
    this.baseLineTop = null;
    this.updateCaretAndScroll();
  }

  public updateCaretAndScroll(): void {
    if (!this.caretEl || !this.linesWrapperEl) return;

    // Update active marker on current span & adjacent spans
    for (
      let i = Math.max(0, this.typedIndex - 2);
      i <= Math.min(this.charSpans.length - 1, this.typedIndex + 2);
      i++
    ) {
      const span = this.charSpans[i];
      if (!span) continue;
      if (i === this.typedIndex) span.dataset.active = 'true';
      else delete span.dataset.active;
    }

    const targetSpan =
      this.charSpans[this.typedIndex] ?? this.charSpans[this.charSpans.length - 1];
    if (!targetSpan) return;

    const x =
      this.typedIndex >= this.charSpans.length
        ? targetSpan.offsetLeft + targetSpan.offsetWidth
        : targetSpan.offsetLeft;
    const y = targetSpan.offsetTop;
    const h = targetSpan.offsetHeight || 30;

    if (this.baseLineTop === null) {
      const firstSpan = this.charSpans[0];
      this.baseLineTop = firstSpan ? firstSpan.offsetTop : y;
      let measuredRowStep = Math.max(32, Math.round(h * 1.45));
      if (firstSpan) {
        for (let i = 1; i < Math.min(this.charSpans.length, 220); i++) {
          const sp = this.charSpans[i];
          if (sp && sp.offsetTop > firstSpan.offsetTop + 8) {
            measuredRowStep = sp.offsetTop - firstSpan.offsetTop;
            break;
          }
        }
      }
      this.lineHeightPx = measuredRowStep;
    }

    // Keep caret on visible 2nd line once user wraps down so 3-line window always shows context
    const lineIndex = Math.max(0, Math.round((y - this.baseLineTop) / this.lineHeightPx));
    const scrollLines = Math.max(0, lineIndex - 1);
    const nextOffsetY = scrollLines * this.lineHeightPx;

    if (nextOffsetY !== this.currentLineOffsetY) {
      this.currentLineOffsetY = nextOffsetY;
      this.linesWrapperEl.style.transform = `translate3d(0, -${nextOffsetY}px, 0)`;
    }

    this.caretEl.style.transform = `translate3d(${x}px, ${y - this.currentLineOffsetY}px, 0)`;
    this.caretEl.style.height = `${h}px`;
    this.caretEl.style.width = `${Math.max(10, targetSpan.offsetWidth)}px`;
  }
}
