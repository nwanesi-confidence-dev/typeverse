export type ThemeId =
  | 'midnight-neon'
  | 'aurora'
  | 'sunrise'
  | 'classroom-light'
  | 'high-contrast';

export type LayoutDensity = 'comfortable' | 'compact' | 'focus';
export type TextSize = 'S' | 'M' | 'L' | 'XL';
export type FontChoice = 'jetbrains-mono' | 'ibm-plex-mono' | 'system-mono';
export type CaretStyle = 'line' | 'block' | 'underline';
export type SpellingVariant = 'british' | 'american';
export type BackspaceMode = 'standard' | 'strict' | 'forgiving';
export type PackKind = 'words' | 'sentences' | 'paragraphs' | 'numbers' | 'code';

export type SceneId =
  | 'hub'
  | 'classroom'
  | 'speed-test'
  | 'free-practice'
  | 'skill-lab'
  | 'arcade'
  | 'daily-challenge'
  | 'dashboard'
  | 'word-bank';

export interface AppearanceSettings {
  theme: ThemeId;
  layout: LayoutDensity;
  textSize: TextSize;
  fontChoice: FontChoice;
  keyboardVisible: boolean;
  soundVolume: number;
  caretStyle: CaretStyle;
  reducedMotion: boolean;
  spelling: SpellingVariant;
  backspaceMode: BackspaceMode;
  customPacksUrl: string;
}

export const DEFAULT_SETTINGS: AppearanceSettings = {
  theme: 'midnight-neon',
  layout: 'comfortable',
  textSize: 'L',
  fontChoice: 'jetbrains-mono',
  keyboardVisible: true,
  soundVolume: 65,
  caretStyle: 'line',
  reducedMotion: false,
  spelling: 'british',
  backspaceMode: 'standard',
  customPacksUrl: '',
};

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  colour: string;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  profileId: string;
  mode: SceneId;
  subMode?: string;
  netWpm: number;
  grossWpm: number;
  accuracy: number;
  consistency: number;
  errors: number;
  durationSec: number;
  wordsTyped: number;
  xpEarned: number;
  timestamp: number;
}

export interface KeyAggregateMetric {
  hits: number;
  errors: number;
  totalLatencyMs: number;
}

export interface DailyActivityRecord {
  seconds: number;
  words: number;
  sessions: number;
}

export interface ProfileProgress {
  profileId: string;
  xp: number;
  streakDays: number;
  lastPractisedDate: string | null;
  totalWordsTyped: number;
  totalTimeSec: number;
  bestWpm: number;
  targetWpm: number;
  dailyGoalMinutes: number;
  unlockedLessonIndex: number;
  lessonStars: Record<string, number>;
  badges: string[];
  sessions: SessionRecord[];
  keyMetrics?: Record<string, KeyAggregateMetric>;
  bigramMetrics?: Record<string, KeyAggregateMetric>;
  dailyActivity?: Record<string, DailyActivityRecord>;
  dailyChallengeHistory?: Record<
    string,
    {
      bestWpm: number;
      bestAccuracy: number;
      attempts: number;
      lastCompletedAt: number;
    }
  >;
}

export type WordDifficultyTier = 1 | 2 | 3 | 4 | 5;

export type ContentTheme =
  | 'School life'
  | 'Technology'
  | 'Nature'
  | 'Business'
  | 'Sports'
  | 'Stories'
  | 'Science'
  | 'Everyday life';

export type ContentKind =
  | 'words'
  | 'sentences'
  | 'paragraphs'
  | 'numbers'
  | 'punctuation'
  | 'code';

export interface WordBankEntry {
  id: string;
  text: string;
  kind: ContentKind;
  tier: WordDifficultyTier;
  theme: ContentTheme;
  keysUsed: string[];
}

export interface FreshPack {
  id: string;
  kind: PackKind;
  theme: ContentTheme;
  level: WordDifficultyTier;
  spelling: SpellingVariant;
  items: string[];
  keysUsed: string[];
  createdAt: number;
  date: string;
  usedCount?: number;
  isSeed?: boolean;
}
