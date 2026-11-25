import * as THREE from 'three';
import {DETAIL_CONSTANTS} from '@/src/graphics/detail';
import {createSceneRenderPipeline} from '@/src/three/bloom';
import {
  createCappedLoop,
  createDetailLOD,
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
import {createPostPipeline, type ManagedPostPipeline} from '@/src/three/postPipeline';
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
  ring: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  ringMat: THREE.MeshBasicMaterial;
  badge: PooledWordLabel | null;
  inUse: boolean;
  assignedId: number;
  depthZ: number;
  usesTransmission: boolean;
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

const HERO_TRANSMISSION_LIMIT = 3;

function createUnderwaterCausticTexture(accentHex: number, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const accentCss = '#' + new THREE.Color(accentHex).getHexString();

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0f2347');
  grad.addColorStop(0.55, '#0b132b');
  grad.addColorStop(1, '#050918');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle volumetric light shafts behind glass bubbles so transmission shows clean refraction
  for (let i = 0; i < 6; i++) {
    const x = 60 + i * 78;
    const beamGrad = ctx.createLinearGradient(x - 24, 0, x + 28, canvas.height);
    beamGrad.addColorStop(0, i % 2 === 0 ? 'rgba(56, 189, 248, 0.22)' : accentCss + '30');
    beamGrad.addColorStop(0.65, 'rgba(34, 211, 238, 0.06)');
    beamGrad.addColorStop(1, 'rgba(5, 9, 24, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(x - 18, 0);
    ctx.lineTo(x + 22, 0);
    ctx.lineTo(x + 56, canvas.height);
    ctx.lineTo(x - 8, canvas.height);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
  return tex;
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
  const isRealistic = Boolean(ctx.preset.realistic || ctx.preset.mode === '3d-realistic');
  const consts = DETAIL_CONSTANTS.realistic;

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

  const width = Math.max(1, ctx.container.clientWidth);
  const height = Math.max(1, ctx.container.clientHeight);
  const baseFov = 48;
  const camera = new THREE.PerspectiveCamera(baseFov, width / height, 0.2, 160);
  const applyCameraFraming = (w: number, h: number) => {
    const distScale = fitPerspectiveCamera(camera, w, h, baseFov);
    camera.position.set(0, 0.25, -1 + 12.8 * distScale);
    camera.lookAt(0, 0.2, -1);
  };
  applyCameraFraming(width, height);

  // Studio-lit Deep Water Rig (<= 3 lights)
  const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, isRealistic ? 0.95 : 0.85);
  scene.add(hemi);

  const rimLight = new THREE.DirectionalLight(0xffffff, isRealistic ? 1.85 : 1.5);
  rimLight.position.set(8, 12, 10);
  scene.add(rimLight);

  const bottomGlow = new THREE.PointLight(0x22d3ee, isRealistic ? 2.4 : 2.0, 22, 1.5);
  bottomGlow.position.set(0, -3.5, 2);
  scene.add(bottomGlow);

  // Realistic Deep-Sea Caustic Backdrop Plane (widened for 32:9 ultrawide)
  let causticTex: THREE.CanvasTexture | null = null;
  if (isRealistic) {
    const maxAniso = renderer.capabilities.getMaxAnisotropy?.() ?? 4;
    causticTex = createUnderwaterCausticTexture(palette.accent, maxAniso);
    const backdropGeo = new THREE.PlaneGeometry(115, 30);
    const backdropMat = new THREE.MeshBasicMaterial({
      map: causticTex,
      fog: true,
      depthWrite: false,
    });
    const backdrop = new THREE.Mesh(backdropGeo, backdropMat);
    backdrop.position.set(0, 0.4, -10.5);
    scene.add(backdrop);
  }

  // Top Escape Danger Laser Bar (canonical play-zone bounds)
  const dangerGeo = new THREE.BoxGeometry(13.8, 0.06, 0.08);
  const dangerMat = new THREE.MeshStandardMaterial({
    color: 0xfb7185,
    emissive: 0xfb7185,
    emissiveIntensity: 1.4,
  });
  const dangerBar = new THREE.Mesh(dangerGeo, dangerMat);
  dangerBar.position.set(0, 2.95, 0);
  scene.add(dangerBar);

  // Rising Caustic Ambient Micro-Bubbles across Full Width
  const moteCount = ctx.preset.tier === 'low' ? 42 : isRealistic ? 128 : 84;
  const moteGeo = new THREE.SphereGeometry(0.065, isRealistic ? 14 : 8, isRealistic ? 10 : 6);
  const moteMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    roughness: 0.08,
    clearcoat: 1,
    iridescence: isRealistic ? 0.6 : 0,
    transparent: true,
    opacity: 0.46,
  });
  const moteInstanced = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
  moteInstanced.frustumCulled = false;
  const moteData = new Float32Array(moteCount * 4);
  for (let i = 0; i < moteCount; i++) {
    moteData[i * 4 + 0] = (((i * 61) % 100) / 100 - 0.5) * 52;
    moteData[i * 4 + 1] = (((i * 37) % 100) / 100 - 0.5) * 7.5;
    moteData[i * 4 + 2] = -8 + ((i * 19) % 10);
    moteData[i * 4 + 3] = 0.7 + (i % 5) * 0.28;
  }
  scene.add(moteInstanced);

  // Glossy Physical Bubble Pool + Sprite Labels
  const sphereGeo = isRealistic
    ? new THREE.SphereGeometry(
        0.68,
        consts.sphereSegments,
        Math.round(consts.sphereSegments * 0.75),
      )
    : new THREE.SphereGeometry(0.68, 22, 16);
  const farSphereGeo = isRealistic ? new THREE.SphereGeometry(0.68, 24, 18) : null;
  const ringGeo = isRealistic
    ? new THREE.TorusGeometry(0.78, 0.04, 14, consts.sphereSegments)
    : new THREE.TorusGeometry(0.78, 0.04, 8, 26);

  const wordSprites = new WordSpritePool(12, 24);
  const bubblePool: BubbleVisual[] = Array.from({length: 12}, (_, idx) => {
    const group = new THREE.Group();
    group.visible = false;

    const usesTransmission = isRealistic && idx < HERO_TRANSMISSION_LIMIT;
    const mat = usesTransmission
      ? new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          emissive: 0x22d3ee,
          emissiveIntensity: 0.16,
          roughness: 0.04,
          metalness: 0.0,
          transmission: 0.88,
          thickness: 0.48,
          ior: 1.38,
          attenuationColor: new THREE.Color(0x38bdf8),
          attenuationDistance: 1.8,
          iridescence: 0.9,
          iridescenceIOR: 1.33,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x22d3ee,
          emissive: 0x22d3ee,
          emissiveIntensity: 0.24,
          roughness: isRealistic ? 0.04 : 0.06,
          metalness: isRealistic ? 0.1 : 0.14,
          clearcoat: 1.0,
          clearcoatRoughness: isRealistic ? 0.03 : 0.05,
          iridescence: isRealistic ? 0.88 : 0,
          iridescenceIOR: 1.33,
          transparent: true,
          opacity: isRealistic ? 0.64 : 0.76,
        });

    if (isRealistic && farSphereGeo) {
      const highSphere = new THREE.Mesh(sphereGeo, mat);
      const farSphere = new THREE.Mesh(farSphereGeo, mat);
      const lod = createDetailLOD([
        {object: highSphere, distance: 0},
        {object: farSphere, distance: 14},
      ]);
      group.add(lod);
    } else {
      const sphere = new THREE.Mesh(sphereGeo, mat);
      group.add(sphere);
    }

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
      ring,
      mat,
      ringMat,
      badge: null,
      inUse: false,
      assignedId: -1,
      depthZ: ((idx % 3) - 1) * 1.15 - 0.5,
      usesTransmission,
    };
  });

  // Pooled Pop Particle Burst Spheres
  const maxDroplets = Math.max(24, Math.round(72 * ctx.preset.particleScale));
  const dropletGeo = new THREE.SphereGeometry(0.09, isRealistic ? 12 : 6, isRealistic ? 8 : 6);
  const dropletMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0x1e293b,
        emissiveIntensity: 0.35,
        roughness: 0.1,
        clearcoat: 1.0,
      })
    : new THREE.MeshBasicMaterial({color: 0xffffff});
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

  let legacyPipeline: ReturnType<typeof createSceneRenderPipeline> | null = null;
  let realisticPost: ManagedPostPipeline | null = null;

  if (isRealistic) {
    if (ctx.preset.postEffects) {
      realisticPost = createPostPipeline(renderer, scene, camera, {
        width,
        height,
        pixelRatio: managed.pixelRatio,
        multisampleSamples: ctx.preset.multisampleSamples,
        enableBloom: true,
        enableVignette: true,
      });
    }
  } else {
    legacyPipeline = createSceneRenderPipeline(renderer, scene, camera, ctx.preset, ctx.probe, {
      strength: 0.34,
      radius: 0.36,
      threshold: 0.84,
    });
  }

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
      if (slot.usesTransmission) {
        slot.mat.attenuationColor.copy(SCRATCH_COLOR);
        slot.mat.emissive.copy(SCRATCH_COLOR);
        slot.mat.emissiveIntensity = locked ? 0.35 : 0.14;
      } else {
        slot.mat.color.copy(SCRATCH_COLOR);
        slot.mat.emissive.copy(SCRATCH_COLOR);
        slot.mat.emissiveIntensity = locked ? 0.55 : 0.24;
      }
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

    if (realisticPost) {
      realisticPost.render(dtSec);
    } else if (legacyPipeline) {
      legacyPipeline.render();
    } else {
      renderer.render(scene, camera);
    }
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
    resize(w: number, h: number) {
      managed.resize(w, h, camera, baseFov);
      applyCameraFraming(w, h);
      legacyPipeline?.resize(w, h);
      realisticPost?.setSize(w, h, managed.pixelRatio);
    },
    dispose() {
      loop.stop();
      wordSprites.dispose();
      if (legacyPipeline) {
        legacyPipeline.dispose();
        legacyPipeline = null;
      }
      if (realisticPost) {
        realisticPost.dispose();
        realisticPost = null;
      }
      if (causticTex) {
        causticTex.dispose();
        causticTex = null;
      }
      managed.dispose();
    },
  };
}
