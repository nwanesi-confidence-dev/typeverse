/**
 * Single source of truth for all Auto graphics decision & performance thresholds.
 * Adjust any threshold here to tune how TypeVerse classifies 2D / 3D Light / 3D Full / 3D Realistic.
 */
export const GRAPHICS_THRESHOLDS = {
  /** Minimum median FPS in the heavier Realistic test required for Auto -> 3D Realistic */
  REALISTIC_MIN_MEDIAN_FPS: 58,
  /** Minimum 1% low FPS in the heavier Realistic test required for Auto -> 3D Realistic */
  REALISTIC_MIN_ONE_PERCENT_LOW_FPS: 45,

  /** Minimum median FPS required to recommend 3D Full */
  FULL_MIN_MEDIAN_FPS: 55,
  /** Minimum 1% low FPS required to recommend 3D Full */
  FULL_MIN_ONE_PERCENT_LOW_FPS: 40,
  /** Minimum median FPS required to recommend 3D Light (below this -> 2D) */
  LIGHT_MIN_MEDIAN_FPS: 40,

  /** Warm-up duration (ms) before recording speed-test frame timings */
  SPEED_TEST_WARMUP_MS: 500,
  /** Active speed-test sampling window (ms) for standard check */
  SPEED_TEST_MEASURE_MS: 3000,
  /** Active sampling window (ms) for the heavier Realistic verification pass */
  REALISTIC_SPEED_TEST_MEASURE_MS: 2200,
  /** Instanced cubes rendered in the standard hardware speed test */
  SPEED_TEST_CUBE_COUNT: 2000,

  /** Hard pixel cap (~8 million pixels) for Realistic renderScale output */
  REALISTIC_MAX_PIXELS: 8_000_000,
  /** GPU texture memory budget (MB) for procedural Realistic PBR textures */
  REALISTIC_TEXTURE_MEMORY_BUDGET_MB: 150,

  /** Optional suggestion threshold when the user manually selected 3D */
  SLOW_3D_SUGGEST_FPS: 40,
  /** Sustained low-FPS duration (ms) before suggesting 2D once per session */
  SLOW_3D_SUGGEST_DURATION_MS: 5000,

  /** Optional suggestion threshold when Realistic runs below target FPS */
  SLOW_REALISTIC_SUGGEST_FPS: 40,
  /** Sustained low-FPS duration (ms) before suggesting Full detail once per session */
  SLOW_REALISTIC_SUGGEST_DURATION_MS: 5000,

  /** Unmasked renderer substrings treated as software rasterisation */
  SOFTWARE_RENDERER_PATTERN: /SwiftShader|llvmpipe|Software|Basic Render Driver/i,
} as const;
