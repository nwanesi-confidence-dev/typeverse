import assert from 'node:assert/strict';
import test from 'node:test';
import {BeatTyperEngine} from '../src/arcade/engine/beatTyperEngine';
import {BubblePopEngine} from '../src/arcade/engine/bubblePopEngine';
import {StarDefenderEngine} from '../src/arcade/engine/starDefenderEngine';
import {TurboRacerEngine} from '../src/arcade/engine/turboRacerEngine';
import {WordRainEngine} from '../src/arcade/engine/wordRainEngine';
import {
  computeHardwareFingerprint,
  decideGraphicsModeFromReport,
  isGpuFeatureStatusSoftwareOnly,
  resolveEffectiveMode,
} from '../src/graphics/decision';
import {GRAPHICS_THRESHOLDS} from '../src/graphics/thresholds';
import type {HardwareReport, SpeedTestResult} from '../src/types/app';
import type {CompletedSessionStats} from '../src/types/typing';

function makeHardwareReport(overrides: Partial<HardwareReport> = {}): HardwareReport {
  return {
    webglSupported: true,
    webgl2Supported: true,
    webglVersion: 'WebGL 2.0',
    renderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
    vendor: 'Google Inc. (Apple)',
    rendererKnown: true,
    isSoftwareRenderer: false,
    logicalCores: 8,
    deviceMemoryGb: 16,
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 2,
    pixelCount: 1920 * 1080 * 4,
    desktopMode: false,
    desktopHwAccelDisabled: false,
    gpuFeatureStatus: null,
    gpuFeatureSoftwareOnly: false,
    fingerprint: 'fp-base',
    prefersReducedMotion: false,
    ...overrides,
  };
}

function makeSpeedTest(overrides: Partial<SpeedTestResult> = {}): SpeedTestResult {
  return {
    medianFps: 60,
    onePercentLowFps: 50,
    frameCount: 180,
    durationMs: 3000,
    recommendedMode: '3d-full',
    timestamp: 1700000000000,
    skipped: false,
    ...overrides,
  };
}

function assertArcadeParity(
  label: string,
  res2d: CompletedSessionStats,
  res3d: CompletedSessionStats,
): void {
  assert.equal(res2d.playedVisuals, '2d', `${label}: 2D run must record playedVisuals='2d'`);
  assert.equal(res3d.playedVisuals, '3d', `${label}: 3D run must record playedVisuals='3d'`);
  assert.equal(res2d.netWpm, res3d.netWpm, `${label}: netWpm mismatch`);
  assert.equal(res2d.grossWpm, res3d.grossWpm, `${label}: grossWpm mismatch`);
  assert.equal(res2d.accuracy, res3d.accuracy, `${label}: accuracy mismatch`);
  assert.equal(res2d.errors, res3d.errors, `${label}: errors mismatch`);
  assert.equal(res2d.wordsTyped, res3d.wordsTyped, `${label}: wordsTyped mismatch`);
  assert.equal(res2d.stars, res3d.stars, `${label}: stars mismatch`);
  assert.equal(res2d.xpEarned, res3d.xpEarned, `${label}: xpEarned mismatch`);
  assert.equal(res2d.passed, res3d.passed, `${label}: passed mismatch`);
  assert.equal(res2d.durationSec, res3d.durationSec, `${label}: durationSec mismatch`);
  assert.equal(res2d.totalKeystrokes, res3d.totalKeystrokes, `${label}: totalKeystrokes mismatch`);
  assert.equal(res2d.correctKeystrokes, res3d.correctKeystrokes, `${label}: correctKeystrokes mismatch`);
  assert.equal(res2d.passRequirementText, res3d.passRequirementText, `${label}: passRequirementText mismatch`);
}

// ---------------------------------------------------------------------------
// Phase 11 Auto decision & hardware helper tests
// ---------------------------------------------------------------------------

test('decideGraphicsModeFromReport chooses 2D when WebGL 2 is unavailable', () => {
  const hw = makeHardwareReport({webglSupported: true, webgl2Supported: false, webglVersion: 'WebGL 1.0'});
  const res = decideGraphicsModeFromReport(hw, makeSpeedTest({medianFps: 120, onePercentLowFps: 90}));
  assert.equal(res.mode, '2d');
  assert.equal(res.skipped, false);
  assert.match(res.reason, /WebGL 2/i);
});

test('decideGraphicsModeFromReport detects software rasterisers and masked renderers properly', () => {
  for (const name of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Microsoft Basic Render Driver',
  ]) {
    assert.equal(
      GRAPHICS_THRESHOLDS.SOFTWARE_RENDERER_PATTERN.test(name),
      true,
      `Expected software pattern match for ${name}`,
    );
    const res = decideGraphicsModeFromReport(
      makeHardwareReport({renderer: name, rendererKnown: true, isSoftwareRenderer: true}),
      makeSpeedTest({medianFps: 60, onePercentLowFps: 50}),
    );
    assert.equal(res.mode, '2d');
    assert.match(res.reason, /software graphics/i);
  }

  // Masked or empty renderer string must be treated as unknown (not bad) and delegate to speed test
  const masked = makeHardwareReport({
    renderer: 'Unknown (masked)',
    rendererKnown: false,
    isSoftwareRenderer: false,
  });
  const maskedOutcome = decideGraphicsModeFromReport(
    masked,
    makeSpeedTest({medianFps: 60, onePercentLowFps: 48}),
  );
  assert.equal(maskedOutcome.mode, '3d-full');
});

test('decideGraphicsModeFromReport respects Electron hwAccel and gpuFeatureStatus signals', () => {
  assert.equal(isGpuFeatureStatusSoftwareOnly({webgl2: 'enabled', webgl: 'enabled'}), false);
  assert.equal(isGpuFeatureStatusSoftwareOnly({webgl2: 'unavailable_software'}), true);
  assert.equal(isGpuFeatureStatusSoftwareOnly({webgl2: 'disabled_off'}), true);
  assert.equal(isGpuFeatureStatusSoftwareOnly(null), false);

  const hwDisabled = makeHardwareReport({desktopMode: true, desktopHwAccelDisabled: true});
  assert.equal(decideGraphicsModeFromReport(hwDisabled, makeSpeedTest()).mode, '2d');

  const gpuSoftware = makeHardwareReport({
    desktopMode: true,
    gpuFeatureStatus: {webgl2: 'unavailable_software'},
    gpuFeatureSoftwareOnly: true,
  });
  assert.equal(decideGraphicsModeFromReport(gpuSoftware, makeSpeedTest()).mode, '2d');
});

test('decideGraphicsModeFromReport classifies skipped and measured speed-test buckets', () => {
  const hw = makeHardwareReport();

  const skipped = decideGraphicsModeFromReport(hw, makeSpeedTest({skipped: true}));
  assert.equal(skipped.mode, '2d');
  assert.equal(skipped.skipped, true);
  assert.match(skipped.reason, /Not checked yet/i);

  const slow = decideGraphicsModeFromReport(hw, makeSpeedTest({medianFps: 35, onePercentLowFps: 25}));
  assert.equal(slow.mode, '2d');
  assert.equal(slow.skipped, false);

  const mid = decideGraphicsModeFromReport(hw, makeSpeedTest({medianFps: 48, onePercentLowFps: 36}));
  assert.equal(mid.mode, '3d-light');
  assert.equal(mid.recommendedDetail, 'light');

  const unstableHighMedian = decideGraphicsModeFromReport(
    hw,
    makeSpeedTest({medianFps: 58, onePercentLowFps: 34}),
  );
  assert.equal(unstableHighMedian.mode, '3d-light');

  const fast = decideGraphicsModeFromReport(hw, makeSpeedTest({medianFps: 60, onePercentLowFps: 45}));
  assert.equal(fast.mode, '3d-full');
  assert.equal(fast.recommendedDetail, 'full');
});

test('resolveEffectiveMode and computeHardwareFingerprint work predictably', () => {
  const hw = makeHardwareReport();
  const noWebgl2 = makeHardwareReport({webgl2Supported: false});

  assert.equal(resolveEffectiveMode('auto', 'light', '3d-full', hw), '3d-full');
  assert.equal(resolveEffectiveMode('2d', 'full', '3d-full', hw), '2d');
  assert.equal(resolveEffectiveMode('3d', 'light', '2d', hw), '3d-light');
  assert.equal(resolveEffectiveMode('3d', 'full', '2d', hw), '3d-full');
  assert.equal(resolveEffectiveMode('3d', 'realistic', '2d', hw), '3d-realistic');
  assert.equal(resolveEffectiveMode('3d', 'full', '3d-full', noWebgl2), '2d');

  // Auto -> Realistic requires heavier test >=58 med and >=45 1% low
  const fullWithLowHeavy = decideGraphicsModeFromReport(
    hw,
    makeSpeedTest({medianFps: 62, onePercentLowFps: 50}),
    {medianFps: 52, onePercentLowFps: 40, frameCount: 120, durationMs: 2200, skipped: false},
  );
  assert.equal(fullWithLowHeavy.mode, '3d-full');
  assert.equal(fullWithLowHeavy.recommendedDetail, 'full');

  const realisticPass = decideGraphicsModeFromReport(
    hw,
    makeSpeedTest({medianFps: 65, onePercentLowFps: 55}),
    {medianFps: 60, onePercentLowFps: 48, frameCount: 130, durationMs: 2200, skipped: false},
  );
  assert.equal(realisticPass.mode, '3d-realistic');
  assert.equal(realisticPass.recommendedDetail, 'realistic');

  const fpA = computeHardwareFingerprint({
    renderer: 'Apple M2 Pro',
    vendor: 'Apple',
    logicalCores: 10,
    deviceMemoryGb: 16,
    screenWidth: 1512,
    screenHeight: 982,
    devicePixelRatio: 2,
    desktopMode: true,
    desktopHwAccelDisabled: false,
  });
  const fpB = computeHardwareFingerprint({
    renderer: 'Apple M2 Pro',
    vendor: 'Apple',
    logicalCores: 10,
    deviceMemoryGb: 16,
    screenWidth: 2560,
    screenHeight: 1440,
    devicePixelRatio: 1,
    desktopMode: true,
    desktopHwAccelDisabled: false,
  });
  assert.notEqual(fpA, fpB);
});

test('DETAIL_CONSTANTS and computeRenderResolution enforce budgets and ~8M pixel cap', async () => {
  const {DETAIL_CONSTANTS, computeRenderResolution} = await import('../src/graphics/detail');
  assert.equal(DETAIL_CONSTANTS.light.sphereSegments, 16);
  assert.equal(DETAIL_CONSTANTS.full.sphereSegments, 32);
  assert.equal(DETAIL_CONSTANTS.realistic.sphereSegments, 64);
  assert.equal(DETAIL_CONSTANTS.realistic.keycapBevelSegments, 8);
  assert.equal(DETAIL_CONSTANTS.realistic.latheSegments, 128);
  assert.equal(DETAIL_CONSTANTS.realistic.asteroidIcosaDetail, 6);
  assert.equal(DETAIL_CONSTANTS.realistic.carBevelSegments, 6);
  assert.equal(DETAIL_CONSTANTS.realistic.roadSubdivisions, 160);
  assert.equal(DETAIL_CONSTANTS.realistic.drawCallBudget, 150);
  assert.equal(DETAIL_CONSTANTS.realistic.triangleBudget, 400_000);

  // Huge 4K * 2x DPR * 150% scale must clamp under REALISTIC_MAX_PIXELS (~8M)
  const capped = computeRenderResolution({
    cssWidth: 2560,
    cssHeight: 1440,
    devicePixelRatio: 2,
    resolvedMode: '3d-realistic',
    realisticOptions: {
      renderScale: 1.5,
      shadows: true,
      postEffects: true,
      hubDof: false,
      speedStreaks: false,
    },
  });
  assert.equal(capped.clampedByPixelBudget, true);
  assert.ok(
    capped.totalPixels <= GRAPHICS_THRESHOLDS.REALISTIC_MAX_PIXELS + 12_000,
    `Expected pixels near 8M cap, got ${capped.totalPixels}`,
  );
});

// ---------------------------------------------------------------------------
// All 5 Arcade Engine Fixed-Seed Deterministic Parity Tests ('2d' vs '3d')
// ---------------------------------------------------------------------------

const TEST_WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
  'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray',
  'yankee', 'zulu', 'comet', 'orbit', 'pulsar', 'nebula', 'meteor', 'galaxy',
];

test('TurboRacerEngine produces identical scoring, WPM, accuracy, XP, and stars in 2D vs 3D', () => {
  function runRace(visuals: '2d' | '3d'): CompletedSessionStats {
    const engine = new TurboRacerEngine({
      difficulty: 'easy',
      wordPool: TEST_WORDS,
      personalBestWpm: 30,
      seed: 42,
      playedVisuals: visuals,
    });
    let t = 1000;
    engine.start(t);
    let finished: CompletedSessionStats | null = null;
    for (let i = 0; i < 400 && !finished; i++) {
      const ch = engine.getExpectedChar();
      if (!ch) break;
      // Inject one deterministic typo early to exercise error parity as well
      const keyToSend = i === 5 ? '!' : ch;
      t += 75;
      engine.step(0.075);
      const res = engine.handleKey(keyToSend, t);
      if (i === 5) {
        t += 75;
        engine.step(0.075);
        const recovery = engine.handleKey(ch, t);
        if (recovery.finishedResult) finished = recovery.finishedResult;
      } else if (res.finishedResult) {
        finished = res.finishedResult;
      }
    }
    assert.ok(finished, `TurboRacerEngine (${visuals}) did not finish within step limit`);
    return finished;
  }

  assertArcadeParity('TurboRacerEngine', runRace('2d'), runRace('3d'));
});

test('StarDefenderEngine produces identical outcome and metrics in 2D vs 3D', () => {
  function runDefense(visuals: '2d' | '3d'): CompletedSessionStats {
    const engine = new StarDefenderEngine({
      difficulty: 'easy',
      wordPool: TEST_WORDS,
      personalBestWpm: 25,
      seed: 777,
      playedVisuals: visuals,
    });
    let t = 5000;
    engine.start(t);
    let finished: CompletedSessionStats | null = null;
    for (let stepIdx = 0; stepIdx < 600 && !finished; stepIdx++) {
      t += 90;
      const stepRes = engine.step(0.09, 360, t);
      if (stepRes.finishedResult) {
        finished = stepRes.finishedResult;
        break;
      }
      const locked = engine.state.asteroids.find((a) => a.id === engine.state.lockedId);
      const nextTarget = locked ?? engine.state.asteroids[0];
      if (!nextTarget) continue;
      const nextChar = nextTarget.word[nextTarget.typed];
      if (!nextChar) continue;
      const res = engine.handleKey(nextChar, t);
      if (res.finishedResult) finished = res.finishedResult;
    }
    assert.ok(finished, `StarDefenderEngine (${visuals}) did not finish within step limit`);
    return finished;
  }

  assertArcadeParity('StarDefenderEngine', runDefense('2d'), runDefense('3d'));
});

test('WordRainEngine produces identical outcome and metrics in 2D vs 3D', () => {
  function runRain(visuals: '2d' | '3d'): CompletedSessionStats {
    const engine = new WordRainEngine({
      difficulty: 'easy',
      wordPool: TEST_WORDS,
      personalBestWpm: 25,
      seed: 888,
      playedVisuals: visuals,
    });
    let t = 10000;
    engine.start(t);
    let finished: CompletedSessionStats | null = null;
    for (let stepIdx = 0; stepIdx < 600 && !finished; stepIdx++) {
      t += 85;
      const stepRes = engine.step(0.085, 360, t);
      if (stepRes.finishedResult) {
        finished = stepRes.finishedResult;
        break;
      }
      const locked = engine.state.drops.find((d) => d.id === engine.state.lockedId);
      const target = locked ?? engine.state.drops[0];
      if (!target) continue;
      const ch = target.word[target.typed];
      if (!ch) continue;
      const res = engine.handleKey(ch, t);
      if (res.finishedResult) finished = res.finishedResult;
    }
    assert.ok(finished, `WordRainEngine (${visuals}) did not finish within step limit`);
    return finished;
  }

  assertArcadeParity('WordRainEngine', runRain('2d'), runRain('3d'));
});

test('BubblePopEngine produces identical outcome and metrics in 2D vs 3D', () => {
  function runBubbles(visuals: '2d' | '3d'): CompletedSessionStats {
    const engine = new BubblePopEngine({
      difficulty: 'medium',
      wordPool: TEST_WORDS,
      focusRowId: 'all',
      personalBestWpm: 25,
      seed: 999,
      playedVisuals: visuals,
    });
    let t = 20000;
    engine.start(t);
    let finished: CompletedSessionStats | null = null;
    for (let stepIdx = 0; stepIdx < 600 && !finished; stepIdx++) {
      t += 95;
      const stepRes = engine.step(0.095, 360, t);
      if (stepRes.finishedResult) {
        finished = stepRes.finishedResult;
        break;
      }
      const locked = engine.state.bubbles.find((b) => b.id === engine.state.lockedId);
      const target = locked ?? engine.state.bubbles[0];
      if (!target) continue;
      const ch = target.text[target.typed];
      if (!ch) continue;
      const res = engine.handleKey(ch, t);
      if (res.finishedResult) finished = res.finishedResult;
    }
    assert.ok(finished, `BubblePopEngine (${visuals}) did not finish within step limit`);
    return finished;
  }

  assertArcadeParity('BubblePopEngine', runBubbles('2d'), runBubbles('3d'));
});

test('BeatTyperEngine produces identical judgement counts, WPM, XP, and stars in 2D vs 3D', () => {
  function runBeat(visuals: '2d' | '3d'): CompletedSessionStats {
    const engine = new BeatTyperEngine({
      difficulty: 'easy',
      personalBestWpm: 25,
      seed: 555,
      playedVisuals: visuals,
    });
    let t = 30000;
    const strikeY = 360 - 58;
    engine.start(t);
    let finished: CompletedSessionStats | null = null;
    for (let stepIdx = 0; stepIdx < 1600 && !finished; stepIdx++) {
      t += 40;
      const stepRes = engine.step(0.04, 360, t);
      if (stepRes.finishedResult) {
        finished = stepRes.finishedResult;
        break;
      }
      const hittable = engine.state.notes.find(
        (n) => !n.resolved && Math.abs(n.y - strikeY) <= 28,
      );
      if (hittable) {
        const res = engine.handleKey(hittable.keyChar, 360, t);
        if (res.finishedResult) finished = res.finishedResult;
      }
    }
    assert.ok(finished, `BeatTyperEngine (${visuals}) did not finish within step limit`);
    return finished;
  }

  assertArcadeParity('BeatTyperEngine', runBeat('2d'), runBeat('3d'));
});
