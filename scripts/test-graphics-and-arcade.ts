import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  CANONICAL_PLAY_ASPECT,
  MAX_2D_CANVAS_PIXELS,
  MAX_EXTENDED_ASPECT,
  computeCanvas2DBackingSize,
  computePlayZoneViewport,
  computeSafeZoneHudInsets,
} from '../src/arcade/playZone';
import {BeatTyperEngine} from '../src/arcade/engine/beatTyperEngine';
import {BubblePopEngine} from '../src/arcade/engine/bubblePopEngine';
import {StarDefenderEngine} from '../src/arcade/engine/starDefenderEngine';
import {TurboRacerEngine} from '../src/arcade/engine/turboRacerEngine';
import {WordRainEngine} from '../src/arcade/engine/wordRainEngine';
import {
  buildRenderSpecForMode,
  computeHardwareFingerprint,
  decideGraphicsModeFromReport,
  isGpuFeatureStatusSoftwareOnly,
  RENDER_SPECS,
  resolveEffectiveMode,
} from '../src/graphics/decision';
import {DETAIL_CONSTANTS, REALISTIC_VISUAL_TUNING} from '../src/graphics/detail';
import {GRAPHICS_THRESHOLDS} from '../src/graphics/thresholds';
import {
  computePlayZoneProjection,
  disposeThreeScene,
  fitPerspectiveCamera,
} from '../src/three/core';
import type {HardwareReport, ProfileProgress, SpeedTestResult} from '../src/types/app';
import type {CompletedSessionStats} from '../src/types/typing';
import {
  computeDailyGoalProgress,
  getLocalDateKey,
  getTodayActivitySeconds,
} from '../src/utils/progression';
import {
  computeScreenInfoSnapshot,
  LAYOUT_TESTER_PRESETS,
} from '../src/utils/screenInfo';
import {
  computeHudLayout,
  computeKeyboardLayout,
  computeTypingArenaLayout,
} from '../src/utils/responsiveLayout';
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  clampWindowBoundsToDisplays,
  computeFirstRunBounds,
  resolveRestoredWindowBounds,
} from '../shared/windowBounds';

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
  assert.equal(GRAPHICS_THRESHOLDS.REALISTIC_TEXTURE_MEMORY_BUDGET_MB, 150);
  assert.equal(GRAPHICS_THRESHOLDS.REALISTIC_MIN_MEDIAN_FPS, 58);
  assert.equal(GRAPHICS_THRESHOLDS.REALISTIC_MIN_ONE_PERCENT_LOW_FPS, 45);
});

test('Phase 12 Audit: Light/Full parity, manual Realistic toggles, geometry budgets & 20x disposal', () => {
  // Light & Full preserve Phase 11 settings untouched
  assert.equal(RENDER_SPECS['3d-light'].pixelRatioCap, 1);
  assert.equal(RENDER_SPECS['3d-light'].shadows, false);
  assert.equal(RENDER_SPECS['3d-light'].fog, false);
  assert.equal(RENDER_SPECS['3d-light'].postEffects, false);
  assert.equal(RENDER_SPECS['3d-light'].maxDrawCalls, 50);

  assert.equal(RENDER_SPECS['3d-full'].pixelRatioCap, 2);
  assert.equal(RENDER_SPECS['3d-full'].shadows, false);
  assert.equal(RENDER_SPECS['3d-full'].fog, true);
  assert.equal(RENDER_SPECS['3d-full'].bloom, true);
  assert.equal(RENDER_SPECS['3d-full'].postEffects, false);
  assert.equal(RENDER_SPECS['3d-full'].maxDrawCalls, 100);

  // Manual Realistic toggles switch MSAA render target vs native AA cleanly
  const postOnSpec = buildRenderSpecForMode('3d-realistic', {
    renderScale: 1.25,
    shadows: true,
    postEffects: true,
    hubDof: false,
    speedStreaks: true,
  });
  assert.equal(postOnSpec.multisampleSamples, 4);
  assert.equal(postOnSpec.antialias, false);
  assert.equal(postOnSpec.shadows, true);
  assert.equal(postOnSpec.renderScale, 1.25);
  assert.equal(REALISTIC_VISUAL_TUNING.shadowMapSize, 2048);

  const postOffSpec = buildRenderSpecForMode('3d-realistic', {
    renderScale: 0.75,
    shadows: false,
    postEffects: false,
    hubDof: false,
    speedStreaks: false,
  });
  assert.equal(postOffSpec.multisampleSamples, 0);
  assert.equal(postOffSpec.antialias, true);
  assert.equal(postOffSpec.shadows, false);
  assert.equal(postOffSpec.bloom, false);

  // Measure actual Three.js procedural Realistic geometry triangle counts & 20x scene disposal
  const countTris = (g: THREE.BufferGeometry) =>
    g.index ? g.index.count / 3 : g.attributes.position.count / 3;

  const c = DETAIL_CONSTANTS.realistic;
  let maxSceneTris = 0;
  for (let cycle = 0; cycle < 20; cycle++) {
    const scene = new THREE.Scene();
    const sGeo = new THREE.SphereGeometry(0.68, c.sphereSegments, Math.round(c.sphereSegments * 0.75));
    const iGeo = new THREE.IcosahedronGeometry(0.68, c.asteroidIcosaDetail);
    const lGeo = new THREE.LatheGeometry(
      [new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0.2, 1.0)],
      c.latheSegments,
    );
    const rGeo = new THREE.PlaneGeometry(15.2, 790, 12, c.roadSubdivisions);

    const worstBubbleSceneTris = countTris(sGeo) * 12;
    const worstAsteroidSceneTris = countTris(iGeo) * 10;
    const worstRainSceneTris = countTris(lGeo) * 10 + countTris(rGeo);
    maxSceneTris = Math.max(worstBubbleSceneTris, worstAsteroidSceneTris, worstRainSceneTris);

    const mat = new THREE.MeshPhysicalMaterial({roughness: 0.2, metalness: 0.8});
    scene.add(new THREE.Mesh(sGeo, mat));
    scene.add(new THREE.Mesh(iGeo, mat));
    scene.add(new THREE.Mesh(lGeo, mat));
    scene.add(new THREE.Mesh(rGeo, mat));

    disposeThreeScene(scene);
    assert.equal(scene.children.length, 0, 'Scene must clear all children on dispose');
  }
  assert.ok(
    maxSceneTris <= c.triangleBudget,
    `Realistic hero triangle budget exceeded: ${maxSceneTris} > ${c.triangleBudget}`,
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

test('computeDailyGoalProgress and getTodayActivitySeconds track profile dailyGoalMinutes accurately', () => {
  const today = getLocalDateKey();
  const sampleProgress: Pick<ProfileProgress, 'dailyGoalMinutes' | 'dailyActivity'> = {
    dailyGoalMinutes: 20,
    dailyActivity: {
      [today]: {seconds: 450, words: 300, sessions: 3},
    },
  };

  assert.equal(getTodayActivitySeconds(sampleProgress as ProfileProgress, today), 450);
  assert.equal(getTodayActivitySeconds(null, today), 0);

  // Default empty progress
  const empty = computeDailyGoalProgress({});
  assert.equal(empty.goalMinutes, 15);
  assert.equal(empty.todayMinutes, 0);
  assert.equal(empty.pct, 0);
  assert.equal(empty.goalReached, false);

  // Saved 450s (7.5 min) + 150s live elapsed (2.5 min) out of 20 min = 50%
  const activeRun = computeDailyGoalProgress({
    dailyGoalMinutes: sampleProgress.dailyGoalMinutes,
    savedTodaySeconds: getTodayActivitySeconds(sampleProgress as ProfileProgress, today),
    liveElapsedMs: 150_400,
    includeLiveElapsed: true,
  });
  assert.equal(activeRun.totalSeconds, 600);
  assert.equal(activeRun.todayMinutes, 10);
  assert.equal(activeRun.pct, 50);
  assert.equal(activeRun.goalReached, false);

  // Finished session excludes liveElapsedMs so saved dailyActivity is not double-counted
  const finishedRun = computeDailyGoalProgress({
    dailyGoalMinutes: sampleProgress.dailyGoalMinutes,
    savedTodaySeconds: 600,
    liveElapsedMs: 150_400,
    includeLiveElapsed: false,
  });
  assert.equal(finishedRun.totalSeconds, 600);
  assert.equal(finishedRun.todayMinutes, 10);
  assert.equal(finishedRun.pct, 50);

  // Exceeding dailyGoalMinutes caps percentage at 100 while preserving actual minutes
  const exceeded = computeDailyGoalProgress({
    dailyGoalMinutes: 15,
    savedTodaySeconds: 1200,
    liveElapsedMs: 0,
    includeLiveElapsed: false,
  });
  assert.equal(exceeded.todayMinutes, 20);
  assert.equal(exceeded.pct, 100);
  assert.equal(exceeded.goalReached, true);
});

test('Phase 13A screenInfo resolves size classes, aspect classes, layout profiles, and --ui-scale across all targets', () => {
  const mk = (
    width: number,
    height: number,
    overrides?: Partial<Parameters<typeof computeScreenInfoSnapshot>[0]>,
  ) =>
    computeScreenInfoSnapshot({
      width,
      height,
      devicePixelRatio: 1,
      layoutPreference: 'auto',
      interfaceSize: 'auto',
      widePanels: true,
      emulatedSize: null,
      fitToWindow: true,
      hostWindowWidth: width,
      hostWindowHeight: height,
      ...overrides,
    });

  // Compact small laptop
  const small = mk(1024, 600);
  assert.equal(small.sizeClass, 'md');
  assert.equal(small.layoutProfile, 'compact');
  assert.equal(small.uiScale, 0.8);
  assert.equal(small.showSidePanels, false);

  // Baseline 1366x768
  const base = mk(1366, 768);
  assert.equal(base.sizeClass, 'lg');
  assert.equal(base.aspectClass, 'standard');
  assert.equal(base.layoutProfile, 'standard');
  assert.equal(base.uiScale, 1);

  // 34-inch 21:9 ultrawide (3440x1440)
  const uw = mk(3440, 1440);
  assert.equal(uw.sizeClass, '2xl');
  assert.equal(uw.aspectClass, 'ultrawide');
  assert.equal(uw.layoutProfile, 'wide');
  assert.equal(uw.showSidePanels, true);
  assert.equal(uw.uiScale, 1.875);

  // 32:9 super-ultrawide (5120x1440)
  const suw = mk(5120, 1440);
  assert.equal(suw.aspectClass, 'super-ultrawide');
  assert.equal(suw.layoutProfile, 'super-ultrawide');
  assert.equal(suw.showSidePanels, true);

  // 4K clamps --ui-scale at 2.2
  const fourK = mk(3840, 2160);
  assert.equal(fourK.uiScale, 2.2);
  assert.equal(fourK.layoutProfile, 'standard');

  // Portrait tall window
  const portrait = mk(1080, 1920);
  assert.equal(portrait.orientation, 'portrait');
  assert.equal(portrait.aspectClass, 'portrait');
  assert.equal(portrait.layoutProfile, 'portrait');

  // Manual Settings overrides
  const focusUw = mk(3440, 1440, {layoutPreference: 'focus'});
  assert.equal(focusUw.layoutProfile, 'focus');
  assert.equal(focusUw.showSidePanels, false);

  const panelsOff = mk(3440, 1440, {widePanels: false});
  assert.equal(panelsOff.layoutProfile, 'wide');
  assert.equal(panelsOff.showSidePanels, false);

  const largeBase = mk(1366, 768, {interfaceSize: 'large'});
  assert.equal(largeBase.uiScale, 1.18);

  const smallBase = mk(1366, 768, {interfaceSize: 'small'});
  assert.equal(smallBase.uiScale, 0.85);

  assert.equal(LAYOUT_TESTER_PRESETS.length, 8);
});

test('Phase 13B responsiveLayout enforces readable text bounds, 3-line viewport, keyboard scaling, and HUD cols', () => {
  const mkScreen = (width: number, height: number) =>
    computeScreenInfoSnapshot({
      width,
      height,
      devicePixelRatio: 1,
      layoutPreference: 'auto',
      interfaceSize: 'auto',
      widePanels: true,
      emulatedSize: null,
      fitToWindow: true,
      hostWindowWidth: width,
      hostWindowHeight: height,
    });

  const sizes: Array<[number, number]> = [
    [1024, 600],
    [1366, 768],
    [3440, 1440],
    [5120, 1440],
    [3840, 2160],
    [1080, 1920],
  ];

  for (const [w, h] of sizes) {
    const scr = mkScreen(w, h);
    for (const tz of ['S', 'M', 'L', 'XL'] as const) {
      const arena = computeTypingArenaLayout(scr, tz);
      assert.ok(arena.fontSizePx >= 16 && arena.fontSizePx <= 36, `${w}x${h} ${tz} font=${arena.fontSizePx}`);
      const expectedMinHeight = Math.ceil(arena.fontSizePx * arena.lineHeight * 3 + arena.viewportPaddingY * 2);
      assert.ok(
        arena.viewportHeightPx >= expectedMinHeight,
        `${w}x${h} ${tz} viewportHeightPx ${arena.viewportHeightPx} < ${expectedMinHeight}`,
      );
      assert.ok(arena.maxCh >= 60 && arena.maxCh <= 86);
    }
  }

  // Compact / short hides finger guide first and shrinks key height
  const small = mkScreen(1024, 600);
  const smallKb = computeKeyboardLayout(small);
  assert.equal(smallKb.allowFingerGuide, false);
  assert.equal(smallKb.keyHeightPx, 28);

  // Baseline 1366x768 keeps finger guide visible and compact-free keyboard
  const base = mkScreen(1366, 768);
  const baseKb = computeKeyboardLayout(base);
  assert.equal(baseKb.allowFingerGuide, true);
  assert.ok(baseKb.keyHeightPx >= 33);

  // Ultrawide 3440x1440 scales keys smoothly and shows 3 HUD columns even with side panels
  const uw = mkScreen(3440, 1440);
  const uwKb = computeKeyboardLayout(uw);
  const uwHud = computeHudLayout(uw);
  assert.equal(uwKb.allowFingerGuide, true);
  assert.ok(uwKb.keyHeightPx >= 46);
  assert.equal(uwHud.cols, 3);

  // Portrait 1080x1920 keeps 3-column or stacked HUD cleanly without side panels
  const portrait = mkScreen(1080, 1920);
  const portraitHud = computeHudLayout(portrait);
  assert.equal(portraitHud.cols, 1);

  // Super-ultrawide 5120x1440 keeps 82ch max typing width and 3 HUD columns
  const suw = mkScreen(5120, 1440);
  assert.equal(computeTypingArenaLayout(suw, 'M').maxCh, 82);
  assert.equal(computeHudLayout(suw).cols, 3);
});

test('Phase 13C playZone viewport, 2D backing pixel cap, and 3D camera projection framing work across all screens', () => {
  const sizes: Array<[number, number]> = [
    [1024, 600],
    [1366, 768],
    [3440, 1440],
    [5120, 1440],
    [1080, 1920],
  ];

  for (const [w, h] of sizes) {
    const vp = computePlayZoneViewport(w, h);
    assert.ok(Math.abs(vp.playW / vp.playH - CANONICAL_PLAY_ASPECT) < 0.01, `${w}x${h} play zone aspect mismatch`);
    assert.ok(vp.playX >= 0 && vp.playY >= 0, `${w}x${h} negative play offset`);
    assert.ok(vp.extendedW <= vp.playH * MAX_EXTENDED_ASPECT + 0.05, `${w}x${h} extendedW exceeded 21:9`);
    assert.ok(vp.playW <= w + 0.01 && vp.playH <= h + 0.01, `${w}x${h} play zone exceeded bounds`);
  }

  // Ultrawide HUD anchors inside centered 16:9 play zone (not flush against far screen edge)
  const uwInsets = computeSafeZoneHudInsets(3440, 1440);
  assert.ok(uwInsets.leftPx > 400, `Expected ultrawide left inset inside play zone, got ${uwInsets.leftPx}`);

  // 2D backing store caps DPR and enforces ~8M pixel ceiling
  const lowMode = computeCanvas2DBackingSize({
    cssWidth: 1366,
    cssHeight: 768,
    devicePixelRatio: 2,
    resolvedMode: '3d-light',
  });
  assert.equal(lowMode.effectiveDpr, 1);

  const softwareMode = computeCanvas2DBackingSize({
    cssWidth: 1366,
    cssHeight: 768,
    devicePixelRatio: 2,
    resolvedMode: '2d',
    isSoftwareRenderer: true,
  });
  assert.equal(softwareMode.effectiveDpr, 1);

  const normalRetina = computeCanvas2DBackingSize({
    cssWidth: 1366,
    cssHeight: 768,
    devicePixelRatio: 2,
    resolvedMode: '2d',
  });
  assert.equal(normalRetina.effectiveDpr, 2);

  for (const [w, h] of [
    [3840, 2160],
    [5120, 1440],
  ] as const) {
    const capped = computeCanvas2DBackingSize({
      cssWidth: w,
      cssHeight: h,
      devicePixelRatio: 2,
      resolvedMode: '2d',
    });
    assert.equal(capped.clampedByPixelBudget, true, `${w}x${h}@2x should clamp to pixel budget`);
    assert.ok(
      capped.totalPixels <= MAX_2D_CANVAS_PIXELS,
      `${w}x${h}@2x pixels ${capped.totalPixels} exceeded ${MAX_2D_CANVAS_PIXELS}`,
    );
  }

  // 3D camera framing keeps vertical FOV on wide/ultrawide and pulls back cleanly on tall/portrait
  const wideProj = computePlayZoneProjection(3440, 1440, 50);
  assert.equal(wideProj.fov, 50);
  assert.equal(wideProj.distanceScale, 1);

  const suwProj = computePlayZoneProjection(5120, 1440, 52);
  assert.equal(suwProj.fov, 52);
  assert.equal(suwProj.distanceScale, 1);

  const portraitProj = computePlayZoneProjection(1080, 1920, 50);
  assert.ok(portraitProj.fov > 50 && portraitProj.fov <= 76);
  assert.ok(portraitProj.distanceScale > 1.2, `Expected portrait pullback > 1.2, got ${portraitProj.distanceScale}`);

  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  const appliedScale = fitPerspectiveCamera(cam, 1080, 1920, 50);
  assert.equal(appliedScale, portraitProj.distanceScale);
  assert.equal(cam.fov, portraitProj.fov);
});

test('Phase 13D windowBounds handles first-run sizing, multi-monitor restore, and unplugged display clamping', () => {
  const laptopDisplay = {
    id: 1,
    workArea: {x: 0, y: 0, width: 1366, height: 736},
    scaleFactor: 1,
  };
  const ultrawideDisplay = {
    id: 2,
    workArea: {x: 1366, y: 0, width: 3440, height: 1400},
    scaleFactor: 1,
  };

  // First-run centers ~80% of primary work area and respects 960x600 minimum
  const firstRun = computeFirstRunBounds(laptopDisplay.workArea);
  assert.equal(firstRun.width, Math.round(1366 * 0.8));
  assert.ok(firstRun.width >= MIN_WINDOW_WIDTH);
  assert.ok(firstRun.height >= MIN_WINDOW_HEIGHT);
  assert.equal(firstRun.x, Math.round((1366 - firstRun.width) / 2));

  // Tiny display clamps safely down to display work area without throwing
  const tinyFirst = computeFirstRunBounds({x: 0, y: 0, width: 800, height: 500});
  assert.equal(tinyFirst.width, 800);
  assert.equal(tinyFirst.height, 500);

  // Saved window on connected secondary ultrawide stays on ultrawide and keeps flags
  const onSecond = resolveRestoredWindowBounds(
    {width: 1800, height: 1000, x: 1900, y: 120, isMaximized: true, isFullScreen: false},
    [laptopDisplay, ultrawideDisplay],
    laptopDisplay,
  );
  assert.equal(onSecond.x, 1900);
  assert.equal(onSecond.y, 120);
  assert.equal(onSecond.isMaximized, true);
  assert.equal(onSecond.isFullScreen, false);

  // Unplugged ultrawide -> restored window clamps cleanly into primary laptop display
  const afterUnplug = resolveRestoredWindowBounds(
    {width: 2200, height: 1100, x: 2400, y: 200, isFullScreen: true},
    [laptopDisplay],
    laptopDisplay,
  );
  assert.ok(afterUnplug.width <= laptopDisplay.workArea.width);
  assert.ok(afterUnplug.height <= laptopDisplay.workArea.height);
  assert.ok(afterUnplug.x >= laptopDisplay.workArea.x);
  assert.ok(afterUnplug.x + afterUnplug.width <= laptopDisplay.workArea.x + laptopDisplay.workArea.width);
  assert.ok(afterUnplug.y >= laptopDisplay.workArea.y);
  assert.ok(afterUnplug.y + afterUnplug.height <= laptopDisplay.workArea.y + laptopDisplay.workArea.height);
  assert.equal(afterUnplug.isFullScreen, true);

  // Live display removal clamps current bounds onto remaining display
  const clamped = clampWindowBoundsToDisplays(
    {x: 3600, y: 300, width: 1200, height: 800},
    [laptopDisplay],
    laptopDisplay,
  );
  assert.equal(clamped.width, 1200);
  assert.equal(clamped.height, 736);
  assert.equal(clamped.x, 166);
  assert.equal(clamped.y, 0);
});

