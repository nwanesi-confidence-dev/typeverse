import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Download,
  Flame,
  Printer,
  RotateCcw,
  Upload,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {KeyboardHeatmap} from '@/src/components/KeyboardHeatmap';
import {
  createEmptyProgress,
  getActiveProfileId,
  loadProfileProgress,
  loadProfiles,
  saveProfileProgress,
} from '@/src/db/storage';
import type {ProfileProgress, SceneId, UserProfile} from '@/src/types/app';
import type {DesktopBackupSnapshot} from '@/src/types/desktop';
import type {CompletedSessionStats} from '@/src/types/typing';
import {downloadCertificatePng} from '@/src/utils/certificate';
import {
  applyBackupSnapshotToStorage,
  buildDesktopBackupSnapshot,
  flushDesktopBackupNow,
} from '@/src/utils/desktopBackup';
import {BADGE_DEFINITIONS, getLocalDateKey, getXpRank} from '@/src/utils/progression';

interface DashboardSceneProps {
  onBack: () => void;
  activeProfileId: string;
}

const MODE_LABELS: Array<{id: SceneId; label: string}> = [
  {id: 'speed-test', label: 'Speed Test'},
  {id: 'classroom', label: 'Classroom'},
  {id: 'skill-lab', label: 'Skill Lab'},
  {id: 'free-practice', label: 'Free Practice'},
  {id: 'arcade', label: 'Arcade'},
  {id: 'daily-challenge', label: 'Daily Challenge'},
];

export const DashboardScene: React.FC<DashboardSceneProps> = ({
  onBack,
  activeProfileId,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const pid = activeProfileId || (await getActiveProfileId());
      const [profiles, prog] = await Promise.all([
        loadProfiles(),
        loadProfileProgress(pid),
      ]);
      if (!active) return;
      setProfile(profiles.find((p) => p.id === pid) ?? profiles[0] ?? null);
      setProgress(prog);
    })();
    return () => {
      active = false;
    };
  }, [activeProfileId]);

  const rank = useMemo(() => getXpRank(progress?.xp ?? 0), [progress?.xp]);

  const avgAccuracy = useMemo(() => {
    if (!progress || progress.sessions.length === 0) return 0;
    const sum = progress.sessions.reduce((acc, s) => acc + s.accuracy, 0);
    return Math.round((sum / progress.sessions.length) * 10) / 10;
  }, [progress]);

  // Last 20 sessions chronological for SVG trend charts
  const trendSessions = useMemo(() => {
    if (!progress) return [];
    return [...progress.sessions].slice(0, 20).reverse();
  }, [progress]);

  const wpmPolyline = useMemo(() => {
    if (trendSessions.length < 2) return '';
    const maxWpm = Math.max(80, ...trendSessions.map((s) => s.netWpm));
    return trendSessions
      .map((s, idx) => {
        const x = 14 + (idx / (trendSessions.length - 1)) * 472;
        const y = 114 - (s.netWpm / maxWpm) * 96;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [trendSessions]);

  const accPolyline = useMemo(() => {
    if (trendSessions.length < 2) return '';
    return trendSessions
      .map((s, idx) => {
        const x = 14 + (idx / (trendSessions.length - 1)) * 472;
        const clamped = Math.max(70, Math.min(100, s.accuracy));
        const y = 114 - ((clamped - 70) / 30) * 96;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [trendSessions]);

  // 12-week (84 days) streak calendar
  const calendarDays = useMemo(() => {
    const today = new Date();
    const activity = progress?.dailyActivity ?? {};
    const days: Array<{date: string; seconds: number}> = [];
    for (let offset = 83; offset >= 0; offset--) {
      const d = new Date(today);
      d.setDate(today.getDate() - offset);
      const iso = getLocalDateKey(d);
      days.push({date: iso, seconds: activity[iso]?.seconds ?? 0});
    }
    return days;
  }, [progress?.dailyActivity]);

  const todayIso = getLocalDateKey();
  const todayMinutes = Math.round(
    ((progress?.dailyActivity?.[todayIso]?.seconds ?? 0) / 60) * 10,
  ) / 10;
  const dailyGoalPct = progress
    ? Math.min(100, Math.round((todayMinutes / Math.max(1, progress.dailyGoalMinutes)) * 100))
    : 0;

  const bestPerMode = useMemo(() => {
    const sessions = progress?.sessions ?? [];
    return MODE_LABELS.map((m) => {
      const matching = sessions.filter((s) => s.mode === m.id);
      const best = matching.reduce((max, s) => Math.max(max, s.netWpm), 0);
      return {
        ...m,
        count: matching.length,
        bestWpm: best,
      };
    });
  }, [progress?.sessions]);

  const handleUpdateGoal = (patch: Partial<Pick<ProfileProgress, 'targetWpm' | 'dailyGoalMinutes'>>) => {
    if (!progress) return;
    const next = {...progress, ...patch};
    setProgress(next);
    void saveProfileProgress(next).then(() => flushDesktopBackupNow());
  };

  const applyImportedJsonText = async (raw: string) => {
    if (!progress) return;
    const parsed = JSON.parse(raw) as Partial<DesktopBackupSnapshot> & {
      progress?: Partial<ProfileProgress>;
    };
    if (Array.isArray(parsed.profiles) && parsed.progressByProfile) {
      const ok = await applyBackupSnapshotToStorage(parsed);
      if (!ok) {
        setStatusMessage('Invalid backup file format.');
        return;
      }
      const nextProg = await loadProfileProgress(progress.profileId);
      setProgress(nextProg);
      await flushDesktopBackupNow();
      setStatusMessage('Full backup imported and restored successfully.');
      return;
    }
    if (!parsed.progress || typeof parsed.progress.xp !== 'number') {
      setStatusMessage('Invalid backup file format.');
      return;
    }
    const restored: ProfileProgress = {
      ...createEmptyProgress(progress.profileId),
      ...parsed.progress,
      profileId: progress.profileId,
    };
    await saveProfileProgress(restored);
    setProgress(restored);
    await flushDesktopBackupNow();
    setStatusMessage('Progress imported and restored successfully.');
  };

  const handleExportJson = async () => {
    if (!progress || !profile) return;
    soundEngine.playUiTap();
    if (window.desktop?.isDesktop) {
      const snapshot = await buildDesktopBackupSnapshot();
      const res = await window.desktop.data.exportProgress(
        JSON.stringify(snapshot, null, 2),
        `typeverse-backup-${profile.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`,
      );
      if (res.saved) {
        setStatusMessage('Progress backup exported.');
      }
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      profile,
      progress,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `typeverse-backup-${profile.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Progress backup exported as JSON.');
  };

  const handleImportButton = async () => {
    if (window.desktop?.isDesktop) {
      soundEngine.playUiTap();
      const res = await window.desktop.data.importProgress();
      if (!res.content) return;
      try {
        await applyImportedJsonText(res.content);
      } catch {
        setStatusMessage('Could not read JSON backup file.');
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !progress) return;
    try {
      const raw = await file.text();
      await applyImportedJsonText(raw);
    } catch {
      setStatusMessage('Could not read JSON backup file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleResetProgress = async () => {
    if (!progress) return;
    soundEngine.playUiTap();
    const fresh = createEmptyProgress(progress.profileId);
    await saveProfileProgress(fresh);
    setProgress(fresh);
    setConfirmReset(false);
    await flushDesktopBackupNow();
    setStatusMessage('Profile progress has been reset.');
  };

  const handleDownloadTopCertificate = () => {
    if (!progress || !profile) return;
    const topSession =
      [...progress.sessions].sort((a, b) => b.netWpm - a.netWpm)[0] ?? null;
    const certStats: CompletedSessionStats = {
      mode: topSession?.mode ?? 'speed-test',
      subMode: topSession?.subMode ?? 'Personal Best Record',
      netWpm: topSession?.netWpm ?? progress.bestWpm,
      grossWpm: topSession?.grossWpm ?? progress.bestWpm,
      cpm: (topSession?.netWpm ?? progress.bestWpm) * 5,
      accuracy: topSession?.accuracy ?? 100,
      consistency: topSession?.consistency ?? 100,
      errors: topSession?.errors ?? 0,
      uncorrectedErrors: 0,
      totalKeystrokes: 0,
      correctKeystrokes: 0,
      durationSec: topSession?.durationSec ?? 60,
      wordsTyped: topSession?.wordsTyped ?? progress.totalWordsTyped,
      stars: 3,
      xpEarned: topSession?.xpEarned ?? 0,
      isNewBest: false,
      previousBestWpm: progress.bestWpm,
      slowestKeys: [],
      weakKeys: [],
      wpmOverTime: [],
      textKind: 'paragraphs',
    };
    downloadCertificatePng(certStats, profile.name);
  };

  const totalMinutesPractised = Math.round((progress?.totalTimeSec ?? 0) / 60);
  const ringR = 34;
  const ringCirc = 2 * Math.PI * ringR;
  const ringDash = (dailyGoalPct / 100) * ringCirc;

  return (
    <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 space-y-6">
      {/* Header Row */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
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
            {profile?.name ?? 'Typist'} · Progress & Mastery
          </h1>
          <p className="text-sm" style={{color: 'var(--tv-text-muted)'}}>
            Rank: <strong style={{color: 'var(--tv-accent)'}}>{rank.current.name}</strong> ·{' '}
            <span className="font-typing tabular-nums">{progress?.xp ?? 0} XP</span>
            {rank.current.nextXp ? ` / ${rank.current.nextXp} XP to next tier` : ' (Max Tier)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTopCertificate}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
            style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}
          >
            <Award className="w-3.5 h-3.5" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
            <span>Best Certificate (PNG)</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
            style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Print Report</span>
          </button>

          <button
            type="button"
            onClick={() => void handleExportJson()}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
            style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => void handleImportButton()}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
            style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Import JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={(e) => void handleImportJson(e)}
            className="hidden"
          />
        </div>
      </div>

      {statusMessage && (
        <div
          className="no-print rounded-xl border px-4 py-2.5 text-xs font-medium"
          style={{
            borderColor: 'var(--tv-accent)',
            backgroundColor: 'var(--tv-surface-elevated)',
            color: 'var(--tv-text)',
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Lifetime Stats + XP Ladder + Daily Goal Ring */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="tv-surface rounded-xl p-4">
            <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Best Net Speed</div>
            <div className="font-typing text-3xl font-bold tabular-nums mt-1" style={{color: 'var(--tv-accent)'}}>
              {progress?.bestWpm ?? 0}
            </div>
            <div className="text-[11px] mt-1" style={{color: 'var(--tv-text-muted)'}}>WPM record</div>
          </div>

          <div className="tv-surface rounded-xl p-4">
            <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Avg Accuracy</div>
            <div className="font-typing text-3xl font-bold tabular-nums mt-1" style={{color: 'var(--tv-success)'}}>
              {avgAccuracy}%
            </div>
            <div className="text-[11px] mt-1" style={{color: 'var(--tv-text-muted)'}}>
              {progress?.sessions.length ?? 0} sessions
            </div>
          </div>

          <div className="tv-surface rounded-xl p-4">
            <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Words Typed</div>
            <div className="font-typing text-3xl font-bold tabular-nums mt-1">
              {(progress?.totalWordsTyped ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] mt-1" style={{color: 'var(--tv-text-muted)'}}>
              {totalMinutesPractised} mins practised
            </div>
          </div>

          <div className="tv-surface rounded-xl p-4">
            <div className="text-xs" style={{color: 'var(--tv-text-muted)'}}>Current Streak</div>
            <div className="font-typing text-3xl font-bold tabular-nums mt-1 flex items-center gap-1.5">
              <Flame className="w-6 h-6" style={{color: 'var(--tv-warning)'}} aria-hidden="true" />
              <span>{progress?.streakDays ?? 0}d</span>
            </div>
            <div className="text-[11px] mt-1" style={{color: 'var(--tv-text-muted)'}}>
              XP Level: {rank.current.name}
            </div>
          </div>

          {/* XP Ladder Bar */}
          <div className="col-span-2 sm:col-span-4 tv-surface rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">XP Ladder · {rank.current.name}</span>
              <span className="font-typing tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                {rank.progressPct}% to next rank
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full overflow-hidden" style={{backgroundColor: 'var(--tv-bg)'}}>
              <div
                className="h-full rounded-full"
                style={{width: `${rank.progressPct}%`, backgroundColor: 'var(--tv-accent)'}}
              />
            </div>
            <div className="flex justify-between text-[11px]" style={{color: 'var(--tv-text-muted)'}}>
              <span>Novice</span>
              <span>Learner</span>
              <span>Typist</span>
              <span>Speedster</span>
              <span>Pro</span>
              <span>Wizard</span>
            </div>
          </div>
        </div>

        {/* Goals & Daily Progress Ring */}
        <div className="lg:col-span-4 tv-surface rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center gap-4">
            <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0" aria-label="Daily goal progress ring">
              <circle cx="42" cy="42" r={ringR} fill="none" stroke="var(--tv-border)" strokeWidth="7" />
              <circle
                cx="42"
                cy="42"
                r={ringR}
                fill="none"
                stroke="var(--tv-accent)"
                strokeWidth="7"
                strokeDasharray={`${ringDash} ${ringCirc}`}
                strokeLinecap="round"
                transform="rotate(-90 42 42)"
              />
              <text
                x="42"
                y="46"
                textAnchor="middle"
                fill="var(--tv-text)"
                fontSize="13"
                fontWeight="700"
                className="font-typing"
              >
                {dailyGoalPct}%
              </text>
            </svg>
            <div>
              <h2 className="font-display text-base font-bold">Daily Practice Goal</h2>
              <p className="text-xs font-typing tabular-nums mt-0.5" style={{color: 'var(--tv-text-muted)'}}>
                {todayMinutes} / {progress?.dailyGoalMinutes ?? 15} mins today
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between">
                <label htmlFor="goal-wpm">Target Speed</label>
                <span className="font-typing font-bold tabular-nums" style={{color: 'var(--tv-accent)'}}>
                  {progress?.targetWpm ?? 60} WPM
                </span>
              </div>
              <input
                id="goal-wpm"
                type="range"
                min={25}
                max={120}
                step={5}
                value={progress?.targetWpm ?? 60}
                onChange={(e) => handleUpdateGoal({targetWpm: Number(e.target.value)})}
                className="w-full accent-current"
                style={{color: 'var(--tv-accent)'}}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <label htmlFor="goal-mins">Daily Minutes</label>
                <span className="font-typing font-bold tabular-nums" style={{color: 'var(--tv-accent)'}}>
                  {progress?.dailyGoalMinutes ?? 15} min
                </span>
              </div>
              <input
                id="goal-mins"
                type="range"
                min={5}
                max={60}
                step={5}
                value={progress?.dailyGoalMinutes ?? 15}
                onChange={(e) => handleUpdateGoal({dailyGoalMinutes: Number(e.target.value)})}
                className="w-full accent-current"
                style={{color: 'var(--tv-accent)'}}
              />
            </div>
          </div>
        </div>
      </section>

      {/* WPM & Accuracy Trend SVG Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="tv-surface rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display text-sm font-bold">Net WPM Trend</span>
            <span style={{color: 'var(--tv-text-muted)'}}>Last {trendSessions.length} sessions</span>
          </div>
          {trendSessions.length < 2 ? (
            <p className="py-10 text-center text-xs" style={{color: 'var(--tv-text-muted)'}}>
              Complete at least 2 sessions to plot your WPM progression.
            </p>
          ) : (
            <svg viewBox="0 0 500 130" className="w-full h-32" aria-label="Net WPM trend chart">
              <line x1="14" y1="114" x2="486" y2="114" stroke="var(--tv-border)" />
              <line x1="14" y1="66" x2="486" y2="66" stroke="var(--tv-border)" strokeDasharray="3 4" />
              <polyline
                fill="none"
                stroke="var(--tv-accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={wpmPolyline}
              />
            </svg>
          )}
        </div>

        <div className="tv-surface rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display text-sm font-bold">Accuracy Trend</span>
            <span style={{color: 'var(--tv-text-muted)'}}>70% – 100% scale</span>
          </div>
          {trendSessions.length < 2 ? (
            <p className="py-10 text-center text-xs" style={{color: 'var(--tv-text-muted)'}}>
              Complete at least 2 sessions to plot your accuracy curve.
            </p>
          ) : (
            <svg viewBox="0 0 500 130" className="w-full h-32" aria-label="Accuracy trend chart">
              <line x1="14" y1="114" x2="486" y2="114" stroke="var(--tv-border)" />
              <line x1="14" y1="66" x2="486" y2="66" stroke="var(--tv-border)" strokeDasharray="3 4" />
              <polyline
                fill="none"
                stroke="var(--tv-success)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={accPolyline}
              />
            </svg>
          )}
        </div>
      </section>

      {/* Streak Calendar + Best Score Per Mode */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 tv-surface rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold">12-Week Practice Calendar</h2>
            <span className="text-xs" style={{color: 'var(--tv-text-muted)'}}>84-day history</span>
          </div>
          <div className="grid grid-cols-12 sm:grid-cols-14 gap-1.5" style={{gridTemplateColumns: 'repeat(14, minmax(0, 1fr))'}}>
            {calendarDays.map((day) => {
              const mins = day.seconds / 60;
              const opacity =
                mins === 0 ? 0.14 : mins < 5 ? 0.4 : mins < 15 ? 0.72 : 1;
              return (
                <div
                  key={day.date}
                  title={`${day.date}: ${Math.round(mins)} min practised`}
                  className="aspect-square rounded-xs border"
                  style={{
                    borderColor: 'var(--tv-border)',
                    backgroundColor: mins > 0 ? 'var(--tv-accent)' : 'var(--tv-surface-elevated)',
                    opacity,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 tv-surface rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-base font-bold">Best Score by Mode</h2>
          <div className="space-y-2">
            {bestPerMode.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between text-xs py-1.5 border-b last:border-b-0"
                style={{borderColor: 'var(--tv-border)'}}
              >
                <span className="font-medium">{m.label}</span>
                <span className="font-typing tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
                  <strong style={{color: m.bestWpm > 0 ? 'var(--tv-accent)' : 'var(--tv-text-muted)'}}>
                    {m.bestWpm} WPM
                  </strong>{' '}
                  · {m.count} runs
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Keyboard Heatmap */}
      <KeyboardHeatmap keyMetrics={progress?.keyMetrics ?? {}} />

      {/* Badges Gallery */}
      <section className="tv-surface rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold">Mastery Badges</h2>
          <span className="font-typing text-xs tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
            {progress?.badges.length ?? 0} / {BADGE_DEFINITIONS.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {BADGE_DEFINITIONS.map((b) => {
            const unlocked = progress?.badges.includes(b.id) ?? false;
            return (
              <div
                key={b.id}
                className="rounded-xl border p-3.5 space-y-1.5"
                style={{
                  backgroundColor: 'var(--tv-bg)',
                  borderColor: unlocked ? 'var(--tv-accent)' : 'var(--tv-border)',
                  opacity: unlocked ? 1 : 0.6,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold">{b.title}</span>
                  {unlocked && (
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{color: 'var(--tv-success)'}} aria-hidden="true" />
                  )}
                </div>
                <p className="text-xs leading-relaxed" style={{color: 'var(--tv-text-muted)'}}>
                  {b.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Danger Zone: Reset with two-step inline confirmation */}
      <section className="no-print tv-surface rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-sm font-bold">Reset Local Progress</h2>
          <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
            Clear sessions, stars, XP, and heatmap history for {profile?.name ?? 'this profile'}.
          </p>
        </div>

        {confirmReset ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleResetProgress()}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white"
              style={{backgroundColor: 'var(--tv-error)'}}
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="rounded-xl border px-3 py-2 text-xs font-medium"
              style={{borderColor: 'var(--tv-border)'}}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium"
            style={{borderColor: 'var(--tv-error)', color: 'var(--tv-error)'}}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Progress</span>
          </button>
        )}
      </section>
    </main>
  );
};
