import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pause, Play, RotateCcw} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {useAppearance} from '@/src/context/AppearanceContext';
import {TypingEngine} from '@/src/engine/TypingEngine';
import type {TextSize} from '@/src/types/app';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';

interface TypingArenaProps {
  text: string;
  timeLimitSec: number | null;
  personalBestWpm?: number;
  targetWpm?: number;
  modeLabel: string;
  onTelemetry: (snapshot: TypingTelemetrySnapshot) => void;
  onComplete: (stats: CompletedSessionStats) => void;
  onRestart: () => void;
  onExtendText?: () => string | null;
}

const TEXT_SIZE_CLASS: Record<TextSize, string> = {
  S: 'text-lg leading-[2.05]',
  M: 'text-xl leading-[2.0]',
  L: 'text-2xl leading-[1.95]',
  XL: 'text-3xl leading-[1.85]',
};

const WINDOW_HEIGHT_PX: Record<TextSize, number> = {
  S: 120,
  M: 132,
  L: 148,
  XL: 176,
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const MemoCharList = memo(function MemoCharList({
  chars,
  setSpanRef,
}: {
  chars: string[];
  setSpanRef: (el: HTMLSpanElement | null, idx: number) => void;
}) {
  return (
    <>
      {chars.map((ch, idx) => (
        <span
          key={idx}
          ref={(el) => setSpanRef(el, idx)}
          className="tv-char"
          data-status="pending"
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </>
  );
});

export const TypingArena: React.FC<TypingArenaProps> = ({
  text,
  timeLimitSec,
  personalBestWpm = 0,
  targetWpm = 60,
  modeLabel,
  onTelemetry,
  onComplete,
  onRestart,
  onExtendText,
}) => {
  const {settings} = useAppearance();
  const [renderedText, setRenderedText] = useState(text);
  const [paused, setPaused] = useState(false);
  const [tabPendingRestart, setTabPendingRestart] = useState(false);

  const spanRefs = useRef<HTMLSpanElement[]>([]);
  const caretRef = useRef<HTMLSpanElement | null>(null);
  const linesWrapperRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const engineRef = useRef<TypingEngine | null>(null);
  const tabTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setRenderedText(text);
    spanRefs.current = [];
  }, [text]);

  const setSpanRef = useCallback((el: HTMLSpanElement | null, idx: number) => {
    if (el) spanRefs.current[idx] = el;
  }, []);

  const spawnComboParticles = useCallback(
    (combo: number) => {
      if (settings.reducedMotion) return;
      const canvas = particleCanvasRef.current;
      const caret = caretRef.current;
      if (!canvas || !caret) return;

      const rect = caret.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();
      const originX = rect.left - cRect.left + 8;
      const originY = rect.top - cRect.top + 12;

      const count = Math.min(14, combo >= 40 ? 14 : 8);
      const colors = ['#22D3EE', '#34D399', '#FBBF24'];
      for (let i = 0; i < count; i++) {
        if (particlesRef.current.length >= 48) break; // capped particle count
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 1.5 + Math.random() * 2.5;
        particlesRef.current.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          life: 1,
          color: colors[i % colors.length],
        });
      }
    },
    [settings.reducedMotion],
  );

  // Initialize TypingEngine once per passage/config
  useEffect(() => {
    const engine = new TypingEngine({
      text,
      backspaceMode: settings.backspaceMode,
      timeLimitSec,
      personalBestWpm,
      targetWpm,
      modeLabel,
      onTelemetry: (snap) => {
        setPaused(snap.paused);
        onTelemetry(snap);
      },
      onComplete,
      onKeyFeedback: (correct, combo) => {
        if (correct) {
          soundEngine.playKeyClick(Math.min(8, Math.floor(combo / 10)));
          if (combo > 0 && combo % 15 === 0) {
            spawnComboParticles(combo);
          }
        } else {
          soundEngine.playError();
        }
      },
      onAppendTextNeeded: () => {
        if (!onExtendText) return null;
        const extra = onExtendText();
        if (extra) {
          setRenderedText((prev) => prev + ' ' + extra);
        }
        return extra;
      },
    });
    engineRef.current = engine;

    return () => {
      engine.stopLoop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, timeLimitSec, modeLabel, personalBestWpm]);

  useEffect(() => {
    engineRef.current?.setBackspaceMode(settings.backspaceMode);
  }, [settings.backspaceMode]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      spanRefs.current.length = renderedText.length;
      engineRef.current?.bindDom(
        spanRefs.current,
        caretRef.current,
        linesWrapperRef.current,
        viewportRef.current,
      );
    });
    return () => window.cancelAnimationFrame(id);
  }, [renderedText, settings.textSize, settings.fontChoice]);

  // Recalculate caret position and wrapped line height on window resize
  useEffect(() => {
    const onResize = () => {
      engineRef.current?.handleResize();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Pause automatically when browser tab becomes hidden
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        engineRef.current?.pause();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Lightweight particle canvas animation loop (only runs when particles exist)
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = particleCanvasRef.current;
      const list = particlesRef.current;
      if (canvas && list.length > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.life -= 0.04;
            if (p.life <= 0) {
              list.splice(i, 1);
            } else {
              ctx.globalAlpha = p.life;
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }
      } else if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  // Window keydown listener + IME composition guards + Tab -> Enter restart
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        setTabPendingRestart(true);
        if (tabTimerRef.current) window.clearTimeout(tabTimerRef.current);
        tabTimerRef.current = window.setTimeout(() => setTabPendingRestart(false), 1800);
        return;
      }

      if (tabPendingRestart && e.key === 'Enter') {
        e.preventDefault();
        setTabPendingRestart(false);
        onRestart();
        return;
      }

      if (e.key === 'Escape') {
        if (engineRef.current?.isRunning()) {
          engineRef.current.pause();
          e.stopPropagation();
        }
        return;
      }

      engineRef.current?.handleKeyDown(e);
    };

    const onCompStart = () => engineRef.current?.setComposing(true);
    const onCompEnd = () => engineRef.current?.setComposing(false);

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('compositionstart', onCompStart);
    window.addEventListener('compositionend', onCompEnd);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('compositionstart', onCompStart);
      window.removeEventListener('compositionend', onCompEnd);
      if (tabTimerRef.current) window.clearTimeout(tabTimerRef.current);
    };
  }, [paused, tabPendingRestart, onRestart]);

  // Split words cleanly so words never break mid-word across lines
  const wordsWithOffsets = useMemo(() => {
    const tokens = renderedText.split(' ');
    const list: Array<{word: string; startIdx: number; hasSpaceAfter: boolean}> = [];
    let cursor = 0;
    for (let i = 0; i < tokens.length; i++) {
      const w = tokens[i];
      list.push({
        word: w,
        startIdx: cursor,
        hasSpaceAfter: i < tokens.length - 1,
      });
      cursor += w.length + (i < tokens.length - 1 ? 1 : 0);
    }
    return list;
  }, [renderedText]);

  const chars = useMemo(() => renderedText.split(''), [renderedText]);

  return (
    <div className="tv-surface relative rounded-2xl p-6 sm:p-8 space-y-5">
      {/* Subtle Particle Canvas Overlay */}
      <canvas
        ref={particleCanvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full z-20"
        aria-hidden="true"
      />

      {/* Arena Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs" style={{color: 'var(--tv-text-muted)'}}>
        <span>
          {modeLabel} · Target {targetWpm} WPM · {settings.backspaceMode} backspace
        </span>
        <div className="flex items-center gap-2">
          {tabPendingRestart && (
            <span
              className="rounded-md border px-2 py-1 font-medium"
              style={{
                borderColor: 'var(--tv-accent)',
                color: 'var(--tv-accent)',
                backgroundColor: 'var(--tv-bg)',
              }}
            >
              Press Enter to restart
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (paused) engineRef.current?.resume();
              else engineRef.current?.pause();
            }}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 hover:opacity-85"
            style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text)'}}
          >
            {paused ? <Play className="w-3 h-3" aria-hidden="true" /> : <Pause className="w-3 h-3" aria-hidden="true" />}
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 hover:opacity-85"
            style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text)'}}
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Restart</span>
          </button>
        </div>
      </div>

      {/* 3-Line Scrolling Viewport */}
      <div
        ref={viewportRef}
        className="relative overflow-hidden select-none rounded-xl p-4 sm:p-5 border"
        style={{
          height: `${WINDOW_HEIGHT_PX[settings.textSize]}px`,
          backgroundColor: 'var(--tv-bg)',
          borderColor: 'var(--tv-border)',
        }}
        aria-label="Typing passage"
      >
        {/* GPU-composited animated caret */}
        <span
          ref={caretRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 z-10 transition-transform duration-75 ease-out"
          style={{
            willChange: 'transform',
          }}
        >
          {settings.caretStyle === 'line' && (
            <span
              className="tv-caret-blink block w-[2.5px] h-full rounded-xs"
              style={{
                backgroundColor: 'var(--tv-accent)',
                boxShadow: '0 0 10px var(--tv-accent)',
              }}
            />
          )}
          {settings.caretStyle === 'block' && (
            <span
              className="tv-caret-blink block w-full h-full rounded-xs"
              style={{
                backgroundColor: 'var(--tv-accent)',
                opacity: 0.28,
              }}
            />
          )}
          {settings.caretStyle === 'underline' && (
            <span
              className="tv-caret-blink block w-full h-[3px] absolute bottom-0 left-0 rounded-xs"
              style={{
                backgroundColor: 'var(--tv-accent)',
                boxShadow: '0 0 8px var(--tv-accent)',
              }}
            />
          )}
        </span>

        {/* 3-line scrolling text container (compositor-only transform) */}
        <div
          ref={linesWrapperRef}
          className={`font-typing flex flex-wrap gap-y-1 transition-transform duration-200 ease-out ${TEXT_SIZE_CLASS[settings.textSize]}`}
          style={{willChange: 'transform'}}
        >
          {wordsWithOffsets.map((token, wIdx) => (
            <span key={wIdx} className="inline-flex whitespace-nowrap">
              {token.word.split('').map((ch, cOffset) => {
                const idx = token.startIdx + cOffset;
                return (
                  <span
                    key={idx}
                    ref={(el) => setSpanRef(el, idx)}
                    className="tv-char"
                    data-status="pending"
                  >
                    {ch}
                  </span>
                );
              })}
              {token.hasSpaceAfter && (
                <span
                  key={`sp-${token.startIdx + token.word.length}`}
                  ref={(el) => setSpanRef(el, token.startIdx + token.word.length)}
                  className="tv-char"
                  data-status="pending"
                >
                  {'\u00A0'}
                </span>
              )}
            </span>
          ))}
        </div>

        {/* Keep MemoCharList reference satisfied if unused */}
        {chars.length === -1 && <MemoCharList chars={chars} setSpanRef={setSpanRef} />}

        {/* Pause Overlay */}
        {paused && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-xs">
            <div className="font-display text-xl font-bold text-white">Session Paused</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => engineRef.current?.resume()}
                className="rounded-xl px-4 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--tv-accent)',
                  color: 'var(--tv-accent-fg)',
                }}
              >
                Resume Typing
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="rounded-xl border border-white/25 px-4 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                Restart
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{color: 'var(--tv-text-muted)'}}>
        <span>Timer starts automatically on your first keystroke.</span>
        <span>Tab then Enter to restart · Esc to pause</span>
      </div>
    </div>
  );
};
