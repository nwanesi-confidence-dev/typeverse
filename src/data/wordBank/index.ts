import type {
  ContentKind,
  ContentTheme,
  FreshPack,
  SpellingVariant,
  WordBankEntry,
  WordDifficultyTier,
} from '@/src/types/app';
import {adaptTextSpelling} from '@/src/utils/copy';

export interface WordBankSummary {
  totalWords: number;
  wordsByTier: Record<WordDifficultyTier, number>;
  totalSentences: number;
  totalParagraphs: number;
  totalNumberDrills: number;
  totalPunctuationDrills: number;
  totalCodeSnippets: number;
}

export interface WordBankCache {
  wordsByTier: Record<WordDifficultyTier, WordBankEntry[]>;
  allWords: WordBankEntry[];
  sentences: WordBankEntry[];
  paragraphs: WordBankEntry[];
  numbers: WordBankEntry[];
  punctuation: WordBankEntry[];
  code: WordBankEntry[];
  summary: WordBankSummary;
}

let cachedBank: WordBankCache | null = null;
let loadingPromise: Promise<WordBankCache> | null = null;

export function extractKeysUsed(text: string): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') continue;
    const lower = ch.toLowerCase();
    seen.add(lower);
    if (ch !== lower) seen.add('shift');
  }
  return Array.from(seen);
}

const THEMES: ContentTheme[] = [
  'School life',
  'Technology',
  'Nature',
  'Business',
  'Sports',
  'Stories',
  'Science',
  'Everyday life',
];

function parseWordTier(
  raw: string,
  tier: WordDifficultyTier,
  seenGlobal: Set<string>,
): WordBankEntry[] {
  const tokens = raw.trim().split(/\s+/);
  const entries: WordBankEntry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].trim();
    if (!w || seenGlobal.has(w)) continue;
    seenGlobal.add(w);
    entries.push({
      id: `w-t${tier}-${entries.length}`,
      text: w,
      kind: 'words',
      tier,
      theme: THEMES[entries.length % THEMES.length],
      keysUsed: extractKeysUsed(w),
    });
  }
  return entries;
}

export async function loadWordBank(): Promise<WordBankCache> {
  if (cachedBank) return cachedBank;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const [{TIER_1_RAW, TIER_2_RAW}, {TIER_3_RAW, TIER_4_RAW, TIER_5_RAW}, {BUNDLED_SENTENCES}, {BUNDLED_PARAGRAPHS}, {BUNDLED_DRILLS}] =
      await Promise.all([
        import('./tiers1to2'),
        import('./tiers3to5'),
        import('./sentences'),
        import('./paragraphs'),
        import('./drills'),
      ]);

    const seenWords = new Set<string>();
    const t1 = parseWordTier(TIER_1_RAW, 1, seenWords);
    const t2 = parseWordTier(TIER_2_RAW, 2, seenWords);
    const t3 = parseWordTier(TIER_3_RAW, 3, seenWords);
    const t4 = parseWordTier(TIER_4_RAW, 4, seenWords);
    const t5 = parseWordTier(TIER_5_RAW, 5, seenWords);

    const wordsByTier: Record<WordDifficultyTier, WordBankEntry[]> = {
      1: t1,
      2: t2,
      3: t3,
      4: t4,
      5: t5,
    };
    const allWords = [...t1, ...t2, ...t3, ...t4, ...t5];

    const sentences: WordBankEntry[] = BUNDLED_SENTENCES.map((item, idx) => ({
      id: `s-${idx}`,
      text: item.text,
      kind: 'sentences',
      tier: item.tier,
      theme: item.theme,
      keysUsed: extractKeysUsed(item.text),
    }));

    const paragraphs: WordBankEntry[] = BUNDLED_PARAGRAPHS.map((item, idx) => ({
      id: `p-${idx}`,
      text: item.text,
      kind: 'paragraphs',
      tier: item.tier,
      theme: item.theme,
      keysUsed: extractKeysUsed(item.text),
    }));

    const numbers: WordBankEntry[] = [];
    const punctuation: WordBankEntry[] = [];
    const code: WordBankEntry[] = [];

    BUNDLED_DRILLS.forEach((item, idx) => {
      const entry: WordBankEntry = {
        id: `d-${item.kind}-${idx}`,
        text: item.text,
        kind: item.kind,
        tier: item.tier,
        theme: item.theme,
        keysUsed: extractKeysUsed(item.text),
      };
      if (item.kind === 'numbers') numbers.push(entry);
      else if (item.kind === 'punctuation') punctuation.push(entry);
      else code.push(entry);
    });

    const summary: WordBankSummary = {
      totalWords: allWords.length,
      wordsByTier: {
        1: t1.length,
        2: t2.length,
        3: t3.length,
        4: t4.length,
        5: t5.length,
      },
      totalSentences: sentences.length,
      totalParagraphs: paragraphs.length,
      totalNumberDrills: numbers.length,
      totalPunctuationDrills: punctuation.length,
      totalCodeSnippets: code.length,
    };

    cachedBank = {
      wordsByTier,
      allWords,
      sentences,
      paragraphs,
      numbers,
      punctuation,
      code,
      summary,
    };
    return cachedBank;
  })();

  return loadingPromise;
}

export interface WordQueryOptions {
  kind: ContentKind;
  tier?: WordDifficultyTier;
  theme?: ContentTheme | 'All';
  focusKeys?: string[];
  spelling?: SpellingVariant;
  freshPacks?: FreshPack[];
  date?: string;
  limit?: number;
  seed?: number;
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shuffleWithSeed<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function matchesFocusKeys(text: string, focusKeys: string[]): boolean {
  if (focusKeys.length === 0) return true;
  const allowed = new Set(focusKeys.map((k) => k.toLowerCase()));
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toLowerCase();
    if (ch === ' ' || ch === '\n') continue;
    if (!allowed.has(ch)) return false;
  }
  return true;
}

export async function queryWordBank(opts: WordQueryOptions): Promise<WordBankEntry[]> {
  const bank = await loadWordBank();
  const spelling = opts.spelling ?? 'british';
  const unusedFresh: WordBankEntry[] = [];
  const usedFresh: WordBankEntry[] = [];

  // Serve unused packs first, then used packs, then bundled words
  if (opts.freshPacks && opts.freshPacks.length > 0 && opts.kind !== 'punctuation') {
    const matchingPacks = opts.freshPacks
      .filter(
        (p) =>
          p.kind === opts.kind &&
          (!opts.date || p.date === opts.date) &&
          (!opts.tier || p.level === opts.tier) &&
          (!opts.theme || opts.theme === 'All' || p.theme === opts.theme),
      )
      .sort((a, b) => {
        const aUnused = (a.usedCount ?? 0) === 0 ? 0 : 1;
        const bUnused = (b.usedCount ?? 0) === 0 ? 0 : 1;
        if (aUnused !== bUnused) return aUnused - bUnused;
        const aSpell = a.spelling === spelling ? 0 : 1;
        const bSpell = b.spelling === spelling ? 0 : 1;
        if (aSpell !== bSpell) return aSpell - bSpell;
        if ((a.usedCount ?? 0) !== (b.usedCount ?? 0)) {
          return (a.usedCount ?? 0) - (b.usedCount ?? 0);
        }
        return b.createdAt - a.createdAt;
      });

    for (const pack of matchingPacks) {
      const target = (pack.usedCount ?? 0) === 0 ? unusedFresh : usedFresh;
      pack.items.forEach((text, i) => {
        target.push({
          id: `fp::${pack.id}::${i}`,
          text,
          kind: opts.kind,
          tier: pack.level,
          theme: pack.theme,
          keysUsed: extractKeysUsed(text),
        });
      });
    }
  }

  let bundled: WordBankEntry[] = [];
  if (opts.kind === 'words') {
    bundled = opts.tier ? bank.wordsByTier[opts.tier] : bank.allWords;
  } else if (opts.kind === 'sentences') {
    bundled = bank.sentences;
  } else if (opts.kind === 'paragraphs') {
    bundled = bank.paragraphs;
  } else if (opts.kind === 'numbers') {
    bundled = bank.numbers;
  } else if (opts.kind === 'punctuation') {
    bundled = bank.punctuation;
  } else if (opts.kind === 'code') {
    bundled = bank.code;
  }

  const filterList = (list: WordBankEntry[], applyTierTheme: boolean): WordBankEntry[] => {
    let out = list;
    if (applyTierTheme && opts.tier && opts.kind !== 'words') {
      out = out.filter((item) => item.tier === opts.tier);
    }
    if (applyTierTheme && opts.theme && opts.theme !== 'All' && opts.kind !== 'words') {
      out = out.filter((item) => item.theme === opts.theme);
    }
    if (opts.focusKeys && opts.focusKeys.length > 0) {
      out = out.filter((item) => matchesFocusKeys(item.text, opts.focusKeys!));
    }
    return out;
  };

  let filteredUnused = filterList(unusedFresh, false);
  let filteredUsed = filterList(usedFresh, false);
  let filteredBundled = filterList(bundled, true);

  if (opts.seed !== undefined) {
    const rng = seededRandom(opts.seed);
    filteredUnused = shuffleWithSeed(filteredUnused, rng);
    filteredUsed = shuffleWithSeed(filteredUsed, rng);
    filteredBundled = shuffleWithSeed(filteredBundled, rng);
  }

  const pool = [...filteredUnused, ...filteredUsed, ...filteredBundled];
  const sliced = opts.limit ? pool.slice(0, opts.limit) : pool;
  return sliced.map((entry) => ({
    ...entry,
    text: adaptTextSpelling(entry.text, spelling),
  }));
}
