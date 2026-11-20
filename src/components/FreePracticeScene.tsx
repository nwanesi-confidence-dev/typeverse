import React, {useCallback, useEffect, useState} from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileText,
  Keyboard,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {SessionResults} from '@/src/components/SessionResults';
import {TypingArena} from '@/src/components/TypingArena';
import {VirtualKeyboard} from '@/src/components/VirtualKeyboard';
import {WpmHud} from '@/src/components/WpmHud';
import {useAppearance} from '@/src/context/AppearanceContext';
import {queryWordBank} from '@/src/data/wordBank';
import {
  getActiveProfileId,
  loadFreshPacks,
  loadProfileProgress,
  loadProfiles,
} from '@/src/db/storage';
import type {
  ContentKind,
  ContentTheme,
  ProfileProgress,
  WordDifficultyTier,
} from '@/src/types/app';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';
import {adaptTextSpelling} from '@/src/utils/copy';
import {
  extractFreshPackIdsFromEntryIds,
  markFreshPacksUsed,
  maybePrefetchFreshPack,
} from '@/src/utils/freshWordsClient';
import {recordSessionAndBadges} from '@/src/utils/progression';

interface FreePracticeSceneProps {
  onBack: () => void;
  activeProfileId: string;
}

const INITIAL_TELEMETRY: TypingTelemetrySnapshot = {
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

const ALL_THEMES: Array<ContentTheme | 'All'> = [
  'All',
  'Everyday life',
  'Technology',
  'Nature',
  'Science',
  'School life',
  'Business',
  'Sports',
  'Stories',
];

const KIND_OPTIONS: Array<{id: ContentKind; label: string}> = [
  {id: 'words', label: 'Words'},
  {id: 'sentences', label: 'Sentences'},
  {id: 'paragraphs', label: 'Paragraphs'},
  {id: 'numbers', label: 'Numbers'},
  {id: 'punctuation', label: 'Punctuation'},
  {id: 'code', label: 'Code'},
];

const KEY_PRESETS: Array<{id: string; label: string; keys: string}> = [
  {id: 'all', label: 'Full Keyboard', keys: ''},
  {id: 'home', label: 'Home Row', keys: 'asdfghjkl;'},
  {id: 'top', label: 'Top Row', keys: 'qwertyuiop'},
  {id: 'bottom', label: 'Bottom Row', keys: 'zxcvbnm,.'},
  {id: 'left', label: 'Left Hand', keys: 'qwertasdfgzxcvb'},
  {id: 'right', label: 'Right Hand', keys: 'yuiophjklnm'},
];

function sanitiseCustomText(raw: string): string {
  return raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\r\n\t]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

export const FreePracticeScene: React.FC<FreePracticeSceneProps> = ({
  onBack,
  activeProfileId,
}) => {
  const {settings, updateSetting, copy} = useAppearance();
  const [sourceMode, setSourceMode] = useState<'bank' | 'custom'>('bank');
  const [contentKind, setContentKind] = useState<ContentKind>('sentences');
  const [theme, setTheme] = useState<ContentTheme | 'All'>('All');
  const [tier, setTier] = useState<WordDifficultyTier | 0>(0);
  const [wordTarget, setWordTarget] = useState<number>(40);
  const [focusPresetId, setFocusPresetId] = useState<string>('all');
  const [customFocusInput, setCustomFocusInput] = useState<string>('');
  const [customDraft, setCustomDraft] = useState<string>(
    'Paste or write any article, speech, code snippet, or study notes here to practise typing at your own pace.',
  );
  const [appliedCustomText, setAppliedCustomText] = useState<string>(
    'Paste or write any article, speech, code snippet, or study notes here to practise typing at your own pace.',
  );
  const [customNotice, setCustomNotice] = useState<string | null>(null);

  const [passage, setPassage] = useState<string>('');
  const [usedFreshPack, setUsedFreshPack] = useState(false);
  const [usedPackIds, setUsedPackIds] = useState<string[]>([]);
  const [runSeed, setRunSeed] = useState(1);
  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [profileName, setProfileName] = useState('Typist');
  const [telemetry, setTelemetry] = useState<TypingTelemetrySnapshot>(INITIAL_TELEMETRY);
  const [results, setResults] = useState<CompletedSessionStats | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const pid = activeProfileId || (await getActiveProfileId());
      const [profiles, prog] = await Promise.all([
        loadProfiles(),
        loadProfileProgress(pid),
      ]);
      if (!active) return;
      const found = profiles.find((p) => p.id === pid) ?? profiles[0];
      if (found) setProfileName(found.name);
      setProgress(prog);
    })();
    return () => {
      active = false;
    };
  }, [activeProfileId]);

  const parsedFocusKeys = React.useMemo(() => {
    const raw = customFocusInput.trim().toLowerCase();
    if (!raw) return [];
    const unique = new Set<string>();
    for (const ch of raw) {
      if (ch !== ' ' && /^[\x21-\x7E]$/.test(ch)) {
        unique.add(ch);
      }
    }
    return Array.from(unique);
  }, [customFocusInput]);

  const buildPracticePassage = useCallback(async () => {
    if (sourceMode === 'custom') {
      const cleaned = adaptTextSpelling(
        sanitiseCustomText(appliedCustomText),
        settings.spelling,
      );
      const finalTxt =
        cleaned ||
        'Enter at least one word in Custom Text above to start typing.';
      setUsedFreshPack(false);
      setPassage(finalTxt);
      setResults(null);
      setTelemetry({...INITIAL_TELEMETRY, nextChar: finalTxt[0] ?? null});
      return;
    }

    const packs = await loadFreshPacks();
    const effectiveFocus = parsedFocusKeys;
    const effectiveKind: ContentKind =
      effectiveFocus.length > 0 &&
      contentKind !== 'words' &&
      contentKind !== 'sentences'
        ? 'words'
        : contentKind;

    let entries = await queryWordBank({
      kind: effectiveKind,
      tier: tier === 0 ? undefined : tier,
      theme,
      focusKeys: effectiveFocus.length > 0 ? effectiveFocus : undefined,
      spelling: settings.spelling,
      freshPacks: packs,
      seed: runSeed,
      limit: effectiveKind === 'words' ? Math.max(wordTarget, 60) : 20,
    });

    // If strict focus keys yield very few entries, widen cleanly to word matches containing those keys
    if (entries.length < 8 && effectiveFocus.length > 0) {
      const fallbackWords = await queryWordBank({
        kind: 'words',
        spelling: settings.spelling,
        freshPacks: packs,
        seed: runSeed,
        limit: 500,
      });
      const containing = fallbackWords.filter((e) =>
        effectiveFocus.some((k) => e.text.toLowerCase().includes(k)),
      );
      if (containing.length >= 6) {
        entries = containing;
      } else {
        // Synthesise rhythmic focus-key drills when only 2-5 keys are chosen
        const drillTokens: string[] = [];
        const keys = effectiveFocus;
        for (let i = 0; i < Math.max(24, wordTarget); i++) {
          const len = 3 + (i % 3);
          let token = '';
          for (let j = 0; j < len; j++) {
            token += keys[(i * 3 + j + runSeed) % keys.length];
          }
          drillTokens.push(token);
        }
        const txt = drillTokens.join(' ');
        setUsedFreshPack(false);
        setPassage(txt);
        setResults(null);
        setTelemetry({...INITIAL_TELEMETRY, nextChar: txt[0] ?? null});
        return;
      }
    }

    // Ultimate fallback to any words in selected theme/tier
    if (entries.length === 0) {
      entries = await queryWordBank({
        kind: 'words',
        spelling: settings.spelling,
        freshPacks: packs,
        seed: runSeed,
        limit: 80,
      });
    }

    const packIds = extractFreshPackIdsFromEntryIds(entries.map((e) => e.id));
    setUsedFreshPack(packIds.length > 0);
    setUsedPackIds(packIds);

    let combinedText = '';
    if (effectiveKind === 'words' || effectiveFocus.length > 0) {
      const list: string[] = [];
      for (let i = 0; i < wordTarget; i++) {
        list.push(entries[i % entries.length].text);
      }
      combinedText = list.join(' ');
    } else {
      const chunks: string[] = [];
      let wc = 0;
      let idx = 0;
      while (wc < wordTarget && idx < 24 && entries.length > 0) {
        const piece = entries[idx % entries.length].text;
        chunks.push(piece);
        wc += piece.split(/\s+/).length;
        idx++;
      }
      combinedText = chunks.join(' ');
    }

    setPassage(combinedText);
    setResults(null);
    setTelemetry({...INITIAL_TELEMETRY, nextChar: combinedText[0] ?? null});
  }, [
    sourceMode,
    appliedCustomText,
    settings.spelling,
    parsedFocusKeys,
    contentKind,
    tier,
    theme,
    wordTarget,
    runSeed,
  ]);

  useEffect(() => {
    void buildPracticePassage();
  }, [buildPracticePassage]);

  const handleApplyCustom = () => {
    soundEngine.playUiTap();
    const cleaned = sanitiseCustomText(customDraft);
    if (!cleaned) {
      setCustomNotice('Please enter printable text to practise.');
      return;
    }
    setCustomNotice(null);
    setAppliedCustomText(cleaned);
    setRunSeed((s) => s + 1);
  };

  const handleComplete = useCallback(
    async (completed: CompletedSessionStats) => {
      soundEngine.playMilestone();
      const subLabel =
        sourceMode === 'custom'
          ? `Free ${copy('practise')} · Custom Text`
          : `Free ${copy('practise')} · ${theme === 'All' ? 'Mixed' : theme}`;
      const enriched: CompletedSessionStats = {
        ...completed,
        mode: 'free-practice',
        subMode: subLabel,
        textKind: sourceMode === 'custom' ? 'paragraphs' : contentKind,
      };
      setResults(enriched);

      if (usedPackIds.length > 0) {
        void markFreshPacksUsed(usedPackIds);
      }

      if (progress) {
        const updated = await recordSessionAndBadges(
          progress,
          enriched,
          'free-practice',
        );
        setProgress(updated);
      }

      // Quietly check for new word packs in background while online
      maybePrefetchFreshPack(settings, {
        level: tier === 0 ? 2 : tier,
        theme: theme === 'All' ? 'Everyday life' : theme,
      });
    },
    [
      sourceMode,
      copy,
      theme,
      contentKind,
      progress,
      settings,
      tier,
      usedPackIds,
    ],
  );

  const isFocus = settings.layout === 'focus';

  return (
    <main className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 space-y-5">
      {!isFocus && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80"
              style={{color: 'var(--tv-accent)'}}
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back to Hub (Esc)</span>
            </button>
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Free {copy('practise')}
              </h1>
              {usedFreshPack && sourceMode === 'bank' && (
                <span className="text-xs font-medium" style={{color: 'var(--tv-success)'}}>
                  Using Word Pack
                </span>
              )}
            </div>
            <p className="text-sm" style={{color: 'var(--tv-text-muted)'}}>
              Drill specific key rows, explore themed packs, or paste any custom text without countdown pressure.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-xl border p-1"
              style={{backgroundColor: 'var(--tv-surface)', borderColor: 'var(--tv-border)'}}
            >
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiTap();
                  setSourceMode('bank');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor:
                    sourceMode === 'bank' ? 'var(--tv-accent)' : 'transparent',
                  color:
                    sourceMode === 'bank' ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Packs & Focus Keys</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiTap();
                  setSourceMode('custom');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor:
                    sourceMode === 'custom' ? 'var(--tv-accent)' : 'transparent',
                  color:
                    sourceMode === 'custom' ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                }}
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Custom Text</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                updateSetting('keyboardVisible', !settings.keyboardVisible);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: 'var(--tv-border)',
                backgroundColor: 'var(--tv-surface)',
                color: 'var(--tv-text)',
              }}
            >
              {settings.keyboardVisible ? (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{settings.keyboardVisible ? 'Hide Keyboard' : 'Show Keyboard'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                setRunSeed((s) => s + 1);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: 'var(--tv-border)',
                backgroundColor: 'var(--tv-surface)',
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Shuffle</span>
            </button>
          </div>
        </div>
      )}

      {/* Configuration Controls */}
      {!isFocus && !results && sourceMode === 'bank' && (
        <section
          className="tv-surface rounded-2xl p-4 space-y-3"
          aria-label="Practice configuration"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="space-y-1 text-xs">
              <span style={{color: 'var(--tv-text-muted)'}}>Content Kind</span>
              <select
                value={contentKind}
                onChange={(e) => {
                  soundEngine.playUiTap();
                  setContentKind(e.target.value as ContentKind);
                }}
                className="w-full rounded-xl border px-3 py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: 'var(--tv-border)',
                  color: 'var(--tv-text)',
                }}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span style={{color: 'var(--tv-text-muted)'}}>Theme</span>
              <select
                value={theme}
                onChange={(e) => {
                  soundEngine.playUiTap();
                  setTheme(e.target.value as ContentTheme | 'All');
                }}
                className="w-full rounded-xl border px-3 py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: 'var(--tv-border)',
                  color: 'var(--tv-text)',
                }}
              >
                {ALL_THEMES.map((th) => (
                  <option key={th} value={th}>
                    {th === 'All' ? 'All Themes' : th}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span style={{color: 'var(--tv-text-muted)'}}>Difficulty Tier</span>
              <select
                value={tier}
                onChange={(e) => {
                  soundEngine.playUiTap();
                  setTier(Number(e.target.value) as WordDifficultyTier | 0);
                }}
                className="w-full rounded-xl border px-3 py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: 'var(--tv-border)',
                  color: 'var(--tv-text)',
                }}
              >
                <option value={0}>Mixed Difficulty</option>
                <option value={1}>Tier 1 (Foundations)</option>
                <option value={2}>Tier 2 (Everyday)</option>
                <option value={3}>Tier 3 (Intermediate)</option>
                <option value={4}>Tier 4 (Advanced)</option>
                <option value={5}>Tier 5 (Mastery)</option>
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span style={{color: 'var(--tv-text-muted)'}}>Target Length</span>
              <select
                value={wordTarget}
                onChange={(e) => {
                  soundEngine.playUiTap();
                  setWordTarget(Number(e.target.value));
                }}
                className="w-full rounded-xl border px-3 py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: 'var(--tv-border)',
                  color: 'var(--tv-text)',
                }}
              >
                <option value={20}>20 words</option>
                <option value={40}>40 words</option>
                <option value={60}>60 words</option>
                <option value={100}>100 words</option>
              </select>
            </label>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t"
            style={{borderColor: 'var(--tv-border)'}}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-medium mr-1" style={{color: 'var(--tv-text-muted)'}}>
                <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Focus Keys:</span>
              </span>
              {KEY_PRESETS.map((preset) => {
                const active = focusPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiTap();
                      setFocusPresetId(preset.id);
                      setCustomFocusInput(preset.keys);
                    }}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active
                        ? 'var(--tv-accent)'
                        : 'var(--tv-bg)',
                      color: active
                        ? 'var(--tv-accent-fg)'
                        : 'var(--tv-text-muted)',
                      border: `1px solid ${active ? 'var(--tv-accent)' : 'var(--tv-border)'}`,
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="custom-focus-keys" className="text-xs whitespace-nowrap" style={{color: 'var(--tv-text-muted)'}}>
                Custom keys:
              </label>
              <input
                id="custom-focus-keys"
                type="text"
                value={customFocusInput}
                onChange={(e) => {
                  setFocusPresetId('custom');
                  setCustomFocusInput(e.target.value);
                }}
                placeholder="e.g. asdfjkl"
                className="font-typing w-36 rounded-lg border px-2.5 py-1 text-xs"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: 'var(--tv-border)',
                  color: 'var(--tv-text)',
                }}
              />
            </div>
          </div>
        </section>
      )}

      {/* Custom Text Input */}
      {!isFocus && !results && sourceMode === 'custom' && (
        <section
          className="tv-surface rounded-2xl p-4 space-y-3"
          aria-label="Custom practice text"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="free-custom-textarea" className="text-xs font-semibold">
              Paste or type your own passage (normalised to printable ASCII)
            </label>
            <span className="font-typing text-xs tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
              {customDraft.length}/4000 chars
            </span>
          </div>
          <textarea
            id="free-custom-textarea"
            rows={3}
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            className="font-typing w-full rounded-xl border p-3 text-sm leading-relaxed"
            style={{
              backgroundColor: 'var(--tv-bg)',
              borderColor: 'var(--tv-border)',
              color: 'var(--tv-text)',
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs" style={{color: customNotice ? 'var(--tv-error)' : 'var(--tv-text-muted)'}}>
              {customNotice ?? 'Press Apply to load your text into the arena below.'}
            </span>
            <button
              type="button"
              onClick={handleApplyCustom}
              className="rounded-xl px-4 py-2 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--tv-accent)',
                color: 'var(--tv-accent-fg)',
              }}
            >
              Apply Custom Text
            </button>
          </div>
        </section>
      )}

      {/* Live WPM Meter HUD */}
      <WpmHud
        telemetry={telemetry}
        personalBestWpm={progress?.bestWpm ?? 0}
        targetWpm={progress?.targetWpm ?? 60}
      />

      {/* Arena OR Results */}
      {results ? (
        <SessionResults
          stats={results}
          profileName={profileName}
          showCertificate={false}
          onRetry={() => {
            soundEngine.playUiTap();
            setResults(null);
            void buildPracticePassage();
          }}
          onNext={() => {
            soundEngine.playUiTap();
            setResults(null);
            setRunSeed((s) => s + 1);
          }}
          onPractiseWeakKeys={(keys) => {
            soundEngine.playUiTap();
            setSourceMode('bank');
            setFocusPresetId('custom');
            setCustomFocusInput(keys.join(''));
            setResults(null);
            setRunSeed((s) => s + 1);
          }}
        />
      ) : (
        passage && (
          <div className="space-y-4">
            <TypingArena
              key={`fp-${sourceMode}-${runSeed}-${passage.slice(0, 20)}`}
              text={passage}
              timeLimitSec={null}
              personalBestWpm={progress?.bestWpm ?? 0}
              targetWpm={progress?.targetWpm ?? 60}
              modeLabel={
                sourceMode === 'custom'
                  ? 'Custom Text'
                  : parsedFocusKeys.length > 0
                    ? `Focus: ${parsedFocusKeys.slice(0, 12).join('').toUpperCase()}`
                    : `${contentKind} · ${theme}`
              }
              onTelemetry={setTelemetry}
              onComplete={(s) => void handleComplete(s)}
              onRestart={() => {
                soundEngine.playUiTap();
                void buildPracticePassage();
              }}
            />

            {settings.keyboardVisible && (
              <VirtualKeyboard nextChar={telemetry.nextChar} />
            )}
          </div>
        )
      )}
    </main>
  );
};
