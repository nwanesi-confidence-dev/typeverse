import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Play,
  Star,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {SessionResults} from '@/src/components/SessionResults';
import {TypingArena} from '@/src/components/TypingArena';
import {VirtualKeyboard} from '@/src/components/VirtualKeyboard';
import {WpmHud} from '@/src/components/WpmHud';
import {useAppearance} from '@/src/context/AppearanceContext';
import {
  CLASSROOM_LESSONS,
  LESSON_STAGES,
  PLACEMENT_TEST_TEXT,
  type ClassroomLesson,
} from '@/src/data/lessons';
import {
  getActiveProfileId,
  loadProfileProgress,
  loadProfiles,
} from '@/src/db/storage';
import type {ProfileProgress} from '@/src/types/app';
import type {CompletedSessionStats, TypingTelemetrySnapshot} from '@/src/types/typing';
import {adaptTextSpelling} from '@/src/utils/copy';
import {recordSessionAndBadges} from '@/src/utils/progression';

interface ClassroomSceneProps {
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

export const ClassroomScene: React.FC<ClassroomSceneProps> = ({
  onBack,
  activeProfileId,
}) => {
  const {settings, updateSetting} = useAppearance();
  const [selectedStageId, setSelectedStageId] = useState<number>(1);
  const [activeLesson, setActiveLesson] = useState<ClassroomLesson | null>(null);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [runKey, setRunKey] = useState(1);

  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [profileName, setProfileName] = useState('Typist');
  const [telemetry, setTelemetry] = useState<TypingTelemetrySnapshot>(INITIAL_TELEMETRY);
  const [results, setResults] = useState<CompletedSessionStats | null>(null);
  const [placementBanner, setPlacementBanner] = useState<string | null>(null);

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

      const currentUnlocked = CLASSROOM_LESSONS[Math.min(prog.unlockedLessonIndex, CLASSROOM_LESSONS.length - 1)];
      if (currentUnlocked) setSelectedStageId(currentUnlocked.stageId);
    })();
    return () => {
      active = false;
    };
  }, [activeProfileId]);

  const unlockedIndex = progress?.unlockedLessonIndex ?? 0;

  const stageLessons = useMemo(
    () => CLASSROOM_LESSONS.filter((l) => l.stageId === selectedStageId),
    [selectedStageId],
  );

  const earnedStarsTotal = useMemo(() => {
    if (!progress) return 0;
    return Object.values(progress.lessonStars).reduce((sum, s) => sum + s, 0);
  }, [progress]);

  const startLesson = useCallback((lesson: ClassroomLesson) => {
    soundEngine.playUiTap();
    setIsPlacementMode(false);
    setPlacementBanner(null);
    setActiveLesson(lesson);
    setResults(null);
    setTelemetry({...INITIAL_TELEMETRY, nextChar: lesson.text[0] ?? null});
    setRunKey((k) => k + 1);
  }, []);

  const startPlacementTest = useCallback(() => {
    soundEngine.playUiTap();
    setIsPlacementMode(true);
    setActiveLesson(null);
    setResults(null);
    setPlacementBanner(null);
    setTelemetry({...INITIAL_TELEMETRY, nextChar: PLACEMENT_TEST_TEXT[0] ?? null});
    setRunKey((k) => k + 1);
  }, []);

  const handleComplete = useCallback(
    async (completed: CompletedSessionStats) => {
      soundEngine.playMilestone();

      if (isPlacementMode) {
        let unlockedTo = unlockedIndex;
        let stageReached = 1;
        if (completed.accuracy >= 92) {
          if (completed.netWpm >= 60) {
            unlockedTo = Math.max(unlockedTo, 31); // Stage 8
            stageReached = 8;
          } else if (completed.netWpm >= 45) {
            unlockedTo = Math.max(unlockedTo, 27); // Stage 7
            stageReached = 7;
          } else if (completed.netWpm >= 35) {
            unlockedTo = Math.max(unlockedTo, 19); // Stage 5
            stageReached = 5;
          } else if (completed.netWpm >= 25) {
            unlockedTo = Math.max(unlockedTo, 10); // Stage 3
            stageReached = 3;
          }
        }

        const msg =
          completed.accuracy < 92
            ? `Placement accuracy was ${completed.accuracy.toFixed(1)}% (needs 92%+ to skip ahead). Starting from Stage 1.`
            : `Placement complete at ${completed.netWpm} WPM (${completed.accuracy.toFixed(1)}%) — unlocked up to Stage ${stageReached}!`;
        setPlacementBanner(msg);
        setSelectedStageId(stageReached);
        const enrichedPlacement: CompletedSessionStats = {
          ...completed,
          mode: 'classroom',
          subMode: 'Placement Test',
          passed: completed.accuracy >= 92,
          passRequirementText: msg,
        };
        setResults(enrichedPlacement);

        if (progress) {
          const nextProg = await recordSessionAndBadges(
            progress,
            enrichedPlacement,
            'classroom',
            {unlockedLessonIndex: unlockedTo},
          );
          setProgress(nextProg);
        }
        return;
      }

      if (!activeLesson) return;

      const passed =
        completed.accuracy >= activeLesson.minAccuracy &&
        completed.netWpm >= activeLesson.targetWpm;

      const stars: 1 | 2 | 3 = !passed
        ? 1
        : completed.accuracy >= 98 && completed.netWpm >= activeLesson.targetWpm + 15
          ? 3
          : completed.accuracy >= 96 && completed.netWpm >= activeLesson.targetWpm + 6
            ? 2
            : 1;

      const passText = passed
        ? `Lesson Passed (${stars}/3 stars)! Next lesson unlocked.`
        : `Requires ${activeLesson.minAccuracy}% accuracy and ${activeLesson.targetWpm} WPM to pass (got ${completed.accuracy.toFixed(1)}% · ${completed.netWpm} WPM).`;

      const enriched: CompletedSessionStats = {
        ...completed,
        mode: 'classroom',
        subMode: `Lesson ${activeLesson.index + 1}: ${activeLesson.title}`,
        stars: passed ? stars : 1,
        passed,
        passRequirementText: passText,
      };
      setResults(enriched);

      if (progress) {
        const prevStars = progress.lessonStars[activeLesson.id] ?? 0;
        const nextStars = passed ? Math.max(prevStars, stars) : prevStars;
        const nextUnlocked = passed
          ? Math.max(progress.unlockedLessonIndex, Math.min(CLASSROOM_LESSONS.length - 1, activeLesson.index + 1))
          : progress.unlockedLessonIndex;

        const nextProg = await recordSessionAndBadges(
          progress,
          enriched,
          'classroom',
          {
            unlockedLessonIndex: nextUnlocked,
            lessonStars: {
              ...progress.lessonStars,
              [activeLesson.id]: nextStars,
            },
          },
        );
        setProgress(nextProg);
      }
    },
    [activeLesson, isPlacementMode, progress, unlockedIndex],
  );

  const activeText = useMemo(() => {
    if (isPlacementMode) return adaptTextSpelling(PLACEMENT_TEST_TEXT, settings.spelling);
    if (activeLesson) return adaptTextSpelling(activeLesson.text, settings.spelling);
    return '';
  }, [activeLesson, isPlacementMode, settings.spelling]);

  const inLessonView = Boolean(activeLesson) || isPlacementMode;
  const isFocus = settings.layout === 'focus';

  if (inLessonView) {
    const title = isPlacementMode
      ? 'Classroom Placement Test'
      : `Lesson ${activeLesson!.index + 1}: ${activeLesson!.title}`;
    const targetWpm = isPlacementMode ? 40 : activeLesson!.targetWpm;

    return (
      <main className="mx-auto max-w-[1260px] px-4 py-6 sm:px-6 space-y-5">
        {!isFocus && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiTap();
                  setActiveLesson(null);
                  setIsPlacementMode(false);
                  setResults(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80"
                style={{color: 'var(--tv-accent)'}}
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Curriculum</span>
              </button>
              <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                updateSetting('keyboardVisible', !settings.keyboardVisible);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: 'var(--tv-border)',
                backgroundColor: 'var(--tv-surface)',
                color: 'var(--tv-text)',
              }}
            >
              {settings.keyboardVisible ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Hide Keyboard</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Show Keyboard</span>
                </>
              )}
            </button>
          </div>
        )}

        <WpmHud
          telemetry={telemetry}
          personalBestWpm={progress?.bestWpm ?? 0}
          targetWpm={targetWpm}
          showGhostPace
        />

        {results ? (
          <SessionResults
            stats={results}
            profileName={profileName}
            showCertificate={false}
            onRetry={() => {
              soundEngine.playUiTap();
              setResults(null);
              setRunKey((k) => k + 1);
            }}
            onNext={() => {
              if (isPlacementMode) {
                setIsPlacementMode(false);
                setResults(null);
                return;
              }
              if (activeLesson && activeLesson.index + 1 < CLASSROOM_LESSONS.length) {
                const next = CLASSROOM_LESSONS[activeLesson.index + 1];
                if (next.index <= (progress?.unlockedLessonIndex ?? 0)) {
                  startLesson(next);
                  return;
                }
              }
              setActiveLesson(null);
              setResults(null);
            }}
            onPractiseWeakKeys={() => {
              soundEngine.playUiTap();
              setResults(null);
              setRunKey((k) => k + 1);
            }}
          />
        ) : (
          <div className="space-y-4">
            {/* Chalkboard-inspired subtle lesson slate accent */}
            <div
              className="rounded-2xl p-1"
              style={{
                background:
                  'linear-gradient(145deg, rgba(16, 185, 129, 0.16), rgba(34, 211, 238, 0.1))',
              }}
            >
              <TypingArena
                key={`lesson-${activeLesson?.id ?? 'placement'}-${runKey}`}
                text={activeText}
                timeLimitSec={null}
                personalBestWpm={progress?.bestWpm ?? 0}
                targetWpm={targetWpm}
                modeLabel={title}
                onTelemetry={setTelemetry}
                onComplete={handleComplete}
                onRestart={() => {
                  soundEngine.playUiTap();
                  setRunKey((k) => k + 1);
                }}
              />
            </div>

            {settings.keyboardVisible && (
              <VirtualKeyboard nextChar={telemetry.nextChar} showFingerGuide />
            )}
          </div>
        )}
      </main>
    );
  }

  const currentStage =
    LESSON_STAGES.find((s) => s.id === selectedStageId) ?? LESSON_STAGES[0];

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 space-y-6">
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
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Classroom Curriculum
          </h1>
          <p className="text-sm" style={{color: 'var(--tv-text-muted)'}}>
            36 progressive lessons across 8 stages · Pass requires 95% accuracy + stage WPM target.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="tv-surface rounded-xl px-4 py-2 text-xs flex items-center gap-2"
            style={{color: 'var(--tv-text)'}}
          >
            <Star className="w-4 h-4" fill="#FBBF24" stroke="#FBBF24" aria-hidden="true" />
            <span className="font-typing font-bold tabular-nums">
              {earnedStarsTotal} / {CLASSROOM_LESSONS.length * 3}
            </span>
            <span style={{color: 'var(--tv-text-muted)'}}>stars</span>
          </div>

          <button
            type="button"
            onClick={startPlacementTest}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold"
            style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
          >
            <Award className="w-4 h-4" aria-hidden="true" />
            <span>Placement Test (Skip Ahead)</span>
          </button>
        </div>
      </div>

      {placementBanner && (
        <div
          className="rounded-xl border px-4 py-3 text-sm font-medium"
          style={{
            borderColor: 'var(--tv-accent)',
            backgroundColor: 'var(--tv-surface-elevated)',
            color: 'var(--tv-text)',
          }}
        >
          {placementBanner}
        </div>
      )}

      {/* 8-Stage Selector Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {LESSON_STAGES.map((stage) => {
          const stageLessonsList = CLASSROOM_LESSONS.filter(
            (l) => l.stageId === stage.id,
          );
          const firstIdx = stageLessonsList[0]?.index ?? 0;
          const stageUnlocked = unlockedIndex >= firstIdx;
          const active = selectedStageId === stage.id;
          const completedInStage = stageLessonsList.filter(
            (l) => (progress?.lessonStars[l.id] ?? 0) > 0,
          ).length;

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                setSelectedStageId(stage.id);
              }}
              className="rounded-xl border p-3 text-left transition-colors"
              style={{
                borderColor: active ? 'var(--tv-accent)' : 'var(--tv-border)',
                backgroundColor: active
                  ? 'var(--tv-surface-elevated)'
                  : 'var(--tv-surface)',
                opacity: stageUnlocked ? 1 : 0.72,
              }}
            >
              <div className="flex items-center justify-between text-[11px]" style={{color: 'var(--tv-text-muted)'}}>
                <span>Stage {stage.id}</span>
                {!stageUnlocked && <Lock className="w-3 h-3" aria-hidden="true" />}
              </div>
              <div className="font-display text-sm font-bold mt-1 truncate">
                {stage.title}
              </div>
              <div className="text-[11px] font-typing tabular-nums mt-1" style={{color: 'var(--tv-accent)'}}>
                {completedInStage}/{stageLessonsList.length} · {stage.targetWpm}+ WPM
              </div>
            </button>
          );
        })}
      </div>

      {/* Chalkboard Stage Panel + Lesson Cards */}
      <section className="tv-surface rounded-2xl p-6 space-y-5">
        <div
          className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b"
          style={{borderColor: 'var(--tv-border)'}}
        >
          <div>
            <h2 className="font-display text-xl font-bold">
              Stage {currentStage.id}: {currentStage.title}
            </h2>
            <p className="text-sm mt-0.5" style={{color: 'var(--tv-text-muted)'}}>
              {currentStage.description}
            </p>
          </div>
          <div className="text-xs font-typing tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
            Pass target: <strong style={{color: 'var(--tv-text)'}}>{currentStage.minAccuracy}% accuracy</strong> ·{' '}
            <strong style={{color: 'var(--tv-accent)'}}>{currentStage.targetWpm} WPM</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stageLessons.map((lesson) => {
            const isUnlocked = lesson.index <= unlockedIndex;
            const stars = progress?.lessonStars[lesson.id] ?? 0;

            return (
              <div
                key={lesson.id}
                className="rounded-xl border p-4 flex flex-col justify-between gap-4"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: stars > 0 ? 'var(--tv-success)' : 'var(--tv-border)',
                  opacity: isUnlocked ? 1 : 0.65,
                }}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs" style={{color: 'var(--tv-text-muted)'}}>
                    <span>Lesson {lesson.index + 1} · {lesson.targetWpm} WPM</span>
                    <div className="flex items-center gap-0.5" aria-label={`${stars} stars`}>
                      {[1, 2, 3].map((n) => (
                        <Star
                          key={n}
                          className="w-3.5 h-3.5"
                          fill={n <= stars ? '#FBBF24' : 'transparent'}
                          stroke={n <= stars ? '#FBBF24' : 'var(--tv-border)'}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>
                  <h3 className="font-display text-base font-bold flex items-center gap-1.5">
                    {stars > 0 && (
                      <CheckCircle2
                        className="w-4 h-4 shrink-0"
                        style={{color: 'var(--tv-success)'}}
                        aria-hidden="true"
                      />
                    )}
                    <span>{lesson.title}</span>
                  </h3>
                  <p className="text-xs leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
                    {lesson.subtitle}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!isUnlocked}
                  onClick={() => startLesson(lesson)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-opacity disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isUnlocked
                      ? 'var(--tv-accent)'
                      : 'var(--tv-surface-elevated)',
                    color: isUnlocked ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                  }}
                >
                  {isUnlocked ? (
                    <>
                      <Play className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{stars > 0 ? 'Practise Again' : 'Start Lesson'}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Complete Lesson {lesson.index} to unlock</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
};
