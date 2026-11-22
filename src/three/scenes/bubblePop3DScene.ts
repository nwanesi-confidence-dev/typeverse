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

export interface BubbleSnapshot {
  id: number;
  text: string;
  typed: number;
  x: number;
  y: number;
  color: string;
  radius: number;
}

export interface BubblePopBurstEvent {
  xNorm: number;
  yPx: number;
  color: string;
}

export interface BubblePopMutableSnapshot {
  paused: boolean;
  finished: boolean;
  started: boolean;
  lives: number;
  popped: number;
  score: number;
  lockedId: number | null;
  bubbles: BubbleSnapshot[];
  pendingBursts3D?: BubblePopBurstEvent[];
}

export interface BubblePop3DState {
  gameRef: {current: BubblePopMutableSnapshot};
  fieldHeight: number;
}

interface BubbleVisual {
  group: THREE.Group;
  sphere: THREE.Mesh;
  ring: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  ringMat: THREE.MeshBasicMaterial;
  badge: PooledWordLabel | null;
  inUse: boolean;
  assignedId: number;
  depthZ: number;
}

interface PopDroplet {
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

function mapBubbleCoords(
  xNorm: number,
  yPx: number,
  fieldH: number,
  depthZ: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const topY = 34;
  const botY = Math.max(140, fieldH - 24);
  const fracFromBottom = 1 - Math.max(0, Math.min(1, (yPx - topY) / Math.max(1, botY - topY)));
  const wx = (xNorm - 0.5) * 11.4;
  const wy = -2.45 + fracFromBottom * 5.25;
  return out.set(wx, wy, depthZ);
}

export function mountScene(ctx: LazyThreeMountContext): LazyThreeSceneHandle {
  const palette = readThemePalette3D();
  const managed = createManagedRenderer(ctx.container, ctx.preset, {
    alpha: false,
    useEnvironment: true,
  });
  const {renderer, scene} = managed;

  const skyColor = 0x0b132b;
  scene.background = new THREE.Color(skyColor);
  if (ctx.preset.fog) {
    scene.fog = new THREE.FogExp2(skyColor, 0.032 / Math.max(0.75, ctx.preset.drawDistanceScale));
  }

  const baseFov = 48;
  const camera = new THREE.PerspectiveCamera(
    baseFov,
    Math.max(1, ctx.container.clientWidth) / Math.max(1, ctx.container.clientHeight),
    0.2,
    120,
  );
  camera.position.set(0, 0.25, 11.8);
  camera.lookAt(0, 0.2, -1);
  fitPerspectiveCamera(
    camera,
    ctx.container.clientWidth,
    ctx.container.clientHeight,
    baseFov,
  );

  // Studio-lit Deep Water Rig (<= 3 lights)
  const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.85);
  scene.add(hemi);

  const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
  rimLight.position.set(8, 12, 10);
  scene.add(rimLight);

  const bottomGlow = new THREE.PointLight(0x22d3ee, 2.0, 22, 1.5);
  bottomGlow.position.set(0, -3.5, 2);
  scene.add(bottomGlow);

  // Top Escape Danger Laser Bar
  const dangerGeo = new THREE.BoxGeometry(14.5, 0.06, 0.08);
  const dangerMat = new THREE.MeshStandardMaterial({
    color: 0xfb7185,
    emissive: 0xfb7185,
    emissiveIntensity: 1.4,
  });
  const dangerBar = new THREE.Mesh(dangerGeo, dangerMat);
  dangerBar.position.set(0, 2.95, 0);
  scene.add(dangerBar);

  // Rising Caustic Ambient Micro-Bubbles
  const moteCount = ctx.preset.tier === 'low' ? 36 : 64;
  const moteGeo = new THREE.SphereGeometry(0.065, 8, 6);
  const moteMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    roughness: 0.1,
    clearcoat: 1,
    transparent: true,
    opacity: 0.42,
  });
  const moteInstanced = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
  moteInstanced.frustumCulled = false;
  const moteData = new Float32Array(moteCount * 4);
  for (let i = 0; i < moteCount; i++) {
    moteData[i * 4 + 0] = (((i * 61) % 100) / 100 - 0.5) * 18;
    moteData[i * 4 + 1] = (((i * 37) % 100) / 100 - 0.5) * 7.5;
    moteData[i * 4 + 2] = -8 + ((i * 19) % 10);
    moteData[i * 4 + 3] = 0.7 + (i % 5) * 0.28;
  }
  scene.add(moteInstanced);

  // Glossy Physical Bubble Pool + Sprite Labels
  const sphereGeo = new THREE.SphereGeometry(0.68, 22, 16);
  const ringGeo = new THREE.TorusGeometry(0.78, 0.04, 8, 26);

  const wordSprites = new WordSpritePool(12, 24);
  const bubblePool: BubbleVisual[] = Array.from({length: 12}, (_, idx) => {
    const group = new THREE.Group();
    group.visible = false;

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.24,
      roughness: 0.06,
      metalness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.76,
    });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    group.add(sphere);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.visible = false;
    group.add(ring);

    scene.add(group);
    return {
      group,
      sphere,
      ring,
      mat,
      ringMat,
      badge: null,
      inUse: false,
      assignedId: -1,
      depthZ: ((idx % 3) - 1) * 1.15 - 0.5,
    };
  });

  // Pooled Pop Particle Burst Spheres
  const maxDroplets = Math.max(24, Math.round(72 * ctx.preset.particleScale));
  const dropletGeo = new THREE.SphereGeometry(0.09, 6, 6);
  const dropletMat = new THREE.MeshBasicMaterial({color: 0xffffff});
  const dropletInstanced = new THREE.InstancedMesh(dropletGeo, dropletMat, maxDroplets);
  dropletInstanced.frustumCulled = false;

  const droplets: PopDroplet[] = Array.from({length: maxDroplets}, (_, idx) => {
    SCRATCH_VEC3_A.set(0, -40, 0);
    SCRATCH_QUAT.identity();
    SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
    SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
    dropletInstanced.setMatrixAt(idx, SCRATCH_MAT4);
    SCRATCH_COLOR.setHex(palette.accent);
    dropletInstanced.setColorAt(idx, SCRATCH_COLOR);
    return {
      active: false,
      x: 0,
      y: -40,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.45,
      colorHex: palette.accent,
    };
  });
  dropletInstanced.instanceMatrix.needsUpdate = true;
  if (dropletInstanced.instanceColor) dropletInstanced.instanceColor.needsUpdate = true;
  scene.add(dropletInstanced);
  let dropletCursor = 0;

  const accentCss = '#' + new THREE.Color(palette.accent).getHexString();
  let externalState: BubblePop3DState | null = null;

  const pipeline = createSceneRenderPipeline(renderer, scene, camera, ctx.preset, ctx.probe, {
    strength: 0.34,
    radius: 0.36,
    threshold: 0.84,
  });

  if (!ctx.probe.isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  const renderFrame = (dtSec: number, elapsedSec: number) => {
    const stateObj = externalState;
    const snap = stateObj?.gameRef.current;
    const fieldH = stateObj?.fieldHeight ?? 360;

    // 1. Ambient rising caustic motes
    const moteMul = snap?.paused || ctx.calmMode ? 0.15 : 1.0;
    for (let i = 0; i < moteCount; i++) {
      let y = moteData[i * 4 + 1];
      if (!ctx.calmMode) {
        y += moteData[i * 4 + 3] * dtSec * moteMul;
        if (y > 4.2) y = -3.8;
        moteData[i * 4 + 1] = y;
      }
      SCRATCH_VEC3_A.set(moteData[i * 4 + 0], y, moteData[i * 4 + 2]);
      SCRATCH_QUAT.identity();
      SCRATCH_VEC3_B.set(1, 1, 1);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      moteInstanced.setMatrixAt(i, SCRATCH_MAT4);
    }
    moteInstanced.instanceMatrix.needsUpdate = true;

    // 2. Sync active bubbles + sprites
    const activeList = snap?.bubbles ?? [];
    for (const slot of bubblePool) {
      if (!slot.inUse) continue;
      if (!activeList.some((b) => b.id === slot.assignedId)) {
        slot.inUse = false;
        slot.assignedId = -1;
        slot.group.visible = false;
        if (slot.badge) {
          wordSprites.release(slot.badge);
          slot.badge = null;
        }
      }
    }

    for (const bubble of activeList) {
      let slot = bubblePool.find((s) => s.inUse && s.assignedId === bubble.id);
      if (!slot) {
        slot = bubblePool.find((s) => !s.inUse);
        if (!slot) continue;
        slot.inUse = true;
        slot.assignedId = bubble.id;
        slot.depthZ = ((bubble.id % 3) - 1) * 1.15 - 0.4;
        slot.group.visible = true;
        slot.badge = wordSprites.acquire(scene);
        const isSingle = bubble.text.length === 1;
        slot.badge.sprite.scale.set(isSingle ? 1.75 : 2.7, isSingle ? 0.48 : 0.68, 1);
      }

      mapBubbleCoords(bubble.x, bubble.y, fieldH, slot.depthZ, SCRATCH_VEC3_A);
      slot.group.position.copy(SCRATCH_VEC3_A);
      const bScale = bubble.radius >= 28 ? 1.12 : 0.92;
      const wobble = ctx.calmMode ? 1 : 1 + Math.sin(elapsedSec * 4 + bubble.id) * 0.03;
      slot.group.scale.set(bScale * wobble, bScale / wobble, bScale);

      const locked = snap?.lockedId === bubble.id;
      SCRATCH_COLOR.set(bubble.color);
      slot.mat.color.copy(SCRATCH_COLOR);
      slot.mat.emissive.copy(SCRATCH_COLOR);
      slot.mat.emissiveIntensity = locked ? 0.55 : 0.24;
      slot.ring.visible = locked;

      if (slot.badge) {
        slot.badge.sprite.position.set(
          SCRATCH_VEC3_A.x,
          SCRATCH_VEC3_A.y,
          SCRATCH_VEC3_A.z + 0.9,
        );
        wordSprites.updateLabel(slot.badge, {
          text: bubble.text,
          typedCount: bubble.typed,
          isActive: locked,
          accentHex: bubble.color || accentCss,
        });
      }
    }

    // 3. Consume pop bursts
    if (snap?.pendingBursts3D && snap.pendingBursts3D.length > 0) {
      const countPerPop = Math.max(6, Math.round(12 * ctx.preset.particleScale));
      while (snap.pendingBursts3D.length > 0) {
        const ev = snap.pendingBursts3D.shift()!;
        if (ctx.calmMode) continue;
        mapBubbleCoords(ev.xNorm, ev.yPx, fieldH, 0, SCRATCH_VEC3_A);
        SCRATCH_COLOR.set(ev.color);
        const colHex = SCRATCH_COLOR.getHex();
        for (let k = 0; k < countPerPop; k++) {
          const dp = droplets[dropletCursor];
          dropletCursor = (dropletCursor + 1) % maxDroplets;
          const ang = (Math.PI * 2 * k) / countPerPop + Math.random() * 0.4;
          const spd = 2.8 + Math.random() * 3.6;
          dp.active = true;
          dp.x = SCRATCH_VEC3_A.x;
          dp.y = SCRATCH_VEC3_A.y;
          dp.z = SCRATCH_VEC3_A.z;
          dp.vx = Math.cos(ang) * spd;
          dp.vy = Math.sin(ang) * spd + 0.8;
          dp.vz = (Math.random() - 0.5) * 2.5;
          dp.maxLife = 0.44;
          dp.life = dp.maxLife;
          dp.colorHex = colHex;
        }
      }
    }

    for (let i = 0; i < maxDroplets; i++) {
      const dp = droplets[i];
      if (!dp.active) continue;
      dp.life -= dtSec;
      if (dp.life <= 0) {
        dp.active = false;
        SCRATCH_VEC3_A.set(0, -40, 0);
        SCRATCH_QUAT.identity();
        SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        dropletInstanced.setMatrixAt(i, SCRATCH_MAT4);
        continue;
      }
      dp.x += dp.vx * dtSec;
      dp.y += dp.vy * dtSec;
      dp.z += dp.vz * dtSec;
      const frac = dp.life / dp.maxLife;
      SCRATCH_VEC3_A.set(dp.x, dp.y, dp.z);
      SCRATCH_QUAT.identity();
      SCRATCH_VEC3_B.set(frac, frac, frac);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      dropletInstanced.setMatrixAt(i, SCRATCH_MAT4);
      SCRATCH_COLOR.setHex(dp.colorHex);
      dropletInstanced.setColorAt(i, SCRATCH_COLOR);
    }
    dropletInstanced.instanceMatrix.needsUpdate = true;
    if (dropletInstanced.instanceColor) dropletInstanced.instanceColor.needsUpdate = true;

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
      externalState = (next as BubblePop3DState) ?? null;
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
