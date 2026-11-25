import type {TextSize} from '@/src/types/app';
import type {ScreenInfoState} from '@/src/utils/screenInfo';

export interface TypingArenaLayoutMetrics {
  fontSizePx: number;
  lineHeight: number;
  threeLineClipHeightPx: number;
  viewportPaddingY: number;
  viewportPaddingX: number;
  viewportHeightPx: number;
  cardPaddingPx: number;
  maxCh: number;
  compactChrome: boolean;
}

export interface KeyboardLayoutMetrics {
  keyHeightPx: number;
  keyFontPx: number;
  shiftFontPx: number;
  rowGapPx: number;
  keyGapPx: number;
  trayPaddingPx: number;
  allowFingerGuide: boolean;
  handGuideWidthPx: number;
  handGuideHeightPx: number;
  maxBoardWidthPx: number;
}

export interface HudLayoutMetrics {
  dense: boolean;
  cols: 1 | 2 | 3;
  gaugeWidthPx: number;
  gaugeHeightPx: number;
  netWpmFontPx: number;
  accuracySvgPx: number;
  paddingPx: number;
}

const BASE_TEXT_PX: Record<TextSize, number> = {
  S: 17,
  M: 20,
  L: 24,
  XL: 28,
};

const BASE_LINE_HEIGHT: Record<TextSize, number> = {
  S: 1.95,
  M: 1.9,
  L: 1.85,
  XL: 1.78,
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function computeTypingArenaLayout(
  screen: Pick<ScreenInfoState, 'width' | 'height' | 'uiScale' | 'layoutProfile'>,
  textSize: TextSize,
): TypingArenaLayoutMetrics {
  const isCompact =
    screen.layoutProfile === 'compact' || screen.height < 670 || screen.width < 960;
  const isShort = screen.height < 790;

  // Fluid font scaling bounded between comfortable minimum (16px) and screen-safe max
  const heightScaleLimit = screen.height < 640 ? 0.85 : isShort ? 0.92 : 1.38;
  const effectiveScale = clamp(screen.uiScale, 0.82, heightScaleLimit);
  const rawFont = BASE_TEXT_PX[textSize] * effectiveScale;
  const maxFontForHeight = screen.height < 640 ? 20 : isShort ? 22 : 36;
  const fontSizePx = Math.round(clamp(rawFont, 16, maxFontForHeight));

  const lineHeight =
    isCompact || isShort ? Math.min(1.78, BASE_LINE_HEIGHT[textSize]) : BASE_LINE_HEIGHT[textSize];
  const viewportPaddingY = isCompact
    ? 8
    : isShort
      ? 10
      : Math.round(16 * clamp(screen.uiScale, 0.9, 1.35));
  const viewportPaddingX = isCompact
    ? 12
    : isShort
      ? 14
      : Math.round(18 * clamp(screen.uiScale, 0.9, 1.4));

  // Exact 3-line inner clip height + vertical padding outside it so line 4 never peeks
  const linePx = fontSizePx * lineHeight;
  const threeLineClipHeightPx = Math.ceil(linePx * 3 + 2);
  const viewportHeightPx = threeLineClipHeightPx + viewportPaddingY * 2 + 2;

  const cardPaddingPx = isCompact
    ? 10
    : isShort
      ? 12
      : Math.round(clamp(22 * clamp(screen.uiScale, 0.9, 1.35), 16, 34));
  const maxCh =
    screen.width < 820
      ? 62
      : screen.layoutProfile === 'super-ultrawide' || screen.uiScale >= 1.3
        ? 82
        : 76;

  return {
    fontSizePx,
    lineHeight,
    threeLineClipHeightPx,
    viewportPaddingY,
    viewportPaddingX,
    viewportHeightPx,
    cardPaddingPx,
    maxCh,
    compactChrome: isCompact || isShort,
  };
}

export function computeKeyboardLayout(
  screen: Pick<ScreenInfoState, 'width' | 'height' | 'uiScale' | 'layoutProfile'>,
): KeyboardLayoutMetrics {
  const {height, width, uiScale, layoutProfile} = screen;
  const isCompact = layoutProfile === 'compact' || height < 660;
  const isShort = height < 790;
  const isVeryShort = height < 680;

  // Priority: (1) shrink keys -> (2) reduce spacing -> (3) hide hand guide when tight
  let keyHeightPx: number;
  if (isVeryShort) {
    keyHeightPx = 28;
  } else if (isShort) {
    keyHeightPx = 33;
  } else {
    keyHeightPx = Math.round(clamp(40 * clamp(uiScale, 0.9, 1.45), 36, 58));
  }

  // Narrow width guard so 14-column QWERTY row stays crisp on small/portrait windows
  if (width < 760) {
    keyHeightPx = Math.min(keyHeightPx, 32);
  }

  const keyGapPx = isVeryShort
    ? 3
    : isShort
      ? 4
      : Math.round(clamp(6 * clamp(uiScale, 0.85, 1.4), 5, 10));
  const rowGapPx = isVeryShort
    ? 2
    : isShort
      ? 3
      : Math.round(clamp(6 * clamp(uiScale, 0.85, 1.4), 5, 10));
  const trayPaddingPx = isVeryShort
    ? 8
    : isShort
      ? 9
      : Math.round(clamp(16 * clamp(uiScale, 0.9, 1.35), 12, 26));

  const keyFontPx = Math.round(clamp(keyHeightPx * 0.31, 10, 16));
  const shiftFontPx = Math.round(clamp(keyHeightPx * 0.22, 8, 12));

  // Hide hand guide first when vertical space is short (< 700px) or compact layout active
  const allowFingerGuide = !isCompact && height >= 700;
  const handGuideHeightPx = isShort
    ? 28
    : Math.round(clamp(60 * clamp(uiScale, 0.9, 1.3), 50, 82));
  const handGuideWidthPx = Math.round(handGuideHeightPx * (110 / 86));

  const maxBoardWidthPx = Math.round(clamp(820 * clamp(uiScale, 0.85, 1.35), 620, 1120));

  return {
    keyHeightPx,
    keyFontPx,
    shiftFontPx,
    rowGapPx,
    keyGapPx,
    trayPaddingPx,
    allowFingerGuide,
    handGuideWidthPx,
    handGuideHeightPx,
    maxBoardWidthPx,
  };
}

export function computeHudLayout(
  screen: Pick<ScreenInfoState, 'width' | 'height' | 'uiScale' | 'layoutProfile' | 'showSidePanels'>,
): HudLayoutMetrics {
  const {width, height, uiScale, layoutProfile, showSidePanels} = screen;
  const dense = layoutProfile === 'compact' || height < 790;

  // Determine HUD column arrangement from root container width (NOT host window breakpoints)
  const effectiveCenterWidth = showSidePanels ? Math.max(680, width - 640) : width;
  const cols: 1 | 2 | 3 =
    layoutProfile === 'portrait' || effectiveCenterWidth < 680
      ? 1
      : effectiveCenterWidth < 960
        ? 2
        : 3;

  const scaleFactor = dense
    ? clamp(uiScale, 0.8, 0.92)
    : clamp(uiScale, 0.85, 1.3);

  const gaugeWidthPx = Math.round(clamp((dense ? 92 : 132) * scaleFactor, 88, 166));
  const gaugeHeightPx = Math.round(gaugeWidthPx * (128 / 180) + 10);
  const netWpmFontPx = Math.round(clamp((dense ? 26 : 34) * scaleFactor, 24, 46));
  const accuracySvgPx = Math.round(clamp((dense ? 40 : 50) * scaleFactor, 38, 60));
  const paddingPx = dense ? 9 : Math.round(clamp(16 * scaleFactor, 14, 24));

  return {
    dense,
    cols,
    gaugeWidthPx,
    gaugeHeightPx,
    netWpmFontPx,
    accuracySvgPx,
    paddingPx,
  };
}
