import React, {useEffect, useRef, useState} from 'react';
import {Check, Eye, X} from 'lucide-react';
import {soundEngine} from '@/src/audio/soundEngine';
import {DETAIL_CONSTANTS} from '@/src/graphics/detail';
import {graphicsModeService, useGraphicsMode} from '@/src/graphics/graphicsModeService';
import type {
  DetailPreviewHandle,
  DetailPreviewStats,
} from '@/src/three/scenes/detailPreviewScene';
import type {GraphicsDetailLevel} from '@/src/types/app';

interface DetailPreviewModalProps {
  open: boolean;
  onClose: () => void;
}

const PREVIEW_OPTIONS: Array<{id: GraphicsDetailLevel; label: string; note: string}> = [
  {id: 'light', label: 'Light', note: '1x scale, basic shading'},
  {id: 'full', label: 'Full', note: 'HiDPI, fog & glow'},
  {id: 'realistic', label: 'Realistic', note: 'PBR maps, shadows & post'},
];

export const DetailPreviewModal: React.FC<DetailPreviewModalProps> = ({open, onClose}) => {
  const gfx = useGraphicsMode();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DetailPreviewHandle | null>(null);

  const [previewDetail, setPreviewDetail] = useState<GraphicsDetailLevel>(gfx.detail3D);
  const [stats, setStats] = useState<DetailPreviewStats>({
    fps: 0,
    triangles: 0,
    drawCalls: 0,
    renderWidth: 0,
    renderHeight: 0,
  });

  useEffect(() => {
    if (open) {
      setPreviewDetail(gfx.detail3D);
    }
  }, [open, gfx.detail3D]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;

    void import('@/src/three/scenes/detailPreviewScene').then(({mountDetailPreviewScene}) =>
      mountDetailPreviewScene({
        container,
        initialDetail: previewDetail,
        realisticOptions: gfx.realisticOptions,
        onStats: (next) => {
          if (!cancelled) setStats(next);
        },
      }),
    ).then((handle) => {
      if (cancelled) {
        handle.dispose();
        return;
      }
      handleRef.current = handle;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect;
          if (rect) handle.resize(rect.width, rect.height);
        });
        resizeObs.observe(container);
      }
    });

    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !handleRef.current) return;
    handleRef.current.setDetail(previewDetail, gfx.realisticOptions);
  }, [open, previewDetail, gfx.realisticOptions]);

  if (!open) return null;

  const tierBudget = DETAIL_CONSTANTS[previewDetail];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-preview-title"
      onClick={onClose}
    >
      <div
        className="tv-surface w-full max-w-xl rounded-2xl border p-5 shadow-2xl space-y-4"
        style={{borderColor: 'var(--tv-border)'}}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" style={{color: 'var(--tv-accent)'}} aria-hidden="true" />
            <div>
              <h3 id="detail-preview-title" className="font-display text-base font-bold">
                3D Detail Comparison
              </h3>
              <p className="text-xs" style={{color: 'var(--tv-text-muted)'}}>
                Compare silhouette smoothness, shading, shadows and live performance before choosing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5"
            style={{color: 'var(--tv-text-muted)'}}
            aria-label="Close detail preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Switch: Light | Full | Realistic */}
        <div
          className="grid grid-cols-3 gap-1.5 rounded-xl p-1 border"
          style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
          role="group"
          aria-label="Preview 3D detail tier"
        >
          {PREVIEW_OPTIONS.map((opt) => {
            const active = previewDetail === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  soundEngine.playUiTap();
                  setPreviewDetail(opt.id);
                }}
                className="rounded-lg px-2 py-2 text-center transition-colors"
                style={{
                  backgroundColor: active ? 'var(--tv-accent)' : 'transparent',
                  color: active ? 'var(--tv-accent-fg)' : 'var(--tv-text)',
                }}
              >
                <div className="text-xs font-semibold">{opt.label}</div>
                <div
                  className="text-[10px] leading-tight"
                  style={{opacity: active ? 0.9 : 0.7}}
                >
                  {opt.note}
                </div>
              </button>
            );
          })}
        </div>

        {/* Interactive Rotating Trophy + Keycap Viewport */}
        <div
          ref={containerRef}
          className="w-full h-64 rounded-xl border overflow-hidden"
          style={{backgroundColor: '#070B15', borderColor: 'var(--tv-border)'}}
          aria-hidden="true"
        />

        {/* Live Cost Telemetry Row */}
        <div
          className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-center font-typing"
          style={{backgroundColor: 'var(--tv-bg)', borderColor: 'var(--tv-border)'}}
        >
          <div>
            <div className="text-[10px] uppercase" style={{color: 'var(--tv-text-muted)'}}>
              Live FPS
            </div>
            <div className="text-sm font-bold tabular-nums" style={{color: 'var(--tv-accent)'}}>
              {stats.fps > 0 ? `${stats.fps} FPS` : '...'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase" style={{color: 'var(--tv-text-muted)'}}>
              Triangles
            </div>
            <div className="text-sm font-bold tabular-nums">
              {stats.triangles.toLocaleString()}
            </div>
            <div className="text-[10px]" style={{color: 'var(--tv-text-muted)'}}>
              / {(tierBudget.triangleBudget / 1000).toFixed(0)}k budget
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase" style={{color: 'var(--tv-text-muted)'}}>
              Draw Calls
            </div>
            <div className="text-sm font-bold tabular-nums">{stats.drawCalls}</div>
            <div className="text-[10px]" style={{color: 'var(--tv-text-muted)'}}>
              / {tierBudget.drawCallBudget} budget
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px] font-typing" style={{color: 'var(--tv-text-muted)'}}>
            {stats.renderWidth > 0 ? `${stats.renderWidth}x${stats.renderHeight} px` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={{borderColor: 'var(--tv-border)', color: 'var(--tv-text-muted)'}}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiTap();
                void graphicsModeService.setDetail3D(previewDetail);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold"
              style={{backgroundColor: 'var(--tv-accent)', color: 'var(--tv-accent-fg)'}}
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Use {previewDetail.charAt(0).toUpperCase() + previewDetail.slice(1)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
