export const MIN_WINDOW_WIDTH = 960;
export const MIN_WINDOW_HEIGHT = 600;
export const DEFAULT_FIRST_RUN_RATIO = 0.8;

export interface WorkAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayWorkArea {
  id?: number;
  workArea: WorkAreaRect;
  scaleFactor?: number;
}

export interface PersistedWindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
  isFullScreen?: boolean;
}

export interface ResolvedWindowBounds {
  width: number;
  height: number;
  x: number;
  y: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * First-run desktop window sizing: ~80% of the primary display work area,
 * centred cleanly, respecting a 960x600 minimum when the display allows it.
 */
export function computeFirstRunBounds(
  workArea: WorkAreaRect,
): Omit<ResolvedWindowBounds, 'isMaximized' | 'isFullScreen'> {
  const safeW = Math.max(1, Math.round(workArea.width));
  const safeH = Math.max(1, Math.round(workArea.height));
  const minW = Math.min(MIN_WINDOW_WIDTH, safeW);
  const minH = Math.min(MIN_WINDOW_HEIGHT, safeH);

  const width = Math.round(clamp(safeW * DEFAULT_FIRST_RUN_RATIO, minW, safeW));
  const height = Math.round(clamp(safeH * DEFAULT_FIRST_RUN_RATIO, minH, safeH));
  const x = Math.round(workArea.x + (safeW - width) / 2);
  const y = Math.round(workArea.y + (safeH - height) / 2);

  return {width, height, x, y};
}

function intersectionArea(a: WorkAreaRect, b: WorkAreaRect): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

/**
 * Picks the connected display matching a window rectangle best:
 * largest overlap area first, otherwise nearest center distance.
 */
export function selectBestDisplayForRect(
  rect: WorkAreaRect,
  displays: DisplayWorkArea[],
  primary: DisplayWorkArea,
): DisplayWorkArea {
  if (displays.length === 0) return primary;

  let bestByOverlap: DisplayWorkArea | null = null;
  let maxArea = 0;

  for (const d of displays) {
    const area = intersectionArea(rect, d.workArea);
    if (area > maxArea) {
      maxArea = area;
      bestByOverlap = d;
    }
  }
  if (bestByOverlap) return bestByOverlap;

  const rectCx = rect.x + rect.width / 2;
  const rectCy = rect.y + rect.height / 2;
  let nearest = primary;
  let minDistSq = Number.POSITIVE_INFINITY;

  for (const d of displays) {
    const dCx = d.workArea.x + d.workArea.width / 2;
    const dCy = d.workArea.y + d.workArea.height / 2;
    const dx = rectCx - dCx;
    const dy = rectCy - dCy;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      nearest = d;
    }
  }

  return nearest;
}

/**
 * Clamps arbitrary bounds to a target display's work area while respecting
 * the 960x600 minimum (or display dimensions if smaller).
 */
export function clampBoundsToWorkArea(
  rect: {width: number; height: number; x?: number; y?: number},
  workArea: WorkAreaRect,
): WorkAreaRect {
  const safeW = Math.max(1, Math.round(workArea.width));
  const safeH = Math.max(1, Math.round(workArea.height));
  const minW = Math.min(MIN_WINDOW_WIDTH, safeW);
  const minH = Math.min(MIN_WINDOW_HEIGHT, safeH);

  const width = Math.round(clamp(rect.width, minW, safeW));
  const height = Math.round(clamp(rect.height, minH, safeH));

  const maxX = workArea.x + safeW - width;
  const maxY = workArea.y + safeH - height;

  const x =
    typeof rect.x === 'number' && Number.isFinite(rect.x)
      ? Math.round(clamp(rect.x, workArea.x, Math.max(workArea.x, maxX)))
      : Math.round(workArea.x + (safeW - width) / 2);
  const y =
    typeof rect.y === 'number' && Number.isFinite(rect.y)
      ? Math.round(clamp(rect.y, workArea.y, Math.max(workArea.y, maxY)))
      : Math.round(workArea.y + (safeH - height) / 2);

  return {width, height, x, y};
}

/**
 * Restores persisted Electron window state, or falls back to ~80% centered on first run,
 * always clamping restored bounds inside the connected displays' work areas.
 */
export function resolveRestoredWindowBounds(
  saved: Partial<PersistedWindowState> | null | undefined,
  displays: DisplayWorkArea[],
  primary: DisplayWorkArea,
): ResolvedWindowBounds {
  if (
    !saved ||
    typeof saved.width !== 'number' ||
    !Number.isFinite(saved.width) ||
    typeof saved.height !== 'number' ||
    !Number.isFinite(saved.height)
  ) {
    const first = computeFirstRunBounds(primary.workArea);
    return {
      ...first,
      isMaximized: false,
      isFullScreen: false,
    };
  }

  const rawWidth = Math.max(MIN_WINDOW_WIDTH, Math.round(saved.width));
  const rawHeight = Math.max(MIN_WINDOW_HEIGHT, Math.round(saved.height));
  const hasCoords =
    typeof saved.x === 'number' &&
    Number.isFinite(saved.x) &&
    typeof saved.y === 'number' &&
    Number.isFinite(saved.y);

  const targetDisplay = hasCoords
    ? selectBestDisplayForRect(
        {
          x: Math.round(saved.x!),
          y: Math.round(saved.y!),
          width: rawWidth,
          height: rawHeight,
        },
        displays,
        primary,
      )
    : primary;

  const clamped = clampBoundsToWorkArea(
    {
      width: rawWidth,
      height: rawHeight,
      x: hasCoords ? saved.x : undefined,
      y: hasCoords ? saved.y : undefined,
    },
    targetDisplay.workArea,
  );

  return {
    ...clamped,
    isMaximized: Boolean(saved.isMaximized),
    isFullScreen: Boolean(saved.isFullScreen),
  };
}

export function clampWindowBoundsToDisplays(
  currentBounds: WorkAreaRect,
  displays: DisplayWorkArea[],
  primary: DisplayWorkArea,
): WorkAreaRect {
  const target = selectBestDisplayForRect(currentBounds, displays, primary);
  return clampBoundsToWorkArea(currentBounds, target.workArea);
}
