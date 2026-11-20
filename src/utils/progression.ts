import {saveProfileProgress} from '@/src/db/storage';
import type {
  DailyActivityRecord,
  KeyAggregateMetric,
  ProfileProgress,
  SceneId,
  SessionRecord,
} from '@/src/types/app';
import type {CompletedSessionStats} from '@/src/types/typing';

export interface XpRank {
  name: 'Novice' | 'Learner' | 'Typist' | 'Speedster' | 'Pro' | 'Wizard';
  minXp: number;
  nextXp: number | null;
}

export const XP_RANKS: XpRank[] = [
  {name: 'Novice', minXp: 0, nextXp: 250},
  {name: 'Learner', minXp: 250, nextXp: 750},
  {name: 'Typist', minXp: 750, nextXp: 1800},
  {name: 'Speedster', minXp: 1800, nextXp: 4000},
  {name: 'Pro', minXp: 4000, nextXp: 8000},
  {name: 'Wizard', minXp: 8000, nextXp: null},
];

export function getXpRank(xp: number): {
  current: XpRank;
  progressPct: number;
} {
  let current = XP_RANKS[0];
  for (const rank of XP_RANKS) {
    if (xp >= rank.minXp) current = rank;
  }
  if (current.nextXp === null) {
    return {current, progressPct: 100};
  }
  const span = current.nextXp - current.minXp;
  const pct = Math.max(0, Math.min(100, Math.round(((xp - current.minXp) / span) * 100)));
  return {current, progressPct: pct};
}

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first-session',
    title: 'First Keystrokes',
    description: 'Complete your first typing session.',
  },
  {
    id: 'wpm-30',
    title: 'Steady Cruise',
    description: 'Reach 30+ Net WPM in any session.',
  },
  {
    id: 'wpm-50',
    title: 'Brisk Cadence',
    description: 'Reach 50+ Net WPM in any session.',
  },
  {
    id: 'wpm-80',
    title: 'Velocity 80',
    description: 'Reach 80+ Net WPM in any session.',
  },
  {
    id: 'acc-95',
    title: 'Sharp Precision',
    description: 'Finish a session with 95%+ accuracy.',
  },
  {
    id: 'acc-100',
    title: 'Flawless Run',
    description: 'Finish a session with 100% accuracy.',
  },
  {
    id: 'words-1000',
    title: 'Wordsmith 1K',
    description: 'Type 1,000 lifetime words.',
  },
  {
    id: 'streak-7',
    title: 'Seven-Day Rhythm',
    description: 'Maintain a 7-day practice streak.',
  },
  {
    id: 'lessons-10',
    title: 'Classroom Scholar',
    description: 'Earn stars in 10 or more Classroom lessons.',
  },
  {
    id: 'sessions-10',
    title: 'Dedicated Typist',
    description: 'Complete 10+ total sessions.',
  },
  {
    id: 'daily-first',
    title: 'Daily Challenger',
    description: 'Complete a Daily Challenge run.',
  },
];

type BadgeListener = (badge: BadgeDefinition) => void;
const badgeListeners = new Set<BadgeListener>();

export function subscribeBadgeToasts(listener: BadgeListener): () => void {
  badgeListeners.add(listener);
  return () => badgeListeners.delete(listener);
}

function emitBadgeToast(badge: BadgeDefinition): void {
  badgeListeners.forEach((fn) => fn(badge));
}

function mergeMetrics(
  existing: Record<string, KeyAggregateMetric> | undefined,
  incoming: CompletedSessionStats['keyStats'],
): Record<string, KeyAggregateMetric> {
  const next: Record<string, KeyAggregateMetric> = {...(existing ?? {})};
  if (!incoming) return next;
  for (const item of incoming) {
    const prev = next[item.key] ?? {hits: 0, errors: 0, totalLatencyMs: 0};
    next[item.key] = {
      hits: prev.hits + item.hits,
      errors: prev.errors + item.errors,
      totalLatencyMs: prev.totalLatencyMs + item.totalLatencyMs,
    };
  }
  return next;
}

function computeUpdatedStreak(
  lastDate: string | null,
  currentStreak: number,
  today: string,
): number {
  if (!lastDate) return 1;
  if (lastDate === today) return Math.max(1, currentStreak);
  const prevMs = new Date(`${lastDate}T00:00:00Z`).getTime();
  const todayMs = new Date(`${today}T00:00:00Z`).getTime();
  const diffDays = Math.round((todayMs - prevMs) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return currentStreak + 1;
  return 1;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function recordSessionAndBadges(
  progress: ProfileProgress,
  completed: CompletedSessionStats,
  mode: SceneId,
  extraPatch?: Partial<ProfileProgress>,
): Promise<ProfileProgress> {
  const today = getLocalDateKey();
  const nextStreak = computeUpdatedStreak(
    progress.lastPractisedDate,
    progress.streakDays,
    today,
  );

  const prevDaily = progress.dailyActivity ?? {};
  const todayRec: DailyActivityRecord = prevDaily[today] ?? {
    seconds: 0,
    words: 0,
    sessions: 0,
  };

  const sessionRecord: SessionRecord = {
    id: `sess-${Date.now()}`,
    profileId: progress.profileId,
    mode,
    subMode: completed.subMode,
    netWpm: completed.netWpm,
    grossWpm: completed.grossWpm,
    accuracy: completed.accuracy,
    consistency: completed.consistency,
    errors: completed.errors,
    durationSec: completed.durationSec,
    wordsTyped: completed.wordsTyped,
    xpEarned: completed.xpEarned,
    timestamp: Date.now(),
  };

  const merged: ProfileProgress = {
    ...progress,
    ...extraPatch,
    xp: progress.xp + completed.xpEarned,
    totalWordsTyped: progress.totalWordsTyped + completed.wordsTyped,
    totalTimeSec: progress.totalTimeSec + completed.durationSec,
    bestWpm: Math.max(progress.bestWpm, completed.netWpm),
    lastPractisedDate: today,
    streakDays: nextStreak,
    sessions: [sessionRecord, ...progress.sessions].slice(0, 250),
    keyMetrics: mergeMetrics(progress.keyMetrics, completed.keyStats),
    bigramMetrics: mergeMetrics(progress.bigramMetrics, completed.bigramStats),
    dailyActivity: {
      ...prevDaily,
      [today]: {
        seconds: todayRec.seconds + completed.durationSec,
        words: todayRec.words + completed.wordsTyped,
        sessions: todayRec.sessions + 1,
      },
    },
  };

  // Evaluate badge unlocks
  const existingSet = new Set(merged.badges);
  const newlyEarned: BadgeDefinition[] = [];
  const check = (id: string, condition: boolean) => {
    if (condition && !existingSet.has(id)) {
      existingSet.add(id);
      const def = BADGE_DEFINITIONS.find((b) => b.id === id);
      if (def) newlyEarned.push(def);
    }
  };

  check('first-session', merged.sessions.length >= 1);
  check('wpm-30', completed.netWpm >= 30 || merged.bestWpm >= 30);
  check('wpm-50', completed.netWpm >= 50 || merged.bestWpm >= 50);
  check('wpm-80', completed.netWpm >= 80 || merged.bestWpm >= 80);
  check('acc-95', completed.accuracy >= 95);
  check('acc-100', completed.accuracy >= 100);
  check('words-1000', merged.totalWordsTyped >= 1000);
  check('streak-7', merged.streakDays >= 7);
  check(
    'lessons-10',
    Object.values(merged.lessonStars).filter((s) => s > 0).length >= 10,
  );
  check('sessions-10', merged.sessions.length >= 10);
  check(
    'daily-first',
    mode === 'daily-challenge' ||
      Object.keys(merged.dailyChallengeHistory ?? {}).length >= 1,
  );

  merged.badges = Array.from(existingSet);
  await saveProfileProgress(merged);

  for (const b of newlyEarned) {
    emitBadgeToast(b);
  }

  return merged;
}
