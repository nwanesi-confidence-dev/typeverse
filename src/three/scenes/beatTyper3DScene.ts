import * as THREE from 'three';
import {createSceneRenderPipeline} from '@/src/three/bloom';
import {
  createCappedLoop,
  createManagedRenderer,
  fitPerspectiveCamera,
  readThemePalette3D,
  SCRATCH_COLOR,
  SCRATCH_EULER,
  SCRATCH_MAT4,
  SCRATCH_QUAT,
  SCRATCH_VEC3_A,
  SCRATCH_VEC3_B,
} from '@/src/three/core';
import {WordSpritePool, type PooledWordLabel} from '@/src/three/labelSprites';
import type {LazyThreeMountContext, LazyThreeSceneHandle} from '@/src/three/ThreeCanvasHost';

export interface BeatNoteSnapshot {
  id: number;
  lane: 0 | 1 | 2 | 3;
  keyChar: string;
  y: number;
  resolved: boolean;
}

export interface BeatHitSparkEvent {
  lane: 0 | 1 | 2 | 3;
  grade: 'perfect' | 'good' | 'miss';
}

export interface BeatTyperMutableSnapshot {
  paused: boolean;
  finished: boolean;
  started: boolean;
  notes: BeatNoteSnapshot[];
  laneFlash: number[];
  beatCount: number;
  pendingHits3D?: BeatHitSparkEvent[];
}

export interface BeatTyper3DState {
  gameRef: {current: BeatTyperMutableSnapshot};
  fieldHeight: number;
  bpm: number;
}

interface NoteVisual {
  group: THREE.Group;
  gemMat: THREE.MeshPhysicalMaterial;
  badge: PooledWordLabel | null;
  inUse: boolean;
  assignedId: number;
  lane: 0 | 1 | 2 | 3;
  keyChar: string;
}

interface BeatSpark {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  colorHex: number;
}

const LANE_X = [-3.3, -1.1, 1.1, 3.3] as const;
const LANE_HEX = [0xf472b6, 0x34d399, 0x22d3ee, 0xa78bfa] as const;
const LANE_CSS = ['#F472B6', '#34D399', '#22D3EE', '#A78BFA'] as const;

export function mountScene(ctx: LazyThreeMountContext): LazyThreeSceneHandle {
  const palette = readThemePalette3D();
  const managed = createManagedRenderer(ctx.container, ctx.preset, {
    alpha: false,
    useEnvironment: true,
  });
  const {renderer, scene} = managed;

  const skyColor = 0x070a18;
  scene.background = new THREE.Color(skyColor);
  if (ctx.preset.fog) {
    scene.fog = new THREE.Fog(skyColor, 18, 48 * Math.max(0.8, ctx.preset.drawDistanceScale));
  }

  const baseFov = 50;
  const camera = new THREE.PerspectiveCamera(
    baseFov,
    Math.max(1, ctx.container.clientWidth) / Math.max(1, ctx.container.clientHeight),
    0.2,
    120,
  );
  camera.position.set(0, 5.4, 9.2);
  camera.lookAt(0, 0.25, -7.2);
  fitPerspectiveCamera(
    camera,
    ctx.container.clientWidth,
    ctx.container.clientHeight,
    baseFov,
  );

  // Rhythm Stage 3-Light Rig (<= 3 lights)
  const hemi = new THREE.HemisphereLight(0xa5f3fc, 0x090d1c, 0.72);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xf8fafc, 1.45);
  dirLight.position.set(6, 16, 12);
  if (ctx.preset.shadows) {
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.bias = -0.0005;
  }
  scene.add(dirLight);

  const strikeGlow = new THREE.PointLight(palette.accent, 2.2, 22, 1.5);
  strikeGlow.position.set(0, 1.6, 2.2);
  scene.add(strikeGlow);

  // 1. Perspective Note Highway Deck & Lane Dividers
  const deckGeo = new THREE.BoxGeometry(9.6, 0.2, 44);
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x0b1224,
    roughness: 0.45,
    metalness: 0.45,
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.set(0, -0.1, -15);
  deck.receiveShadow = ctx.preset.shadows;
  scene.add(deck);

  const railGeo = new THREE.BoxGeometry(0.14, 0.28, 44);
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: palette.accent,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.7,
  });
  const railL = new THREE.Mesh(railGeo, railMat);
  railL.position.set(-4.85, 0.08, -15);
  scene.add(railL);
  const railR = new THREE.Mesh(railGeo, railMat);
  railR.position.set(4.85, 0.08, -15);
  scene.add(railR);

  // Lane separator lines (offset +0.02 above deck)
  const sepGeo = new THREE.BoxGeometry(0.06, 0.02, 44);
  const sepMat = new THREE.MeshBasicMaterial({color: 0x334155});
  for (const sx of [-2.2, 0, 2.2]) {
    const sep = new THREE.Mesh(sepGeo, sepMat);
    sep.position.set(sx, 0.015, -15);
    scene.add(sep);
  }

  // Scrolling Tempo Grid Bars (InstancedMesh)
  const barCount = 12;
  const barGeo = new THREE.BoxGeometry(9.4, 0.015, 0.08);
  const barMat = new THREE.MeshBasicMaterial({color: 0x1e3a5f});
  const barInstanced = new THREE.InstancedMesh(barGeo, barMat, barCount);
  barInstanced.frustumCulled = false;
  scene.add(barInstanced);

  // Strike Zone Receptor Pads at z = 2.0 (matches strikeY = h - 58)
  const strikeZ = 2.0;
  const strikeStripGeo = new THREE.BoxGeometry(9.5, 0.04, 0.14);
  const strikeStripMat = new THREE.MeshStandardMaterial({
    color: palette.accent,
    emissive: palette.accent,
    emissiveIntensity: 1.4,
  });
  const strikeStrip = new THREE.Mesh(strikeStripGeo, strikeStripMat);
  strikeStrip.position.set(0, 0.03, strikeZ);
  scene.add(strikeStrip);

  const receptorGeo = new THREE.CylinderGeometry(0.62, 0.68, 0.14, 16);
  const receptorMats: THREE.MeshStandardMaterial[] = [];
  for (let l = 0; l < 4; l++) {
    const rMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: LANE_HEX[l],
      emissiveIntensity: 0.45,
      metalness: 0.6,
      roughness: 0.25,
    });
    receptorMats.push(rMat);
    const pad = new THREE.Mesh(receptorGeo, rMat);
    pad.position.set(LANE_X[l], 0.08, strikeZ);
    scene.add(pad);
  }

  // 2. Pooled 3D Beveled Note Keycaps + Sprite Key Badges
  const noteBaseGeo = new THREE.BoxGeometry(1.18, 0.24, 0.88);
  const noteCapGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.22, 8);
  const wordSprites = new WordSpritePool(16, 28);

  const notePool: NoteVisual[] = Array.from({length: 18}, () => {
    const group = new THREE.Group();
    group.visible = false;

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.45,
      metalness: 0.5,
    });
    const baseMesh = new THREE.Mesh(noteBaseGeo, baseMat);
    baseMesh.position.y = 0.14;
    baseMesh.castShadow = ctx.preset.shadows;
    group.add(baseMesh);

    const gemMat = new THREE.MeshPhysicalMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.72,
      roughness: 0.14,
      metalness: 0.25,
      clearcoat: 1.0,
    });
    const gemMesh = new THREE.Mesh(noteCapGeo, gemMat);
    gemMesh.position.y = 0.34;
    group.add(gemMesh);

    scene.add(group);
    return {
      group,
      gemMat,
      badge: null,
      inUse: false,
      assignedId: -1,
      lane: 0,
      keyChar: 'a',
    };
  });

  // 3. InstancedMesh Hit Sparks
  const maxSparks = Math.max(20, Math.round(64 * ctx.preset.particleScale));
  const sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
  const sparkMat = new THREE.MeshBasicMaterial({color: 0xffffff});
  const sparkInstanced = new THREE.InstancedMesh(sparkGeo, sparkMat, maxSparks);
  sparkInstanced.frustumCulled = false;

  const sparks: BeatSpark[] = Array.from({length: maxSparks}, (_, idx) => {
    SCRATCH_VEC3_A.set(0, -40, 0);
    SCRATCH_QUAT.identity();
    SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
    SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
    sparkInstanced.setMatrixAt(idx, SCRATCH_MAT4);
    SCRATCH_COLOR.setHex(palette.accent);
    sparkInstanced.setColorAt(idx, SCRATCH_COLOR);
    return {
      active: false,
      x: 0,
      y: -40,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.4,
      colorHex: palette.accent,
    };
  });
  sparkInstanced.instanceMatrix.needsUpdate = true;
  if (sparkInstanced.instanceColor) sparkInstanced.instanceColor.needsUpdate = true;
  scene.add(sparkInstanced);
  let sparkCursor = 0;

  let externalState: BeatTyper3DState | null = null;
  let highwayOffset = 0;

  const pipeline = createSceneRenderPipeline(renderer, scene, camera, ctx.preset, ctx.probe, {
    strength: 0.36,
    radius: 0.34,
    threshold: 0.84,
  });

  if (!ctx.probe.isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  const renderFrame = (dtSec: number, elapsedSec: number) => {
    const stateObj = externalState;
    const snap = stateObj?.gameRef.current;
    const fieldH = stateObj?.fieldHeight ?? 360;
    const bpm = stateObj?.bpm ?? 100;

    // 1. Scroll highway tempo bars smoothly
    if (!ctx.calmMode && snap?.started && !snap.paused) {
      highwayOffset = (highwayOffset + dtSec * (bpm / 60) * 3.4) % 3.4;
    }
    for (let i = 0; i < barCount; i++) {
      const bz = -34 + i * 3.4 + highwayOffset;
      SCRATCH_VEC3_A.set(0, 0.02, bz);
      SCRATCH_QUAT.identity();
      SCRATCH_VEC3_B.set(1, 1, 1);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      barInstanced.setMatrixAt(i, SCRATCH_MAT4);
    }
    barInstanced.instanceMatrix.needsUpdate = true;

    // 2. Lane receptor flashes
    if (snap) {
      for (let l = 0; l < 4; l++) {
        const flash = snap.laneFlash[l] ?? 0;
        receptorMats[l].emissiveIntensity = 0.45 + flash * 2.2;
      }
    }

    // 3. Sync falling notes along Z toward strikeZ = +2.0
    const activeNotes = snap?.notes ?? [];
    for (const slot of notePool) {
      if (!slot.inUse) continue;
      const match = activeNotes.find((n) => n.id === slot.assignedId && !n.resolved);
      if (!match) {
        slot.inUse = false;
        slot.assignedId = -1;
        slot.group.visible = false;
        if (slot.badge) {
          wordSprites.release(slot.badge);
          slot.badge = null;
        }
      }
    }

    const strikeY = fieldH - 58;
    const spanY = strikeY + 16; // y goes from -16 to strikeY (and slightly past)
    for (const note of activeNotes) {
      if (note.resolved) continue;
      let slot = notePool.find((s) => s.inUse && s.assignedId === note.id);
      if (!slot) {
        slot = notePool.find((s) => !s.inUse);
        if (!slot) continue;
        slot.inUse = true;
        slot.assignedId = note.id;
        slot.lane = note.lane;
        slot.keyChar = note.keyChar;
        slot.group.visible = true;
        slot.badge = wordSprites.acquire(scene);
        slot.badge.sprite.scale.set(1.55, 0.44, 1);
      }

      const progress = (note.y + 16) / Math.max(120, spanY);
      const wz = -31 + progress * (strikeZ - -31);
      const wx = LANE_X[note.lane];
      slot.group.position.set(wx, 0.05, wz);

      slot.gemMat.color.setHex(LANE_HEX[note.lane]);
      slot.gemMat.emissive.setHex(LANE_HEX[note.lane]);
      const nearStrike = Math.abs(wz - strikeZ) < 2.2;
      slot.gemMat.emissiveIntensity = nearStrike ? 1.45 : 0.72;

      if (slot.badge) {
        slot.badge.sprite.position.set(wx, 1.05, wz);
        wordSprites.updateLabel(slot.badge, {
          text: note.keyChar.toUpperCase(),
          typedCount: 0,
          isActive: nearStrike,
          accentHex: LANE_CSS[note.lane],
        });
      }
    }

    // 4. Consume hit sparks
    if (snap?.pendingHits3D && snap.pendingHits3D.length > 0) {
      const perHit = Math.max(5, Math.round(10 * ctx.preset.particleScale));
      while (snap.pendingHits3D.length > 0) {
        const ev = snap.pendingHits3D.shift()!;
        if (ctx.calmMode) continue;
        const hx = LANE_X[ev.lane];
        const colHex =
          ev.grade === 'miss' ? 0xfb7185 : ev.grade === 'perfect' ? 0x22d3ee : LANE_HEX[ev.lane];
        for (let k = 0; k < perHit; k++) {
          const sp = sparks[sparkCursor];
          sparkCursor = (sparkCursor + 1) % maxSparks;
          const ang = (Math.PI * 2 * k) / perHit + Math.random() * 0.4;
          sp.active = true;
          sp.x = hx;
          sp.y = 0.42;
          sp.z = strikeZ;
          sp.vx = Math.cos(ang) * (2.6 + Math.random() * 2.8);
          sp.vy = 2.4 + Math.random() * 3.4;
          sp.vz = Math.sin(ang) * 2.2;
          sp.maxLife = 0.36;
          sp.life = sp.maxLife;
          sp.colorHex = colHex;
        }
      }
    }

    for (let i = 0; i < maxSparks; i++) {
      const sp = sparks[i];
      if (!sp.active) continue;
      sp.life -= dtSec;
      if (sp.life <= 0) {
        sp.active = false;
        SCRATCH_VEC3_A.set(0, -40, 0);
        SCRATCH_QUAT.identity();
        SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        sparkInstanced.setMatrixAt(i, SCRATCH_MAT4);
        continue;
      }
      sp.x += sp.vx * dtSec;
      sp.y += sp.vy * dtSec;
      sp.vy -= 9.5 * dtSec;
      sp.z += sp.vz * dtSec;
      const frac = sp.life / sp.maxLife;
      SCRATCH_VEC3_A.set(sp.x, sp.y, sp.z);
      SCRATCH_EULER.set(elapsedSec * 7, i, 0);
      SCRATCH_QUAT.setFromEuler(SCRATCH_EULER);
      SCRATCH_VEC3_B.set(frac, frac, frac);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      sparkInstanced.setMatrixAt(i, SCRATCH_MAT4);
      SCRATCH_COLOR.setHex(sp.colorHex);
      sparkInstanced.setColorAt(i, SCRATCH_COLOR);
    }
    sparkInstanced.instanceMatrix.needsUpdate = true;
    if (sparkInstanced.instanceColor) sparkInstanced.instanceColor.needsUpdate = true;

    pipeline.render();
  };

  const loop = createCappedLoop({
    targetFps: ctx.preset.sceneFrameCap,
    isSoftwareGl: ctx.probe.isSoftwareGl,
    onFrame: renderFrame,
    onSampleDtMs: ctx.onFrameDtMs,
  });
  loop.start();

  return {
    updateState(next: unknown) {
      externalState = (next as BeatTyper3DState) ?? null;
    },
    setTypingActive(typing: boolean) {
      loop.setTargetFps(
        typing
          ? Math.max(ctx.preset.typingFrameCap, Math.min(60, ctx.preset.sceneFrameCap))
          : ctx.preset.sceneFrameCap,
      );
    },
    resize(width: number, height: number) {
      managed.resize(width, height, camera, baseFov);
      pipeline.resize(width, height);
    },
    dispose() {
      loop.stop();
      wordSprites.dispose();
      pipeline.dispose();
      managed.dispose();
    },
  };
}
