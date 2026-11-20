import React, {useEffect, useState} from 'react';
import {
  Download,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {THEME_OPTIONS, useAppearance} from '@/src/context/AppearanceContext';
import type {
  BackspaceMode,
  CaretStyle,
  FontChoice,
  LayoutDensity,
  SpellingVariant,
  TextSize,
} from '@/src/types/app';
import type {DesktopBackupSnapshot} from '@/src/types/desktop';
import {
  applyBackupSnapshotToStorage,
  buildDesktopBackupSnapshot,
  flushDesktopBackupNow,
} from '@/src/utils/desktopBackup';
import {
  getFreshWordsStatus,
  isValidPackSourceUrl,
  manualRefreshFreshPack,
  subscribeFreshWordsStatus,
  type FreshWordsStatus,
} from '@/src/utils/freshWordsClient';

interface AppearanceDrawerProps {
  open: boolean;
  isOnline: boolean;
  onClose: () => void;
}

const TEXT_SIZE_PX: Record<TextSize, string> = {
  S: '1rem',
  M: '1.2rem',
  L: '1.45rem',
  XL: '1.75rem',
};

export const AppearanceDrawer: React.FC<AppearanceDrawerProps> = ({
  open,
  isOnline,
  onClose,
}) => {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktop?.isDesktop);
  const {settings, updateSetting, resetSettings, copy} = useAppearance();
  const [freshStatus, setFreshStatus] = useState<FreshWordsStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const [hwAccelDisabled, setHwAccelDisabled] = useState(false);
  const [hwAccelRestartRequired, setHwAccelRestartRequired] = useState(false);
  const [customUrlDraft, setCustomUrlDraft] = useState(settings.customPacksUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [dataNote, setDataNote] = useState<string | null>(null);

  useEffect(() => {
    setCustomUrlDraft(settings.customPacksUrl);
  }, [settings.customPacksUrl]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const sync = () => {
      void getFreshWordsStatus(settings).then((st) => {
        if (active) setFreshStatus(st);
      });
    };
    sync();
    if (isDesktop && window.desktop) {
      void window.desktop.hwAccel.getDisabled().then((disabled) => {
        if (active) setHwAccelDisabled(disabled);
      });
    }
    const unsub = subscribeFreshWordsStatus(sync);
    return () => {
      active = false;
      unsub();
    };
  }, [open, isDesktop, settings]);

  if (!open) return null;

  const handleRefreshWords = async () => {
    if (!isOnline || refreshing) return;
    soundEngine.playUiTap();
    setRefreshing(true);
    setRefreshNote(null);
    const outcome = await manualRefreshFreshPack(settings);
    setRefreshing(false);
    if (outcome.message) {
      setRefreshNote(outcome.message);
    }
    const next = await getFreshWordsStatus(settings);
    setFreshStatus(next);
  };

  const handleSavePacksUrl = (rawValue: string) => {
    setCustomUrlDraft(rawValue);
    const trimmed = rawValue.trim();
    if (!isValidPackSourceUrl(trimmed)) {
      setUrlError('Use https://, http://localhost, or leave empty for default.');
      return;
    }
    setUrlError(null);
    updateSetting('customPacksUrl', trimmed);
  };

  const handleToggleHwAccel = async (nextDisabled: boolean) => {
    if (!window.desktop) return;
    soundEngine.playUiTap();
    const res = await window.desktop.hwAccel.setDisabled(nextDisabled);
    setHwAccelDisabled(res.disabled);
    setHwAccelRestartRequired(res.restartRequired);
  };

  const handleNativeExport = async () => {
    if (!window.desktop) return;
    soundEngine.playUiTap();
    const snapshot = await buildDesktopBackupSnapshot();
    const res = await window.desktop.data.exportProgress(
      JSON.stringify(snapshot, null, 2),
      `typeverse-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
    if (res.saved) {
      setDataNote('Progress backup exported.');
    }
  };

  const handleNativeImport = async () => {
    if (!window.desktop) return;
    soundEngine.playUiTap();
    const res = await window.desktop.data.importProgress();
    if (!res.content) return;
    try {
      const parsed = JSON.parse(res.content) as Partial<DesktopBackupSnapshot>;
      const restored = await applyBackupSnapshotToStorage(parsed);
      if (restored) {
        await flushDesktopBackupNow();
        setDataNote('Backup restored. Reloading workspace...');
        window.setTimeout(() => window.location.reload(), 650);
      } else {
        setDataNote('Invalid backup file format.');
      }
    } catch {
      setDataNote('Could not parse selected backup file.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appearance-title"
      onClick={onClose}
    >
      <aside
        className="tv-surface h-full w-full max-w-md overflow-y-auto p-6 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between pb-4 border-b"
          style={{borderColor: 'var(--tv-border)'}}
        >
          <div>
            <h2 id="appearance-title" className="font-display text-xl font-bold">
              Appearance & Controls
            </h2>
            <p className="text-xs mt-0.5" style={{color: 'var(--tv-text-muted)'}}>
              Changes preview live and save automatically offline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-opacity hover:opacity-80"
            style={{color: 'var(--tv-text-muted)'}}
            aria-label="Close appearance settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Typing Preview */}
        <div
          className="rounded-xl border p-4 space-y-2"
          style={{
            backgroundColor: 'var(--tv-bg)',
            borderColor: 'var(--tv-border)',
          }}
        >
          <div className="flex items-center justify-between text-xs" style={{color: 'var(--tv-text-muted)'}}>
            <span>Live typing preview</span>
            <span className="font-typing tabular-nums">
              {settings.textSize} · {settings.caretStyle} caret
            </span>
          </div>
          <div
            className="font-typing leading-relaxed tracking-normal select-none overflow-hidden"
            style={{fontSize: TEXT_SIZE_PX[settings.textSize]}}
          >
            <span style={{color: 'var(--tv-success)'}}>quick brown </span>
            <span
              className="underline decoration-2 underline-offset-4"
              style={{color: 'var(--tv-error)'}}
            >
              f
            </span>
            <span className="relative inline-flex items-center">
              {settings.caretStyle === 'line' && (
                <span
                  className="tv-caret-blink inline-block w-0.5 h-[1.15em] mr-px rounded-xs"
                  style={{backgroundColor: 'var(--tv-accent)'}}
                  aria-hidden="true"
                />
              )}
              <span
                style={
                  settings.caretStyle === 'block'
                    ? {
                        backgroundColor: 'var(--tv-accent)',
                        color: 'var(--tv-accent-fg)',
                        borderRadius: '2px',
                        paddingInline: '2px',
                      }
                    : settings.caretStyle === 'underline'
                      ? {
                          borderBottom: '2.5px solid var(--tv-accent)',
                        }
                      : undefined
                }
              >
                o
              </span>
            </span>
            <span style={{color: 'var(--tv-text-muted)'}}>x jumps over</span>
          </div>
        </div>

        {/* Colour Theme */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold">{copy('colour')} Theme</h3>
          <div className="grid grid-cols-1 gap-2">
            {THEME_OPTIONS.map((theme) => {
              const selected = settings.theme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiTap();
                    updateSetting('theme', theme.id);
                  }}
                  className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors"
                  style={{
                    borderColor: selected ? 'var(--tv-accent)' : 'var(--tv-border)',
                    backgroundColor: selected ? 'var(--tv-surface-elevated)' : 'transparent',
                  }}
                >
                  <span className="text-sm font-medium">{theme.name}</span>
                  <span className="flex items-center gap-1.5" aria-hidden="true">
                    <span
                      className="w-4 h-4 rounded-full border"
                      style={{backgroundColor: theme.previewBg, borderColor: 'var(--tv-border)'}}
                    />
                    <span
                      className="w-4 h-4 rounded-full border"
                      style={{backgroundColor: theme.previewSurface, borderColor: 'var(--tv-border)'}}
                    />
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{backgroundColor: theme.previewAccent}}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Layout Density */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Layout</h3>
          <div
            className="grid grid-cols-3 gap-1.5 rounded-xl p-1 border"
            style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
          >
            {(
              [
                {id: 'comfortable', label: 'Comfortable'},
                {id: 'compact', label: 'Compact'},
                {id: 'focus', label: 'Focus'},
              ] as Array<{id: LayoutDensity; label: string}>
            ).map((opt) => {
              const active = settings.layout === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiTap();
                    updateSetting('layout', opt.id);
                  }}
                  className="rounded-lg px-2 py-2 text-xs font-medium whitespace-nowrap transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--tv-accent)' : 'transparent',
                    color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Text Size & Caret */}
        <div className="grid grid-cols-2 gap-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Text Size</h3>
            <div
              className="grid grid-cols-4 gap-1 rounded-xl p-1 border"
              style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
            >
              {(['S', 'M', 'L', 'XL'] as TextSize[]).map((sz) => {
                const active = settings.textSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiTap();
                      updateSetting('textSize', sz);
                    }}
                    className="rounded-lg py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--tv-accent)' : 'transparent',
                      color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                    }}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Caret Style</h3>
            <div
              className="grid grid-cols-3 gap-1 rounded-xl p-1 border"
              style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
            >
              {(
                [
                  {id: 'line', label: 'Line'},
                  {id: 'block', label: 'Block'},
                  {id: 'underline', label: 'Bar'},
                ] as Array<{id: CaretStyle; label: string}>
              ).map((c) => {
                const active = settings.caretStyle === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiTap();
                      updateSetting('caretStyle', c.id);
                    }}
                    className="rounded-lg py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--tv-accent)' : 'transparent',
                      color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Font Choice */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Typing Font</h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                {id: 'jetbrains-mono', label: 'JetBrains'},
                {id: 'ibm-plex-mono', label: 'IBM Plex'},
                {id: 'system-mono', label: 'System'},
              ] as Array<{id: FontChoice; label: string}>
            ).map((f) => {
              const active = settings.fontChoice === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playUiTap();
                    updateSetting('fontChoice', f.id);
                  }}
                  className="rounded-xl border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors"
                  style={{
                    borderColor: active ? 'var(--tv-accent)' : 'var(--tv-border)',
                    backgroundColor: active ? 'var(--tv-surface-elevated)' : 'transparent',
                    color: active ? 'var(--tv-accent)' : 'var(--tv-text)',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Spelling & Backspace Mode */}
        <div className="grid grid-cols-1 gap-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Spelling Variant</h3>
            <div
              className="grid grid-cols-2 gap-1.5 rounded-xl p-1 border"
              style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
            >
              {(
                [
                  {id: 'british', label: 'British English'},
                  {id: 'american', label: 'American English'},
                ] as Array<{id: SpellingVariant; label: string}>
              ).map((sp) => {
                const active = settings.spelling === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiTap();
                      updateSetting('spelling', sp.id);
                    }}
                    className="rounded-lg px-2 py-2 text-xs font-medium whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--tv-accent)' : 'transparent',
                      color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                    }}
                  >
                    {sp.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Backspace Mode</h3>
            <div
              className="grid grid-cols-3 gap-1 rounded-xl p-1 border"
              style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
            >
              {(
                [
                  {id: 'standard', label: 'Standard'},
                  {id: 'strict', label: 'Strict'},
                  {id: 'forgiving', label: 'Forgiving'},
                ] as Array<{id: BackspaceMode; label: string}>
              ).map((bm) => {
                const active = settings.backspaceMode === bm.id;
                return (
                  <button
                    key={bm.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playUiTap();
                      updateSetting('backspaceMode', bm.id);
                    }}
                    className="rounded-lg px-2 py-2 text-xs font-medium whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--tv-accent)' : 'transparent',
                      color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text-muted)',
                    }}
                  >
                    {bm.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Sound Volume */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="sound-volume-slider" className="text-sm font-semibold flex items-center gap-2">
              <Volume2 className="w-4 h-4" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
              <span>Sound Volume</span>
            </label>
            <span className="font-typing text-xs tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
              {settings.soundVolume}%
            </span>
          </div>
          <input
            id="sound-volume-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.soundVolume}
            onChange={(e) => {
              const vol = Number(e.target.value);
              updateSetting('soundVolume', vol);
              soundEngine.setVolume(vol);
              soundEngine.playKeyClick();
            }}
            className="w-full accent-current cursor-pointer"
            style={{color: 'var(--tv-accent)'}}
          />
        </section>

        {/* Toggles */}
        <section className="space-y-3 pt-1">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-medium">Show on-screen keyboard</span>
            <input
              type="checkbox"
              checked={settings.keyboardVisible}
              onChange={(e) => {
                soundEngine.playUiTap();
                updateSetting('keyboardVisible', e.target.checked);
              }}
              className="h-4 w-4 accent-current"
              style={{color: 'var(--tv-accent)'}}
            />
          </label>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-medium">Reduced motion</span>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => {
                soundEngine.playUiTap();
                updateSetting('reducedMotion', e.target.checked);
              }}
              className="h-4 w-4 accent-current"
              style={{color: 'var(--tv-accent)'}}
            />
          </label>
        </section>

        {/* Static Fresh Word Packs */}
        <section
          className="rounded-xl border p-4 space-y-3"
          style={{
            backgroundColor: 'var(--tv-bg)',
            borderColor: 'var(--tv-border)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Fresh Word Packs</h3>
                <span
                  className="text-[11px] font-medium"
                  style={{color: isOnline ? 'var(--tv-success)' : 'var(--tv-warning)'}}
                >
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-[11px]" style={{color: 'var(--tv-text-muted)'}}>
                Last updated:{' '}
                {freshStatus?.lastUpdatedAt
                  ? new Date(freshStatus.lastUpdatedAt).toLocaleString()
                  : 'Starter packs loaded'}
              </p>
            </div>
            <button
              type="button"
              disabled={!isOnline || refreshing}
              onClick={() => void handleRefreshWords()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-45 disabled:cursor-not-allowed"
              style={{
                borderColor: isOnline ? 'var(--tv-accent)' : 'var(--tv-border)',
                color: isOnline ? 'var(--tv-accent)' : 'var(--tv-text-muted)',
                backgroundColor: 'var(--tv-surface)',
              }}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{refreshing ? 'Refreshing...' : 'Refresh words'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-xs tabular-nums" style={{color: 'var(--tv-text-muted)'}}>
            <span>{freshStatus?.packCount ?? 0} / 30 packs cached offline</span>
            <span>{isOnline ? 'Syncs automatically' : 'Using saved words'}</span>
          </div>

          {(!isOnline || refreshNote || freshStatus?.lastError) && (
            <p
              className="text-[11px]"
              style={{
                color: !isOnline ? 'var(--tv-warning)' : 'var(--tv-text-muted)',
              }}
            >
              {!isOnline
                ? 'Offline: Refresh words is disabled while using saved words.'
                : refreshNote ?? freshStatus?.lastError}
            </p>
          )}

          <div
            className="pt-3 border-t space-y-1.5"
            style={{borderColor: 'var(--tv-border)'}}
          >
            <label
              htmlFor="packs-source-url"
              className="block text-xs font-semibold"
            >
              Word pack source URL
            </label>
            <input
              id="packs-source-url"
              type="text"
              value={customUrlDraft}
              onChange={(e) => handleSavePacksUrl(e.target.value)}
              placeholder="Leave empty for default"
              className="w-full rounded-lg border px-2.5 py-1.5 text-xs font-typing"
              style={{
                backgroundColor: 'var(--tv-surface)',
                borderColor: urlError ? 'var(--tv-error)' : 'var(--tv-border)',
                color: 'var(--tv-text)',
              }}
            />
            {urlError ? (
              <p className="text-[11px]" style={{color: 'var(--tv-error)'}}>
                {urlError}
              </p>
            ) : (
              <p className="text-[11px] break-all" style={{color: 'var(--tv-text-muted)'}}>
                Active source: {freshStatus?.effectiveSourceUrl || 'Local starter packs only'}
              </p>
            )}
          </div>
        </section>

        {isDesktop && (
          <section
            className="rounded-xl border p-4 space-y-3"
            style={{
              backgroundColor: 'var(--tv-bg)',
              borderColor: 'var(--tv-border)',
            }}
          >
            <h3 className="text-sm font-semibold">Desktop Safety & Data</h3>

            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <span className="text-xs leading-snug">
                Disable hardware acceleration (use if graphics glitch)
              </span>
              <input
                type="checkbox"
                checked={hwAccelDisabled}
                onChange={(e) => void handleToggleHwAccel(e.target.checked)}
                className="h-4 w-4 shrink-0 mt-0.5 accent-current"
                style={{color: 'var(--tv-accent)'}}
              />
            </label>

            {hwAccelRestartRequired && (
              <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs" style={{borderColor: 'var(--tv-warning)', backgroundColor: 'var(--tv-surface)'}}>
                <span>Restart required to apply graphics mode.</span>
                <button
                  type="button"
                  onClick={() => window.desktop?.hwAccel.relaunch()}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold shrink-0"
                  style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
                >
                  Restart now
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => void window.desktop?.data.openDataFolder()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-medium"
                style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Data folder</span>
              </button>
              <button
                type="button"
                onClick={() => void handleNativeExport()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-medium"
                style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Export</span>
              </button>
              <button
                type="button"
                onClick={() => void handleNativeImport()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-medium"
                style={{borderColor: 'var(--tv-border)', backgroundColor: 'var(--tv-surface)'}}
              >
                <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Import</span>
              </button>
            </div>

            {dataNote && (
              <p className="text-[11px]" style={{color: 'var(--tv-accent)'}}>
                {dataNote}
              </p>
            )}
          </section>
        )}

        <div className="pt-4 border-t flex items-center justify-between" style={{borderColor: 'var(--tv-border)'}}>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiTap();
              resetSettings();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80"
            style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text-muted)'}}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset defaults</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--tv-accent)',
              color: 'var(--tv-accent-fg)',
            }}
          >
            Save & Close
          </button>
        </div>
      </aside>
    </div>
  );
};
