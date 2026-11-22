import * as THREE from 'three';
import {createSceneRenderPipeline} from '@/src/three/bloom';
import {
  createCappedLoop,
  createManagedRenderer,
  fitPerspectiveCamera,
  readThemePalette3D,
  SCRATCH_COLOR,
  SCRATCH_MAT4,
  SCRATCH_QUAT,
  SCRATCH_VEC3_A,
  SCRATCH_VEC3_B,
} from '@/src/three/core';
import {WordSpritePool, type PooledWordLabel} from '@/src/three/labelSprites';
import type {LazyThreeMountContext, LazyThreeSceneHandle} from '@/src/three/ThreeCanvasHost';

export interface WordRainDropSnapshot {
  id: number;
  word: string;
  typed: number;
  x: number; // 0..1
  y: number; // px
  golden: boolean;
}

export interface WordRainRippleEvent {
  xNorm: number;
  golden: boolean;
  missed: boolean;
}

export interface WordRainMutableSnapshot {
  paused: boolean;
  finished: boolean;
  started: boolean;
  lives: number;
  clears: number;
  score: number;
  lockedId: number | null;
  drops: WordRainDropSnapshot[];
  pendingRipples3D?: WordRainRippleEvent[];
}

export interface WordRain3DState {
  gameRef: {current: WordRainMutableSnapshot};
  fieldHeight: number;
}

interface DropVisual {
  group: THREE.Group;
  dropMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
  dropMat: THREE.MeshPhysicalMaterial;
  haloMat: THREE.MeshBasicMaterial;
  badge: PooledWordLabel | null;
  inUse: boolean;
  assignedId: number;
  laneZ: number;
}

interface PooledRipple {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
}

function createTeardropGeometry(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = bottom rounded bulb, 1 = top tip
    const y = (t - 0.35) * 1.15;
    const r = Math.sin(Math.pow(t, 0.62) * Math.PI) * 0.42 * (1 - t * 0.38);
    pts.push(new THREE.Vector2(Math.max(0.002, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.computeVertexNormals();
  return geo;
}

export function mountScene(ctx: LazyThreeMountContext): LazyThreeSceneHandle {
  const palette = readThemePalette3D();
  const managed = createManagedRenderer(ctx.container, ctx.preset, {
    alpha: false,
    useEnvironment: true,
  });
  const {renderer, scene} = managed;

  const skyColor = 0x071226;
  scene.background = new THREE.Color(skyColor);
  if (ctx.preset.fog) {
    scene.fog = new THREE.FogExp2(skyColor, 0.038 / Math.max(0.75, ctx.preset.drawDistanceScale));
  }

  const baseFov = 48;
  const camera = new THREE.PerspectiveCamera(
    baseFov,
    Math.max(1, ctx.container.clientWidth) / Math.max(1, ctx.container.clientHeight),
    0.2,
    120,
  );
  camera.position.set(0, 1.5, 11.4);
  camera.lookAt(0, -0.35, -3.5);
  fitPerspectiveCamera(
    camera,
    ctx.container.clientWidth,
    ctx.container.clientHeight,
    baseFov,
  );

  // Tranquil Rain Pond 3-light rig
  const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x0b172c, 0.78);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xe0f2fe, 1.35);
  keyLight.position.set(8, 16, 10);
  if (ctx.preset.shadows) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
  }
  scene.add(keyLight);

  const pondGlow = new THREE.PointLight(0x38bdf8, 1.9, 24, 1.6);
  pondGlow.position.set(0, 0.4, -2);
  scene.add(pondGlow);

  // 1. Dark Pond Surface & Horizon Rings
  const pondGeo = new THREE.PlaneGeometry(76, 48);
  pondGeo.rotateX(-Math.PI / 2);
  const pondMat = new THREE.MeshPhysicalMaterial({
    color: 0x081a33,
    roughness: 0.14,
    metalness: 0.42,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
  });
  const pond = new THREE.Mesh(pondGeo, pondMat);
  pond.position.set(0, -2.15, -6);
  pond.receiveShadow = ctx.preset.shadows;
  scene.add(pond);

  const waterlineGeo = new THREE.BoxGeometry(14.5, 0.05, 0.08);
  const waterlineMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.7,
  });
  const waterline = new THREE.Mesh(waterlineGeo, waterlineMat);
  waterline.position.set(0, -2.08, -1.6);
  scene.add(waterline);

  // 2. InstancedMesh Ambient Rain Streaks across Depth Lanes
  const streakCount = ctx.preset.tier === 'low' ? 60 : 120;
  const streakGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.68, 4);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.34,
  });
  const streakInstanced = new THREE.InstancedMesh(streakGeo, streakMat, streakCount);
  streakInstanced.frustumCulled = false;
  const streakData = new Float32Array(streakCount * 4); // x, y, z, speed
  for (let i = 0; i < streakCount; i++) {
    streakData[i * 4 + 0] = (((i * 53) % 100) / 100 - 0.5) * 20;
    streakData[i * 4 + 1] = (((i * 31) % 100) / 100) * 8 - 2;
    streakData[i * 4 + 2] = -14 + ((i * 17) % 18);
    streakData[i * 4 + 3] = 5.5 + (i % 5) * 1.1;
  }
  scene.add(streakInstanced);

  // 3. Pooled Word Raindrops + Cached Sprite Badges
  const teardropGeo = createTeardropGeometry();
  const haloGeo = new THREE.TorusGeometry(0.58, 0.04, 8, 24);
  haloGeo.rotateX(Math.PI / 2);

  const wordSprites = new WordSpritePool(10, 20);
  const dropPool: DropVisual[] = Array.from({length: 10}, (_, idx) => {
    const group = new THREE.Group();
    group.visible = false;

    const dropMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.1,
      metalness: 0.15,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.88,
    });
    const dropMesh = new THREE.Mesh(teardropGeo, dropMat);
    dropMesh.castShadow = ctx.preset.shadows;
    group.add(dropMesh);

    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.85,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.y = -0.25;
    haloMesh.visible = false;
    group.add(haloMesh);

    scene.add(group);
    return {
      group,
      dropMesh,
      haloMesh,
      dropMat,
      haloMat,
      badge: null,
      inUse: false,
      assignedId: -1,
      laneZ: ((idx % 3) - 1) * 2.2 - 1.6,
    };
  });

  // 4. Pooled Pond Splash Ripples
  const rippleGeo = new THREE.RingGeometry(0.28, 0.42, 24);
  rippleGeo.rotateX(-Math.PI / 2);
  const ripplePool: PooledRipple[] = Array.from({length: 10}, () => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(rippleGeo, mat);
    mesh.visible = false;
    mesh.position.y = -2.11;
    scene.add(mesh);
    return {mesh, mat, active: false, life: 0};
  });
  let rippleCursor = 0;

  const accentCss = '#' + new THREE.Color(palette.accent).getHexString();
  let externalState: WordRain3DState | null = null;

  const pipeline = createSceneRenderPipeline(renderer, scene, camera, ctx.preset, ctx.probe, {
    strength: 0.3,
    radius: 0.35,
    threshold: 0.86,
  });

  if (!ctx.probe.isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  const renderFrame = (dtSec: number, elapsedSec: number) => {
    const stateObj = externalState;
    const snap = stateObj?.gameRef.current;
    const fieldH = stateObj?.fieldHeight ?? 360;

    // 1. Update background ambient rain streaks
    const rainMul = snap?.paused || ctx.calmMode ? 0.18 : 1.0;
    for (let i = 0; i < streakCount; i++) {
      let y = streakData[i * 4 + 1];
      if (!ctx.calmMode) {
        y -= streakData[i * 4 + 3] * dtSec * rainMul;
        if (y < -2.1) y = 5.5;
        streakData[i * 4 + 1] = y;
      }
      SCRATCH_VEC3_A.set(streakData[i * 4 + 0], y, streakData[i * 4 + 2]);
      SCRATCH_QUAT.identity();
      SCRATCH_VEC3_B.set(1, 1, 1);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      streakInstanced.setMatrixAt(i, SCRATCH_MAT4);
    }
    streakInstanced.instanceMatrix.needsUpdate = true;

    // 2. Sync active word drops + sprite labels
    const activeDrops = snap?.drops ?? [];
    for (const slot of dropPool) {
      if (!slot.inUse) continue;
      if (!activeDrops.some((d) => d.id === slot.assignedId)) {
        slot.inUse = false;
        slot.assignedId = -1;
        slot.group.visible = false;
        if (slot.badge) {
          wordSprites.release(slot.badge);
          slot.badge = null;
        }
      }
    }

    const maxY = Math.max(120, fieldH - 34);
    for (const drop of activeDrops) {
      let slot = dropPool.find((s) => s.inUse && s.assignedId === drop.id);
      if (!slot) {
        slot = dropPool.find((s) => !s.inUse);
        if (!slot) continue;
        slot.inUse = true;
        slot.assignedId = drop.id;
        slot.laneZ = ((drop.id % 3) - 1) * 2.2 - 1.6;
        slot.group.visible = true;
        slot.badge = wordSprites.acquire(scene);
        slot.badge.sprite.scale.set(2.9, 0.72, 1);
      }

      const progress = Math.max(0, Math.min(1, (drop.y - 28) / Math.max(1, maxY - 28)));
      const wx = (drop.x - 0.5) * 11.4;
      const wy = 3.2 - progress * 5.05;
      const wz = slot.laneZ;
      slot.group.position.set(wx, wy, wz);

      const locked = snap?.lockedId === drop.id;
      slot.haloMesh.visible = locked || drop.golden;
      if (drop.golden) {
        slot.dropMat.color.setHex(0xfbbf24);
        slot.dropMat.emissive.setHex(0xd97706);
        slot.dropMat.emissiveIntensity = 0.75;
        slot.haloMat.color.setHex(0xfde68a);
      } else {
        slot.dropMat.color.setHex(locked ? palette.accent : 0x38bdf8);
        slot.dropMat.emissive.setHex(locked ? palette.accent : 0x0284c7);
        slot.dropMat.emissiveIntensity = locked ? 0.72 : 0.4;
        slot.haloMat.color.setHex(0x22d3ee);
      }

      if (!ctx.calmMode && !snap?.paused) {
        slot.dropMesh.rotation.y = elapsedSec * 1.4 + drop.id;
      }

      if (slot.badge) {
        slot.badge.sprite.position.set(wx, wy + 0.88, wz + 0.65);
        wordSprites.updateLabel(slot.badge, {
          text: drop.word,
          typedCount: drop.typed,
          isActive: locked,
          accentHex: drop.golden ? '#FBBF24' : accentCss,
        });
      }
    }

    // 3. Consume ripple splashes
    if (snap?.pendingRipples3D && snap.pendingRipples3D.length > 0) {
      while (snap.pendingRipples3D.length > 0) {
        const ev = snap.pendingRipples3D.shift()!;
        const rp = ripplePool[rippleCursor];
        rippleCursor = (rippleCursor + 1) % ripplePool.length;
        rp.active = true;
        rp.life = 1.0;
        rp.mesh.visible = true;
        rp.mesh.position.set((ev.xNorm - 0.5) * 11.4, -2.11, -1.6);
        rp.mesh.scale.set(1, 1, 1);
        rp.mat.color.setHex(ev.missed ? 0xfb7185 : ev.golden ? 0xfbbf24 : 0x38bdf8);
        rp.mat.opacity = 0.9;
      }
    }

    for (const rp of ripplePool) {
      if (!rp.active) continue;
      rp.life -= dtSec * 1.65;
      if (rp.life <= 0) {
        rp.active = false;
        rp.mesh.visible = false;
      } else {
        const s = 1 + (1 - rp.life) * 4.5;
        rp.mesh.scale.set(s, s, 1);
        rp.mat.opacity = rp.life * 0.85;
      }
    }

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
      externalState = (next as WordRain3DState) ?? null;
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
