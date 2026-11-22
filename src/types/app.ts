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

export type GraphicsModePreference = 'auto' | '3d' | '2d';
export type GraphicsDetailLevel = 'light' | 'full' | 'realistic';
export type ResolvedGraphicsMode = '2d' | '3d-light' | '3d-full' | '3d-realistic';
export type RealisticRenderScale = 0.75 | 1 | 1.25 | 1.5;

export interface RealisticOptions {
  renderScale: RealisticRenderScale;
  shadows: boolean;
  postEffects: boolean;
  hubDof: boolean;
  speedStreaks: boolean;
}

export const DEFAULT_REALISTIC_OPTIONS: RealisticOptions = {
  renderScale: 1,
  shadows: true,
  postEffects: true,
  hubDof: false,
  speedStreaks: false,
};

export type GameGraphicsOverride = 'default' | '3d' | '2d';
export type GraphicsGameId =
  | 'turbo-racer'
  | 'star-defender'
  | 'word-rain'
  | 'bubble-pop'
  | 'beat-typer';

export interface SpeedTestResult {
  medianFps: number;
  onePercentLowFps: number;
  frameCount: number;
  durationMs: number;
  recommendedMode: ResolvedGraphicsMode;
  timestamp: number;
  skipped?: boolean;
  heavyMedianFps?: number;
  heavyOnePercentLowFps?: number;
  heavyFrameCount?: number;
  heavyDurationMs?: number;
}

export interface HardwareReport {
  webglSupported: boolean;
  webgl2Supported: boolean;
  webglVersion: 'WebGL 2.0' | 'WebGL 1.0' | 'Unavailable';
  renderer: string;
  vendor: string;
  rendererKnown: boolean;
  isSoftwareRenderer: boolean;
  logicalCores: number;
  deviceMemoryGb: number | null;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  pixelCount: number;
  desktopMode: boolean;
  desktopHwAccelDisabled: boolean;
  gpuFeatureStatus: Record<string, string> | null;
  gpuFeatureSoftwareOnly: boolean;
  fingerprint: string;
  prefersReducedMotion: boolean;
}

export interface PersistedGraphicsState {
  preference: GraphicsModePreference;
  detail3D: GraphicsDetailLevel;
  realisticOptions: RealisticOptions;
  autoResolvedMode: ResolvedGraphicsMode;
  autoReason: string;
  autoChecked: boolean;
  autoSkipped: boolean;
  hardwareFingerprint: string;
  hardwareReport?: HardwareReport | null;
  speedTestResult: SpeedTestResult | null;
  firstRunDismissed: boolean;
  suggest2DWhenSlow: boolean;
  suggestFullWhenRealisticSlow: boolean;
  gameOverrides: Partial<Record<GraphicsGameId, GameGraphicsOverride>>;
  lastUpdatedAt: number;
}

export const DEFAULT_GRAPHICS_STATE: PersistedGraphicsState = {
  preference: 'auto',
  detail3D: 'light',
  realisticOptions: {...DEFAULT_REALISTIC_OPTIONS},
  autoResolvedMode: '2d',
  autoReason: 'Not checked yet',
  autoChecked: false,
  autoSkipped: false,
  hardwareFingerprint: '',
  hardwareReport: null,
  speedTestResult: null,
  firstRunDismissed: false,
  suggest2DWhenSlow: true,
  suggestFullWhenRealisticSlow: true,
  gameOverrides: {},
  lastUpdatedAt: 0,
};

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
  calmMode: boolean;
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
  calmMode: false,
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
