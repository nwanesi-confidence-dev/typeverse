import React, {useEffect, useState} from 'react';
import {ArrowLeft, Database, Filter, RefreshCw} from 'lucide-react';
import {useAppearance} from '@/src/context/AppearanceContext';
import {loadWordBank, queryWordBank, type WordBankSummary} from '@/src/data/wordBank';
import {getStorageBackendName} from '@/src/db/storage';
import type {
  ContentKind,
  ContentTheme,
  WordBankEntry,
  WordDifficultyTier,
} from '@/src/types/app';
import {useScreenInfo} from '@/src/utils/screenInfo';

interface WordBankExplorerProps {
  onBack: () => void;
}

const KINDS: Array<{id: ContentKind; label: string}> = [
  {id: 'words', label: 'Words'},
  {id: 'sentences', label: 'Sentences'},
  {id: 'paragraphs', label: 'Paragraphs'},
  {id: 'numbers', label: 'Numbers'},
  {id: 'punctuation', label: 'Punctuation'},
  {id: 'code', label: 'Code Snippets'},
];

const THEMES: Array<ContentTheme | 'All'> = [
  'All',
  'School life',
  'Technology',
  'Nature',
  'Business',
  'Sports',
  'Stories',
  'Science',
  'Everyday life',
];

export const WordBankExplorer: React.FC<WordBankExplorerProps> = ({onBack}) => {
  const {settings} = useAppearance();
  const screen = useScreenInfo();
  const [summary, setSummary] = useState<WordBankSummary | null>(null);
  const [kind, setKind] = useState<ContentKind>('words');
  const [tier, setTier] = useState<WordDifficultyTier | 0>(0);
  const [theme, setTheme] = useState<ContentTheme | 'All'>('All');
  const [focusInput, setFocusInput] = useState('');
  const [seed, setSeed] = useState(1);
  const [entries, setEntries] = useState<WordBankEntry[]>([]);
  const [backendName, setBackendName] = useState<string>('IndexedDB');

  useEffect(() => {
    void loadWordBank().then((bank) => {
      setSummary(bank.summary);
      setBackendName(getStorageBackendName());
    });
  }, []);

  useEffect(() => {
    const focusKeys = focusInput
      .trim()
      .toLowerCase()
      .split('')
      .filter((ch) => ch !== ' ');

    void queryWordBank({
      kind,
      tier: tier === 0 ? undefined : tier,
      theme,
      focusKeys: focusKeys.length > 0 ? focusKeys : undefined,
      spelling: settings.spelling,
      limit: kind === 'words' ? 60 : 16,
      seed,
    }).then(setEntries);
  }, [kind, tier, theme, focusInput, settings.spelling, seed]);

  const statCols = screen.width < 580 ? 2 : screen.width < 940 ? 3 : 6;
  const filterCols = screen.width < 760 ? 1 : 3;

  return (
    <main className="tv-fluid-container py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={{color: 'var(--tv-accent)'}}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to Hub</span>
          </button>
          <h1 className="font-display font-bold tracking-tight" style={{fontSize: 'var(--tv-text-2xl)'}}>
            Bundled Offline Word Bank
          </h1>
          <p className="text-sm" style={{color: 'var(--tv-text-muted)'}}>
            Pre-bundled locally with zero network dependency, tagged by difficulty tier, theme, and keys used.
          </p>
        </div>

        <div
          className="tv-surface rounded-xl px-4 py-3 flex items-center gap-3 text-xs shrink-0"
          style={{color: 'var(--tv-text-muted)'}}
        >
          <Database className="w-4 h-4 shrink-0" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
          <div>
            <div className="font-semibold" style={{color: 'var(--tv-text)'}}>
              Storage Engine: {backendName}
            </div>
            <div>Ready for instant offline persistence</div>
          </div>
        </div>
      </div>

      {summary && (
        <div
          className="grid gap-3"
          style={{gridTemplateColumns: `repeat(${statCols}, minmax(0, 1fr))`}}
        >
          {[
            {label: 'Common Words', value: summary.totalWords.toLocaleString()},
            {label: 'Sentences', value: summary.totalSentences.toLocaleString()},
            {label: 'Paragraphs', value: summary.totalParagraphs.toLocaleString()},
            {label: 'Number Drills', value: summary.totalNumberDrills.toLocaleString()},
            {label: 'Symbol Drills', value: summary.totalPunctuationDrills.toLocaleString()},
            {label: 'Code Snippets', value: summary.totalCodeSnippets.toLocaleString()},
          ].map((stat) => (
            <div key={stat.label} className="tv-surface rounded-xl p-4 min-w-0">
              <div className="text-xs truncate" style={{color: 'var(--tv-text-muted)'}}>
                {stat.label}
              </div>
              <div className="font-display text-2xl font-bold tabular-nums mt-1">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="tv-surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {KINDS.map((k) => {
              const active = kind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--tv-accent)' : 'var(--tv-surface-elevated)',
                    color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                  }}
                >
                  {k.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap"
            style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text)'}}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Shuffle Sample</span>
          </button>
        </div>

        <div
          className="grid gap-3 pt-1"
          style={{gridTemplateColumns: `repeat(${filterCols}, minmax(0, 1fr))`}}
        >
          <div className="space-y-1 min-w-0">
            <label htmlFor="wb-tier" className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
              Difficulty Tier
            </label>
            <select
              id="wb-tier"
              value={tier}
              onChange={(e) => setTier(Number(e.target.value) as WordDifficultyTier | 0)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--tv-bg)',
                borderColor: 'var(--tv-border)',
                color: 'var(--tv-text)',
              }}
            >
              <option value={0}>All Tiers (1–5)</option>
              <option value={1}>Tier 1 — Foundation</option>
              <option value={2}>Tier 2 — Everyday</option>
              <option value={3}>Tier 3 — Intermediate</option>
              <option value={4}>Tier 4 — Advanced</option>
              <option value={5}>Tier 5 — Mastery</option>
            </select>
          </div>

          <div className="space-y-1 min-w-0">
            <label htmlFor="wb-theme" className="text-xs font-medium" style={{color: 'var(--tv-text-muted)'}}>
              Content Theme
            </label>
            <select
              id="wb-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as ContentTheme | 'All')}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--tv-bg)',
                borderColor: 'var(--tv-border)',
                color: 'var(--tv-text)',
              }}
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1 min-w-0">
            <label htmlFor="wb-focus" className="text-xs font-medium flex items-center gap-1.5" style={{color: 'var(--tv-text-muted)'}}>
              <Filter className="w-3 h-3" aria-hidden="true" />
              <span>Filter by Focus Keys (e.g. asdfjkl)</span>
            </label>
            <input
              id="wb-focus"
              type="text"
              value={focusInput}
              onChange={(e) => setFocusInput(e.target.value)}
              placeholder="Leave blank for all keys"
              className="font-typing w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--tv-bg)',
                borderColor: 'var(--tv-border)',
                color: 'var(--tv-text)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Results Display */}
      <div className="tv-surface rounded-2xl p-5">
        {entries.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{color: 'var(--tv-text-muted)'}}>
            No bundled entries match that exact key filter. Try adding a few more vowels or clearing the focus keys input.
          </p>
        ) : kind === 'words' ? (
          <div className="flex flex-wrap gap-2.5">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border px-3 py-1.5 font-typing text-sm max-w-full break-words"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: 'var(--tv-border)',
                }}
              >
                {entry.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border p-4 space-y-2"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: 'var(--tv-border)',
                }}
              >
                <p className="font-typing text-sm leading-relaxed break-words">{entry.text}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs" style={{color: 'var(--tv-text-muted)'}}>
                  <span>Tier {entry.tier}</span>
                  <span aria-hidden="true">·</span>
                  <span>{entry.theme}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{entry.keysUsed.length} unique keys</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};
