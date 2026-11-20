import React, {useEffect, useMemo, useRef} from 'react';

export type FingerId =
  | 'l-pinky'
  | 'l-ring'
  | 'l-middle'
  | 'l-index'
  | 'thumb'
  | 'r-index'
  | 'r-middle'
  | 'r-ring'
  | 'r-pinky';

interface KeySpec {
  code: string;
  label: string;
  shiftLabel?: string;
  finger: FingerId;
  widthClass?: string;
  isHomeAnchor?: boolean;
}

const FINGER_LABEL: Record<FingerId, string> = {
  'l-pinky': 'Left Pinky',
  'l-ring': 'Left Ring',
  'l-middle': 'Left Middle',
  'l-index': 'Left Index',
  thumb: 'Thumb',
  'r-index': 'Right Index',
  'r-middle': 'Right Middle',
  'r-ring': 'Right Ring',
  'r-pinky': 'Right Pinky',
};

const FINGER_COLOR: Record<FingerId, string> = {
  'l-pinky': '#F472B6',
  'l-ring': '#FB923C',
  'l-middle': '#FBBF24',
  'l-index': '#34D399',
  thumb: '#94A3B8',
  'r-index': '#22D3EE',
  'r-middle': '#60A5FA',
  'r-ring': '#A78BFA',
  'r-pinky': '#F472B6',
};

const KEYBOARD_ROWS: KeySpec[][] = [
  [
    {code: '`', label: '`', shiftLabel: '~', finger: 'l-pinky'},
    {code: '1', label: '1', shiftLabel: '!', finger: 'l-pinky'},
    {code: '2', label: '2', shiftLabel: '@', finger: 'l-ring'},
    {code: '3', label: '3', shiftLabel: '#', finger: 'l-middle'},
    {code: '4', label: '4', shiftLabel: '$', finger: 'l-index'},
    {code: '5', label: '5', shiftLabel: '%', finger: 'l-index'},
    {code: '6', label: '6', shiftLabel: '^', finger: 'r-index'},
    {code: '7', label: '7', shiftLabel: '&', finger: 'r-index'},
    {code: '8', label: '8', shiftLabel: '*', finger: 'r-middle'},
    {code: '9', label: '9', shiftLabel: '(', finger: 'r-ring'},
    {code: '0', label: '0', shiftLabel: ')', finger: 'r-pinky'},
    {code: '-', label: '-', shiftLabel: '_', finger: 'r-pinky'},
    {code: '=', label: '=', shiftLabel: '+', finger: 'r-pinky'},
    {code: 'Backspace', label: 'Backspace', finger: 'r-pinky', widthClass: 'flex-[1.9]'},
  ],
  [
    {code: 'Tab', label: 'Tab', finger: 'l-pinky', widthClass: 'flex-[1.45]'},
    {code: 'q', label: 'Q', finger: 'l-pinky'},
    {code: 'w', label: 'W', finger: 'l-ring'},
    {code: 'e', label: 'E', finger: 'l-middle'},
    {code: 'r', label: 'R', finger: 'l-index'},
    {code: 't', label: 'T', finger: 'l-index'},
    {code: 'y', label: 'Y', finger: 'r-index'},
    {code: 'u', label: 'U', finger: 'r-index'},
    {code: 'i', label: 'I', finger: 'r-middle'},
    {code: 'o', label: 'O', finger: 'r-ring'},
    {code: 'p', label: 'P', finger: 'r-pinky'},
    {code: '[', label: '[', shiftLabel: '{', finger: 'r-pinky'},
    {code: ']', label: ']', shiftLabel: '}', finger: 'r-pinky'},
    {code: '\\', label: '\\', shiftLabel: '|', finger: 'r-pinky', widthClass: 'flex-[1.35]'},
  ],
  [
    {code: 'CapsLock', label: 'Caps', finger: 'l-pinky', widthClass: 'flex-[1.7]'},
    {code: 'a', label: 'A', finger: 'l-pinky'},
    {code: 's', label: 'S', finger: 'l-ring'},
    {code: 'd', label: 'D', finger: 'l-middle'},
    {code: 'f', label: 'F', finger: 'l-index', isHomeAnchor: true},
    {code: 'g', label: 'G', finger: 'l-index'},
    {code: 'h', label: 'H', finger: 'r-index'},
    {code: 'j', label: 'J', finger: 'r-index', isHomeAnchor: true},
    {code: 'k', label: 'K', finger: 'r-middle'},
    {code: 'l', label: 'L', finger: 'r-ring'},
    {code: ';', label: ';', shiftLabel: ':', finger: 'r-pinky'},
    {code: "'", label: "'", shiftLabel: '"', finger: 'r-pinky'},
    {code: 'Enter', label: 'Enter', finger: 'r-pinky', widthClass: 'flex-[2.05]'},
  ],
  [
    {code: 'ShiftLeft', label: 'Shift', finger: 'l-pinky', widthClass: 'flex-[2.25]'},
    {code: 'z', label: 'Z', finger: 'l-pinky'},
    {code: 'x', label: 'X', finger: 'l-ring'},
    {code: 'c', label: 'C', finger: 'l-middle'},
    {code: 'v', label: 'V', finger: 'l-index'},
    {code: 'b', label: 'B', finger: 'l-index'},
    {code: 'n', label: 'N', finger: 'r-index'},
    {code: 'm', label: 'M', finger: 'r-index'},
    {code: ',', label: ',', shiftLabel: '<', finger: 'r-middle'},
    {code: '.', label: '.', shiftLabel: '>', finger: 'r-ring'},
    {code: '/', label: '/', shiftLabel: '?', finger: 'r-pinky'},
    {code: 'ShiftRight', label: 'Shift', finger: 'r-pinky', widthClass: 'flex-[2.25]'},
  ],
  [
    {code: ' ', label: 'Space', finger: 'thumb', widthClass: 'flex-[6] max-w-[340px]'},
  ],
];

const SHIFT_CHAR_TO_KEY: Record<string, string> = {
  '~': '`',
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': '=',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
};

function resolveTargetKeys(nextChar: string | null): {
  keyCode: string | null;
  shiftSide: 'ShiftLeft' | 'ShiftRight' | null;
  finger: FingerId | null;
} {
  if (!nextChar) return {keyCode: null, shiftSide: null, finger: null};
  if (nextChar === ' ') return {keyCode: ' ', shiftSide: null, finger: 'thumb'};
  if (nextChar === '\n') return {keyCode: 'Enter', shiftSide: null, finger: 'r-pinky'};

  const mappedShiftBase = SHIFT_CHAR_TO_KEY[nextChar];
  const isUpperAlpha = /^[A-Z]$/.test(nextChar);
  const needsShift = Boolean(mappedShiftBase) || isUpperAlpha;
  const baseCode = mappedShiftBase ?? nextChar.toLowerCase();

  let foundFinger: FingerId | null = null;
  for (const row of KEYBOARD_ROWS) {
    for (const k of row) {
      if (k.code === baseCode) {
        foundFinger = k.finger;
        break;
      }
    }
    if (foundFinger) break;
  }

  let shiftSide: 'ShiftLeft' | 'ShiftRight' | null = null;
  if (needsShift && foundFinger) {
    shiftSide = foundFinger.startsWith('l-') ? 'ShiftRight' : 'ShiftLeft';
  }

  return {keyCode: baseCode, shiftSide, finger: foundFinger};
}

interface VirtualKeyboardProps {
  nextChar: string | null;
  showFingerGuide?: boolean;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  nextChar,
  showFingerGuide = true,
}) => {
  const keyElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const target = useMemo(() => resolveTargetKeys(nextChar), [nextChar]);

  // Lightweight direct-DOM ripple flash on physical keydown (zero React re-renders!)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      let lookup = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.code === 'ShiftLeft') lookup = 'ShiftLeft';
      else if (e.code === 'ShiftRight') lookup = 'ShiftRight';
      else if (SHIFT_CHAR_TO_KEY[e.key]) lookup = SHIFT_CHAR_TO_KEY[e.key];

      const el = keyElsRef.current.get(lookup);
      if (!el) return;
      el.animate(
        [
          {transform: 'scale(0.95)', filter: 'brightness(1.45)'},
          {transform: 'scale(1)', filter: 'brightness(1)'},
        ],
        {duration: 140, easing: 'ease-out'},
      );
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeFingers = useMemo(() => {
    const set = new Set<FingerId>();
    if (target.finger) set.add(target.finger);
    if (target.shiftSide === 'ShiftLeft') set.add('l-pinky');
    if (target.shiftSide === 'ShiftRight') set.add('r-pinky');
    return set;
  }, [target]);

  return (
    <section
      className="tv-surface rounded-2xl p-4 sm:p-5 space-y-4 select-none"
      aria-label="On-screen keyboard and finger guide"
    >
      {/* Top prompt line */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span style={{color: 'var(--tv-text-muted)'}}>Next key:</span>
          {target.keyCode ? (
            <span className="font-typing font-bold" style={{color: 'var(--tv-accent)'}}>
              {target.shiftSide ? `${target.shiftSide === 'ShiftLeft' ? 'Left Shift' : 'Right Shift'} + ` : ''}
              {nextChar === ' ' ? 'Space' : nextChar}
            </span>
          ) : (
            <span style={{color: 'var(--tv-text-muted)'}}>Ready</span>
          )}
        </div>

        {target.finger && (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{backgroundColor: FINGER_COLOR[target.finger]}}
              aria-hidden="true"
            />
            <span className="font-medium">
              {FINGER_LABEL[target.finger]}
              {target.shiftSide && ` + ${target.shiftSide === 'ShiftLeft' ? 'Left Pinky (Shift)' : 'Right Pinky (Shift)'}`}
            </span>
          </div>
        )}
      </div>

      {/* QWERTY Rows */}
      <div className="mx-auto max-w-[820px] space-y-1.5">
        {KEYBOARD_ROWS.map((row, rIdx) => (
          <div key={rIdx} className="flex justify-center gap-1.5">
            {row.map((k) => {
              const isTarget =
                target.keyCode === k.code || target.shiftSide === k.code;
              const zoneColor = FINGER_COLOR[k.finger];
              return (
                <div
                  key={k.code}
                  ref={(el) => {
                    if (el) keyElsRef.current.set(k.code, el);
                    else keyElsRef.current.delete(k.code);
                  }}
                  className={`relative flex flex-col items-center justify-center rounded-lg border h-10 sm:h-11 text-xs font-typing font-semibold transition-colors ${
                    k.widthClass ?? 'flex-1 max-w-[52px]'
                  }`}
                  style={{
                    backgroundColor: isTarget
                      ? zoneColor
                      : 'var(--tv-bg)',
                    color: isTarget ? '#04131B' : 'var(--tv-text)',
                    borderColor: isTarget ? zoneColor : `${zoneColor}55`,
                    boxShadow: isTarget ? `0 0 14px ${zoneColor}66` : 'none',
                  }}
                >
                  {k.shiftLabel && (
                    <span className="text-[9px] leading-none opacity-65 mb-0.5">
                      {k.shiftLabel}
                    </span>
                  )}
                  <span className="leading-none">{k.label}</span>
                  {k.isHomeAnchor && (
                    <span
                      className="absolute bottom-1 w-2.5 h-0.5 rounded-full"
                      style={{
                        backgroundColor: isTarget ? '#04131B' : zoneColor,
                      }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* SVG Two-Hand Finger Guide */}
      {showFingerGuide && (
        <div
          className="pt-2 border-t flex flex-wrap items-center justify-center gap-6"
          style={{borderColor: 'var(--tv-border)'}}
        >
          <HandGuideSvg side="left" activeFingers={activeFingers} />
          <div className="text-center space-y-1 min-w-[140px]">
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{color: 'var(--tv-text-muted)'}}>
              Finger Zones
            </div>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]" style={{color: 'var(--tv-text-muted)'}}>
              <span>Pinky</span>
              <span>Ring</span>
              <span>Middle</span>
              <span>Index</span>
              <span>Thumb</span>
            </div>
          </div>
          <HandGuideSvg side="right" activeFingers={activeFingers} />
        </div>
      )}
    </section>
  );
};

const HandGuideSvg: React.FC<{
  side: 'left' | 'right';
  activeFingers: Set<FingerId>;
}> = ({side, activeFingers}) => {
  const isLeft = side === 'left';
  const fingers: Array<{id: FingerId; x: number; y: number; h: number}> = isLeft
    ? [
        {id: 'l-pinky', x: 16, y: 26, h: 30},
        {id: 'l-ring', x: 32, y: 14, h: 40},
        {id: 'l-middle', x: 48, y: 8, h: 46},
        {id: 'l-index', x: 64, y: 16, h: 38},
        {id: 'thumb', x: 84, y: 46, h: 24},
      ]
    : [
        {id: 'thumb', x: 12, y: 46, h: 24},
        {id: 'r-index', x: 32, y: 16, h: 38},
        {id: 'r-middle', x: 48, y: 8, h: 46},
        {id: 'r-ring', x: 64, y: 14, h: 40},
        {id: 'r-pinky', x: 80, y: 26, h: 30},
      ];

  return (
    <svg viewBox="0 0 110 86" className="w-24 h-16" aria-label={`${side} hand finger guide`}>
      <rect
        x={isLeft ? 16 : 28}
        y="52"
        width="64"
        height="28"
        rx="10"
        fill="var(--tv-surface-elevated)"
        stroke="var(--tv-border)"
      />
      {fingers.map((f) => {
        const active = activeFingers.has(f.id);
        const col = FINGER_COLOR[f.id];
        return (
          <rect
            key={`${side}-${f.id}`}
            x={f.x}
            y={f.y}
            width="11"
            height={f.h}
            rx="5.5"
            fill={active ? col : 'var(--tv-bg)'}
            stroke={col}
            strokeWidth={active ? '2' : '1.2'}
            opacity={active ? 1 : 0.65}
          />
        );
      })}
    </svg>
  );
};
