import type {ContentTheme, WordDifficultyTier} from '@/src/types/app';

export interface RawDrillItem {
  text: string;
  tier: WordDifficultyTier;
  theme: ContentTheme;
  kind: 'numbers' | 'punctuation' | 'code';
}

export const BUNDLED_DRILLS: RawDrillItem[] = [
  // Number drills
  {
    kind: 'numbers',
    tier: 1,
    theme: 'Everyday life',
    text: '10 20 30 40 50 60 70 80 90 100 12 24 36 48 64 72 84 96',
  },
  {
    kind: 'numbers',
    tier: 2,
    theme: 'School life',
    text: 'Room 104 opens at 08:30; Room 218 meets at 13:45 for 45 minutes.',
  },
  {
    kind: 'numbers',
    tier: 2,
    theme: 'Business',
    text: 'Invoice 4092: 18 units at 24.50 equals 441.00 due by 28/11/2026.',
  },
  {
    kind: 'numbers',
    tier: 3,
    theme: 'Science',
    text: 'Sample weights: 14.82 g, 19.05 g, 23.40 g, 31.77 g, and 42.16 g.',
  },
  {
    kind: 'numbers',
    tier: 3,
    theme: 'Sports',
    text: 'Lap splits: 1:12.4, 1:11.8, 1:10.5, 1:09.9, total 4:44.6 across 1600 m.',
  },
  {
    kind: 'numbers',
    tier: 4,
    theme: 'Technology',
    text: 'Ports 80, 443, 3000, 5432, 6379, and 8080 responded in 12.4 ms.',
  },
  {
    kind: 'numbers',
    tier: 4,
    theme: 'Nature',
    text: 'Coordinates 51.5074 N, 0.1278 W recorded 14.2 C and 1013.2 hPa.',
  },
  {
    kind: 'numbers',
    tier: 5,
    theme: 'Science',
    text: 'Constants: pi 3.14159, e 2.71828, c 299792458 m/s, avogadro 6.022e23.',
  },

  // Punctuation & symbol drills
  {
    kind: 'punctuation',
    tier: 1,
    theme: 'Everyday life',
    text: 'Yes, please! Wait: did she say "ready, set, go"?',
  },
  {
    kind: 'punctuation',
    tier: 2,
    theme: 'School life',
    text: "Check today's notes: read pages 12-18, write three drafts, and review!",
  },
  {
    kind: 'punctuation',
    tier: 3,
    theme: 'Business',
    text: 'Order #884-B (priority): confirm 15% discount, $48.50 credit & receipt.',
  },
  {
    kind: 'punctuation',
    tier: 3,
    theme: 'Stories',
    text: '"Where," asked Maya, "did you hide the brass compass—under the floorboards?"',
  },
  {
    kind: 'punctuation',
    tier: 4,
    theme: 'Technology',
    text: 'Filter: (status == "active" && tier >= 3) || tag ~ /^core_[0-9]+$/;',
  },
  {
    kind: 'punctuation',
    tier: 4,
    theme: 'Business',
    text: 'Mail team@typeverse.local; attach Q4-summary_v2.csv [size: 42 KB].',
  },
  {
    kind: 'punctuation',
    tier: 5,
    theme: 'Science',
    text: 'Ratio [A/B] = (x^2 + y^2) / (z - 0.5) != 0; verify @ 25% & 75%.',
  },
  {
    kind: 'punctuation',
    tier: 5,
    theme: 'Technology',
    text: 'Keys: { "id": "tv-09", "rate": 98.4%, "flags": ["a+b", "c/d", "~10ms"] }',
  },

  // Short code-style snippets
  {
    kind: 'code',
    tier: 2,
    theme: 'Technology',
    text: 'const wpm = Math.round((chars / 5) / minutes);',
  },
  {
    kind: 'code',
    tier: 3,
    theme: 'Technology',
    text: 'function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }',
  },
  {
    kind: 'code',
    tier: 3,
    theme: 'Technology',
    text: 'const scores = sessions.filter((s) => s.accuracy >= 95).map((s) => s.netWpm);',
  },
  {
    kind: 'code',
    tier: 4,
    theme: 'Technology',
    text: 'SELECT mode, AVG(net_wpm) AS avg_wpm FROM sessions WHERE accuracy >= 95 GROUP BY mode;',
  },
  {
    kind: 'code',
    tier: 4,
    theme: 'Technology',
    text: 'export async function loadPack(id: string): Promise<Pack | null> { return cache.get(id) ?? null; }',
  },
  {
    kind: 'code',
    tier: 5,
    theme: 'Technology',
    text: 'const unique = Array.from(new Set(words.map((w) => w.trim().toLowerCase()))).sort();',
  },
  {
    kind: 'code',
    tier: 5,
    theme: 'Technology',
    text: 'git log --oneline -n 10 && npm run lint && npm run build',
  },
  {
    kind: 'code',
    tier: 4,
    theme: 'Technology',
    text: '.caret { transform: translate3d(var(--x), var(--y), 0); transition: opacity 150ms ease; }',
  },
];
