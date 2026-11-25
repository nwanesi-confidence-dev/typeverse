import * as THREE from 'three';
import {DETAIL_CONSTANTS, REALISTIC_VISUAL_TUNING} from '@/src/graphics/detail';
import {graphicsModeService} from '@/src/graphics/graphicsModeService';
import {createSceneRenderPipeline} from '@/src/three/bloom';
import {
  createCappedLoop,
  createDetailLOD,
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
import {createPostPipeline, type ManagedPostPipeline} from '@/src/three/postPipeline';
import {
  acquireSessionPbrTextures,
  releaseSessionPbrTextures,
} from '@/src/three/proceduralTextures';
import type {LazyThreeMountContext, LazyThreeSceneHandle} from '@/src/three/ThreeCanvasHost';

export interface TurboRacerRivalSnapshot {
  name: string;
  color: string;
  dist: number;
  lane: number;
}

export interface TurboRacerMutableSnapshot {
  paused: boolean;
  finished: boolean;
  started: boolean;
  playerDist: number;
  boostTimer: number;
  rank: number;
  score: number;
  wordIdx: number;
  rivals: TurboRacerRivalSnapshot[];
}

export interface TurboRacer3DState {
  raceRef: {current: TurboRacerMutableSnapshot};
  getLiveWpm: () => number;
  totalWords: number;
}

interface BoostSpark {
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

const TRACK_WORLD_LENGTH = 650; // 1000 race units -> 650 world meters along -Z
const LANE_X = [-5.1, -1.7, 1.7, 5.1] as const;

function createCheckerFinishTexture(accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070B18';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cols = 16;
  const rows = 4;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dark = (r + c) % 2 === 0;
      ctx.fillStyle = dark ? '#0F172A' : '#F8FAFC';
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
    }
  }

  ctx.fillStyle = 'rgba(7, 11, 24, 0.72)';
  ctx.fillRect(110, 26, 292, 76);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(110, 26, 292, 76);

  ctx.fillStyle = accentHex;
  ctx.font = '800 42px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', canvas.width / 2, canvas.height / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.78)');
  grad.addColorStop(0.6, 'rgba(2, 6, 23, 0.32)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface CarGeometries {
  chassis: THREE.BufferGeometry;
  farChassis: THREE.BufferGeometry;
  nose: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  farCanopy: THREE.BufferGeometry;
  spoilerWing: THREE.BufferGeometry;
  spoilerStrut: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  farWheel: THREE.BufferGeometry;
  wheelRim: THREE.BufferGeometry | null;
  exhaustPipe: THREE.BufferGeometry | null;
  exhaustCore: THREE.BufferGeometry | null;
  headlight: THREE.BufferGeometry;
  taillight: THREE.BufferGeometry;
  shadowPlane: THREE.BufferGeometry;
}

interface BuiltCar {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  taillightMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshPhysicalMaterial;
  exhaustGlowMat: THREE.MeshStandardMaterial | null;
  shadowMat: THREE.MeshBasicMaterial;
}

function createCarBodyGeometry(bevelSegments: number, computeSmooth: boolean): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  profile.moveTo(-2.1, 0.2);
  profile.lineTo(1.95, 0.16);
  profile.lineTo(2.2, 0.34);
  profile.lineTo(1.3, 0.58);
  profile.lineTo(-1.35, 0.68);
  profile.lineTo(-2.15, 0.56);
  profile.closePath();

  const geo = new THREE.ExtrudeGeometry(profile, {
    depth: 1.56,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments,
    curveSegments: computeSmooth ? 12 : 6,
  });
  geo.center();
  // Rotate so length aligns along -Z (front = -Z, rear = +Z)
  geo.rotateY(Math.PI / 2);
  if (computeSmooth) {
    geo.computeVertexNormals();
  }
  return geo;
}

function createRealisticCanopyGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.88, 0);
  shape.lineTo(0.84, 0);
  shape.lineTo(0.46, 0.34);
  shape.lineTo(-0.42, 0.34);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.06,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geo.center();
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createSharedCarGeometries(isRealistic: boolean): CarGeometries {
  const chassis = createCarBodyGeometry(
    isRealistic ? DETAIL_CONSTANTS.realistic.carBevelSegments : 2,
    isRealistic,
  );
  const farChassis = isRealistic
    ? createCarBodyGeometry(DETAIL_CONSTANTS.light.carBevelSegments, false)
    : chassis;

  const nose = new THREE.BoxGeometry(1.42, 0.14, 0.42);
  const farCanopy = new THREE.BoxGeometry(1.18, 0.36, 1.82);
  const canopy = isRealistic ? createRealisticCanopyGeometry() : farCanopy;

  const spoilerWing = new THREE.BoxGeometry(1.66, 0.07, 0.36);
  const spoilerStrut = new THREE.BoxGeometry(0.08, 0.28, 0.18);

  const farWheel = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 16);
  farWheel.rotateZ(Math.PI / 2);

  const wheel = isRealistic
    ? new THREE.CylinderGeometry(0.32, 0.32, 0.28, 48)
    : farWheel;
  if (isRealistic) {
    wheel.rotateZ(Math.PI / 2);
  }

  let wheelRim: THREE.BufferGeometry | null = null;
  let exhaustPipe: THREE.BufferGeometry | null = null;
  let exhaustCore: THREE.BufferGeometry | null = null;
  if (isRealistic) {
    wheelRim = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 28);
    wheelRim.rotateZ(Math.PI / 2);

    exhaustPipe = new THREE.CylinderGeometry(0.085, 0.095, 0.24, 18);
    exhaustPipe.rotateX(Math.PI / 2);

    exhaustCore = new THREE.CylinderGeometry(0.058, 0.058, 0.06, 14);
    exhaustCore.rotateX(Math.PI / 2);
  }

  const headlight = new THREE.BoxGeometry(0.34, 0.09, 0.08);
  const taillight = new THREE.BoxGeometry(1.42, 0.1, 0.08);
  const shadowPlane = new THREE.PlaneGeometry(2.6, 5.2);
  shadowPlane.rotateX(-Math.PI / 2);

  return {
    chassis,
    farChassis,
    nose,
    canopy,
    farCanopy,
    spoilerWing,
    spoilerStrut,
    wheel,
    farWheel,
    wheelRim,
    exhaustPipe,
    exhaustCore,
    headlight,
    taillight,
    shadowPlane,
  };
}

function buildCompositeCar(
  geos: CarGeometries,
  accentColorHex: number,
  isPlayer: boolean,
  shadowTexture: THREE.Texture,
  castShadow: boolean,
  isRealistic: boolean,
  enableLod: boolean,
): BuiltCar {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: accentColorHex,
    metalness: isRealistic ? 0.72 : 0.58,
    roughness: isRealistic ? 0.2 : 0.22,
    clearcoat: isRealistic ? 1.0 : 0.9,
    clearcoatRoughness: isRealistic ? 0.07 : 0.12,
    emissive: accentColorHex,
    emissiveIntensity: isPlayer ? 0.22 : 0.12,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: isRealistic ? 0.45 : 0.35,
    roughness: isRealistic ? 0.52 : 0.65,
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x091020,
    metalness: isRealistic ? 0.28 : 0.2,
    roughness: isRealistic ? 0.06 : 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    emissive: accentColorHex,
    emissiveIntensity: 0.06,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.1,
    roughness: 0.86,
  });

  const rimMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.18,
        clearcoat: 0.7,
      })
    : null;

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x22d3ee : 0xfb7185,
    emissive: isPlayer ? 0x22d3ee : 0xfb7185,
    emissiveIntensity: isPlayer ? 1.5 : 1.25,
    roughness: 0.2,
  });

  const exhaustGlowMat = isRealistic
    ? new THREE.MeshStandardMaterial({
        color: isPlayer ? 0x38bdf8 : 0xfb7185,
        emissive: isPlayer ? 0x22d3ee : 0xf43f5e,
        emissiveIntensity: 0.65,
        roughness: 0.25,
      })
    : null;

  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: isRealistic ? 0.82 : 0.72,
    depthWrite: false,
  });

  const shadowMesh = new THREE.Mesh(geos.shadowPlane, shadowMat);
  shadowMesh.position.set(0, isRealistic ? 0.038 : 0.02, 0);
  group.add(shadowMesh);

  const wheels: THREE.Object3D[] = [];
  const wheelCoords: [number, number, number][] = [
    [-0.86, 0.32, -1.32],
    [0.86, 0.32, -1.32],
    [-0.86, 0.32, 1.32],
    [0.86, 0.32, 1.32],
  ];

  const assembleChassisDetail = (highDetail: boolean): THREE.Group => {
    const partGroup = new THREE.Group();

    const hull = new THREE.Mesh(highDetail ? geos.chassis : geos.farChassis, bodyMat);
    hull.position.set(0, 0.44, 0);
    hull.castShadow = castShadow;
    hull.receiveShadow = castShadow;
    partGroup.add(hull);

    const splitter = new THREE.Mesh(geos.nose, darkTrimMat);
    splitter.position.set(0, 0.22, -2.06);
    partGroup.add(splitter);

    const cockpit = new THREE.Mesh(highDetail ? geos.canopy : geos.farCanopy, canopyMat);
    cockpit.position.set(0, 0.78, 0.06);
    cockpit.castShadow = castShadow;
    partGroup.add(cockpit);

    const wing = new THREE.Mesh(geos.spoilerWing, darkTrimMat);
    wing.position.set(0, 0.96, 1.88);
    wing.castShadow = castShadow;
    partGroup.add(wing);

    const strutL = new THREE.Mesh(geos.spoilerStrut, bodyMat);
    strutL.position.set(-0.56, 0.81, 1.88);
    partGroup.add(strutL);

    const strutR = new THREE.Mesh(geos.spoilerStrut, bodyMat);
    strutR.position.set(0.56, 0.81, 1.88);
    partGroup.add(strutR);

    const headL = new THREE.Mesh(geos.headlight, headlightMat);
    headL.position.set(-0.54, 0.42, -2.14);
    partGroup.add(headL);

    const headR = new THREE.Mesh(geos.headlight, headlightMat);
    headR.position.set(0.54, 0.42, -2.14);
    partGroup.add(headR);

    const tailBar = new THREE.Mesh(geos.taillight, taillightMat);
    tailBar.position.set(0, 0.56, 2.15);
    partGroup.add(tailBar);

    if (
      highDetail &&
      isRealistic &&
      geos.exhaustPipe &&
      geos.exhaustCore &&
      exhaustGlowMat
    ) {
      for (const ex of [-0.42, 0.42]) {
        const pipe = new THREE.Mesh(geos.exhaustPipe, darkTrimMat);
        pipe.position.set(ex, 0.3, 2.16);
        partGroup.add(pipe);

        const core = new THREE.Mesh(geos.exhaustCore, exhaustGlowMat);
        core.position.set(ex, 0.3, 2.26);
        partGroup.add(core);
      }
    }

    for (const [wx, wy, wz] of wheelCoords) {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(wx, wy, wz);
      const tireMesh = new THREE.Mesh(highDetail ? geos.wheel : geos.farWheel, tireMat);
      tireMesh.castShadow = castShadow;
      wheelPivot.add(tireMesh);

      if (highDetail && isRealistic && geos.wheelRim && rimMat) {
        const rimMesh = new THREE.Mesh(geos.wheelRim, rimMat);
        wheelPivot.add(rimMesh);
      }
      partGroup.add(wheelPivot);
      wheels.push(wheelPivot);
    }

    return partGroup;
  };

  if (isRealistic && enableLod) {
    const lod = createDetailLOD([
      {object: assembleChassisDetail(true), distance: 0},
      {object: assembleChassisDetail(false), distance: 36},
    ]);
    group.add(lod);
  } else {
    group.add(assembleChassisDetail(true));
  }

  return {group, wheels, taillightMat, bodyMat, exhaustGlowMat, shadowMat};
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

  const skyColor = palette.isDark ? palette.bg : 0x0a1024;
  scene.background = new THREE.Color(skyColor);
  if (ctx.preset.fog) {
    const fogFar = (isRealistic ? 185 : 160) * ctx.preset.drawDistanceScale;
    scene.fog = new THREE.Fog(skyColor, 34, Math.max(105, fogFar));
  }

  const width = Math.max(1, ctx.container.clientWidth);
  const height = Math.max(1, ctx.container.clientHeight);
  const baseFov = 54;
  const camera = new THREE.PerspectiveCamera(baseFov, width / height, 0.2, 360);
  let camDistScale = fitPerspectiveCamera(camera, width, height, baseFov);

  // Studio + Cyber Highway 3-Light Rig (strictly <= 3 dynamic lights)
  const hemi = new THREE.HemisphereLight(0xbae6fd, 0x090d1f, isRealistic ? 0.8 : 0.72);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xfff1e6, isRealistic ? 1.85 : 1.45);
  dirLight.position.set(18, 28, 16);
  if (ctx.preset.shadows) {
    dirLight.castShadow = true;
    const shadowSize = isRealistic ? REALISTIC_VISUAL_TUNING.shadowMapSize : 1024;
    dirLight.shadow.mapSize.set(shadowSize, shadowSize);
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 90;
    const extent = isRealistic ? 16 : 22;
    dirLight.shadow.camera.left = -extent;
    dirLight.shadow.camera.right = extent;
    dirLight.shadow.camera.top = isRealistic ? 18 : 24;
    dirLight.shadow.camera.bottom = isRealistic ? -18 : -24;
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = isRealistic ? 0.025 : 0.02;
    scene.add(dirLight.target);
  }
  scene.add(dirLight);

  const playerHeadGlow = new THREE.PointLight(
    palette.accent,
    isRealistic ? 3.4 : 2.8,
    isRealistic ? 38 : 32,
    1.5,
  );
  scene.add(playerHeadGlow);

  // 1. Cyber Terrain Floor & Neon Highway Deck
  const terrainGeo = new THREE.PlaneGeometry(420, TRACK_WORLD_LENGTH + 180);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x050814,
    roughness: 0.9,
    metalness: 0.15,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.set(0, -0.14, -TRACK_WORLD_LENGTH / 2 + 20);
  scene.add(terrain);

  const roadGeo = isRealistic
    ? new THREE.PlaneGeometry(15.2, TRACK_WORLD_LENGTH + 140, 12, consts.roadSubdivisions)
    : new THREE.PlaneGeometry(15.2, TRACK_WORLD_LENGTH + 140);
  roadGeo.rotateX(-Math.PI / 2);

  if (isRealistic) {
    // Subtle realistic highway crown camber + tiled UVs without mutating shared PBR texture repeat
    const pos = roadGeo.attributes.position as THREE.BufferAttribute;
    const uv = roadGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const normX = px / 7.6;
      pos.setY(i, (1 - normX * normX) * 0.032);
      uv.setXY(i, uv.getX(i), uv.getY(i) * 86);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    roadGeo.computeVertexNormals();
  }

  const roadMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: 0x0d152a,
        roughness: 0.56,
        metalness: 0.2,
        clearcoat: 0.24,
        clearcoatRoughness: 0.36,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x0d152a,
        roughness: 0.52,
        metalness: 0.35,
      });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.position.set(0, 0, -TRACK_WORLD_LENGTH / 2 + 20);
  road.receiveShadow = ctx.preset.shadows;
  scene.add(road);

  // Glowing side barrier curbs
  const curbGeo = new THREE.BoxGeometry(0.45, 0.28, TRACK_WORLD_LENGTH + 140);
  const curbMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: 0x16223f,
        emissive: palette.accent,
        emissiveIntensity: 0.62,
        roughness: 0.24,
        metalness: 0.78,
        clearcoat: 0.65,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x16223f,
        emissive: palette.accent,
        emissiveIntensity: 0.55,
        roughness: 0.3,
        metalness: 0.65,
      });
  const curbL = new THREE.Mesh(curbGeo, curbMat);
  curbL.position.set(-7.82, 0.14, -TRACK_WORLD_LENGTH / 2 + 20);
  scene.add(curbL);
  const curbR = new THREE.Mesh(curbGeo, curbMat);
  curbR.position.set(7.82, 0.14, -TRACK_WORLD_LENGTH / 2 + 20);
  scene.add(curbR);

  // 2. InstancedMesh #1: Pooled Wrapping Lane Dashes (1 draw call for entire track)
  const dashPerLane = 24;
  const dashTotal = dashPerLane * 3;
  const dashGeo = new THREE.BoxGeometry(0.18, 0.025, 4.2);
  const dashMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0x64748b,
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  const dashInstanced = new THREE.InstancedMesh(dashGeo, dashMat, dashTotal);
  dashInstanced.frustumCulled = false;
  scene.add(dashInstanced);

  const dashSpacing = 12;
  const dashCycleLen = dashPerLane * dashSpacing;
  const dashLaneXs = [-3.4, 0, 3.4];

  // 3. InstancedMesh #2: Roadside Neon Pylons (+ Metallic Beacon Caps in Realistic)
  const pylonPairCount = ctx.preset.tier === 'low' ? 38 : 64;
  const pylonTotal = pylonPairCount * 2;
  const pylonGeo = new THREE.BoxGeometry(0.32, 4.2, 0.32);
  const pylonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: palette.accent,
    emissiveIntensity: isRealistic ? 0.92 : 0.85,
    roughness: 0.25,
    metalness: 0.7,
  });
  const pylonInstanced = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonTotal);

  let pylonBeaconInstanced: THREE.InstancedMesh | null = null;
  if (isRealistic) {
    const beaconGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.28, 16);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: palette.accent,
      emissiveIntensity: 1.4,
      roughness: 0.18,
      metalness: 0.85,
    });
    pylonBeaconInstanced = new THREE.InstancedMesh(beaconGeo, beaconMat, pylonTotal);
  }

  for (let i = 0; i < pylonPairCount; i++) {
    const z = 12 - (i / pylonPairCount) * (TRACK_WORLD_LENGTH + 30);
    const colHex = i % 2 === 0 ? palette.accent : 0xa78bfa;
    SCRATCH_COLOR.setHex(colHex);

    SCRATCH_VEC3_A.set(-8.6, 2.0, z);
    SCRATCH_QUAT.identity();
    SCRATCH_VEC3_B.set(1, 1, 1);
    SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
    pylonInstanced.setMatrixAt(i * 2, SCRATCH_MAT4);
    pylonInstanced.setColorAt(i * 2, SCRATCH_COLOR);

    if (pylonBeaconInstanced) {
      SCRATCH_VEC3_A.set(-8.6, 4.2, z);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      pylonBeaconInstanced.setMatrixAt(i * 2, SCRATCH_MAT4);
      pylonBeaconInstanced.setColorAt(i * 2, SCRATCH_COLOR);
    }

    SCRATCH_VEC3_A.set(8.6, 2.0, z);
    SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
    pylonInstanced.setMatrixAt(i * 2 + 1, SCRATCH_MAT4);
    pylonInstanced.setColorAt(i * 2 + 1, SCRATCH_COLOR);

    if (pylonBeaconInstanced) {
      SCRATCH_VEC3_A.set(8.6, 4.2, z);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      pylonBeaconInstanced.setMatrixAt(i * 2 + 1, SCRATCH_MAT4);
      pylonBeaconInstanced.setColorAt(i * 2 + 1, SCRATCH_COLOR);
    }
  }
  pylonInstanced.instanceMatrix.needsUpdate = true;
  if (pylonInstanced.instanceColor) pylonInstanced.instanceColor.needsUpdate = true;
  pylonInstanced.computeBoundingSphere();
  scene.add(pylonInstanced);
  if (pylonBeaconInstanced) {
    pylonBeaconInstanced.instanceMatrix.needsUpdate = true;
    if (pylonBeaconInstanced.instanceColor) pylonBeaconInstanced.instanceColor.needsUpdate = true;
    pylonBeaconInstanced.computeBoundingSphere();
    scene.add(pylonBeaconInstanced);
  }

  // 4. InstancedMesh #3: Cyber Skyline Towers (+ Lit Rooftop Crown Bars in Realistic)
  const towerCount = ctx.preset.tier === 'low' ? 44 : isRealistic ? 96 : 84;
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x0f1a36,
    emissive: 0x1e293b,
    emissiveIntensity: 0.3,
    roughness: isRealistic ? 0.42 : 0.6,
    metalness: isRealistic ? 0.68 : 0.5,
  });
  const towerInstanced = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);

  let towerCrownInstanced: THREE.InstancedMesh | null = null;
  if (isRealistic) {
    const crownGeo = new THREE.BoxGeometry(1, 0.25, 1);
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: palette.accent,
      emissiveIntensity: 1.1,
      roughness: 0.25,
    });
    towerCrownInstanced = new THREE.InstancedMesh(crownGeo, crownMat, towerCount);
  }

  for (let i = 0; i < towerCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const distOut = 15 + ((i * 37) % 62);
    const z = 20 - (i / towerCount) * (TRACK_WORLD_LENGTH + 90);
    const h = 6 + ((i * 19) % 24);
    const w = 2.4 + ((i * 7) % 4);
    SCRATCH_VEC3_A.set(side * distOut, h * 0.5 - 0.14, z);
    SCRATCH_QUAT.identity();
    SCRATCH_VEC3_B.set(w, h, w);
    SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
    towerInstanced.setMatrixAt(i, SCRATCH_MAT4);

    SCRATCH_COLOR.setHex(i % 5 === 0 ? 0x164e63 : i % 3 === 0 ? 0x1e1b4b : 0x0f172a);
    towerInstanced.setColorAt(i, SCRATCH_COLOR);

    if (towerCrownInstanced) {
      SCRATCH_VEC3_A.set(side * distOut, h - 0.08, z);
      SCRATCH_VEC3_B.set(w * 0.88, 1, w * 0.88);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      towerCrownInstanced.setMatrixAt(i, SCRATCH_MAT4);
      SCRATCH_COLOR.setHex(i % 2 === 0 ? palette.accent : 0x38bdf8);
      towerCrownInstanced.setColorAt(i, SCRATCH_COLOR);
    }
  }
  towerInstanced.instanceMatrix.needsUpdate = true;
  if (towerInstanced.instanceColor) towerInstanced.instanceColor.needsUpdate = true;
  towerInstanced.computeBoundingSphere();
  scene.add(towerInstanced);
  if (towerCrownInstanced) {
    towerCrownInstanced.instanceMatrix.needsUpdate = true;
    if (towerCrownInstanced.instanceColor) towerCrownInstanced.instanceColor.needsUpdate = true;
    towerCrownInstanced.computeBoundingSphere();
    scene.add(towerCrownInstanced);
  }

  // 5. Holographic Finish Gate at z = -TRACK_WORLD_LENGTH
  const finishGroup = new THREE.Group();
  finishGroup.position.set(0, 0, -TRACK_WORLD_LENGTH);
  const gatePillarGeo = isRealistic
    ? new THREE.CylinderGeometry(0.45, 0.56, 6.9, 24)
    : new THREE.BoxGeometry(0.9, 6.8, 0.9);
  const gatePillarMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: palette.accent,
    emissiveIntensity: 0.65,
    metalness: 0.78,
    roughness: 0.22,
  });
  const gatePillarL = new THREE.Mesh(gatePillarGeo, gatePillarMat);
  gatePillarL.position.set(-8.1, 3.4, 0);
  gatePillarL.castShadow = isRealistic && ctx.preset.shadows;
  finishGroup.add(gatePillarL);
  const gatePillarR = new THREE.Mesh(gatePillarGeo, gatePillarMat);
  gatePillarR.position.set(8.1, 3.4, 0);
  gatePillarR.castShadow = isRealistic && ctx.preset.shadows;
  finishGroup.add(gatePillarR);

  if (isRealistic) {
    const trussGeo = new THREE.BoxGeometry(17.2, 0.35, 0.72);
    const truss = new THREE.Mesh(trussGeo, gatePillarMat);
    truss.position.set(0, 6.95, 0);
    finishGroup.add(truss);
  }

  const accentCss = '#' + new THREE.Color(palette.accent).getHexString();
  const finishTex = createCheckerFinishTexture(accentCss);
  finishTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const bannerGeo = new THREE.BoxGeometry(16.6, 2.4, 0.42);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: finishTex,
    emissiveMap: finishTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(0, 5.7, 0);
  finishGroup.add(banner);

  // Ground finish stripe
  const stripeGeo = new THREE.PlaneGeometry(15.2, 2.2);
  stripeGeo.rotateX(-Math.PI / 2);
  const stripeMat = new THREE.MeshBasicMaterial({
    map: finishTex,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const finishStripe = new THREE.Mesh(stripeGeo, stripeMat);
  finishStripe.position.set(0, 0.04, 0);
  finishGroup.add(finishStripe);
  scene.add(finishGroup);

  // 6. Composite Player & 3 Rival Cars + Pooled Nameplate Sprites
  const carGeos = createSharedCarGeometries(isRealistic);
  const shadowTex = createContactShadowTexture();
  const wordSprites = new WordSpritePool(8, 12);

  const playerCar = buildCompositeCar(
    carGeos,
    palette.accent,
    true,
    shadowTex,
    ctx.preset.shadows,
    isRealistic,
    false,
  );
  playerCar.group.position.set(LANE_X[2], 0, 0);
  scene.add(playerCar.group);

  const playerBadge: PooledWordLabel = wordSprites.acquire(playerCar.group);
  playerBadge.sprite.position.set(0, 1.8, 0);
  playerBadge.sprite.scale.set(2.4, 0.6, 1);
  wordSprites.updateLabel(playerBadge, {
    text: 'YOU',
    typedCount: 3,
    isActive: true,
    accentHex: accentCss,
  });

  const rivalColors = [0xf472b6, 0xfbbf24, 0xa78bfa];
  const rivalNames = ['BOLT', 'NOVA', 'APEX'];
  const rivalLanes = [0, 1, 3];
  const rivalCars: BuiltCar[] = rivalColors.map((col, idx) => {
    const built = buildCompositeCar(
      carGeos,
      col,
      false,
      shadowTex,
      ctx.preset.shadows,
      isRealistic,
      true,
    );
    built.group.position.set(LANE_X[rivalLanes[idx]], 0, 0);
    scene.add(built.group);

    const badge = wordSprites.acquire(built.group);
    badge.sprite.position.set(0, 1.75, 0);
    badge.sprite.scale.set(2.15, 0.54, 1);
    wordSprites.updateLabel(badge, {
      text: rivalNames[idx],
      typedCount: 0,
      isActive: false,
      accentHex: '#' + new THREE.Color(col).getHexString(),
    });
    return built;
  });

  // 7. InstancedMesh #4: Pooled Boost Sparks behind player car
  const maxSparks = Math.max(16, Math.round(56 * ctx.preset.particleScale));
  const sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
  const sparkMat = new THREE.MeshBasicMaterial({color: 0xffffff});
  const sparkInstanced = new THREE.InstancedMesh(sparkGeo, sparkMat, maxSparks);
  sparkInstanced.frustumCulled = false;
  scene.add(sparkInstanced);

  const sparks: BoostSpark[] = Array.from({length: maxSparks}, (_, idx) => {
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
      y: -20,
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
  let sparkCursor = 0;

  let disposed = false;
  let acquiredPbrSize: 512 | 1024 | null = null;
  if (isRealistic) {
    void acquireSessionPbrTextures(renderer, 1024).then((pbr) => {
      if (disposed) {
        releaseSessionPbrTextures(pbr.sizeTier);
        return;
      }
      acquiredPbrSize = pbr.sizeTier;

      roadMat.color.setHex(0xd8e4f5);
      roadMat.map = pbr.asphaltMap;
      roadMat.normalMap = pbr.asphaltNormal;
      roadMat.normalScale.set(0.85, 0.85);
      roadMat.roughnessMap = pbr.asphaltRoughness;
      roadMat.needsUpdate = true;

      for (const car of [playerCar, ...rivalCars]) {
        car.bodyMat.normalMap = pbr.metalNormal;
        car.bodyMat.normalScale.set(0.18, 0.18);
        car.bodyMat.roughnessMap = pbr.metalRoughness;
        car.bodyMat.needsUpdate = true;

        car.shadowMat.map = pbr.contactShadowBlob;
        car.shadowMat.needsUpdate = true;
      }
    });
  }

  let externalState: TurboRacer3DState | null = null;
  let smoothedPlayerZ = 0;
  const smoothedRivalZ = [0, 0, 0];
  let wheelAngle = 0;
  let camPosZ = 10.5;
  let camPosX = LANE_X[2] * 0.45;
  let currentFov = baseFov;
  let spawnAccum = 0;

  // Initialize lane dashes immediately for frame 0
  const updateLaneDashes = (anchorZ: number) => {
    const baseStart = Math.floor(-anchorZ / dashSpacing) * dashSpacing;
    let instanceIdx = 0;
    for (let l = 0; l < dashLaneXs.length; l++) {
      const lx = dashLaneXs[l];
      for (let d = 0; d < dashPerLane; d++) {
        const dz = -(baseStart + (d - 2) * dashSpacing);
        const wrappedZ = Math.max(-TRACK_WORLD_LENGTH, Math.min(20, dz));
        SCRATCH_VEC3_A.set(lx, 0.042, wrappedZ);
        SCRATCH_QUAT.identity();
        SCRATCH_VEC3_B.set(1, 1, 1);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        dashInstanced.setMatrixAt(instanceIdx++, SCRATCH_MAT4);
      }
    }
    void dashCycleLen;
    dashInstanced.instanceMatrix.needsUpdate = true;
  };
  updateLaneDashes(0);

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
        enableSpeedStreaks:
          graphicsModeService.getSnapshot().persistedState.realisticOptions.speedStreaks,
      });
    }
  } else {
    legacyPipeline = createSceneRenderPipeline(renderer, scene, camera, ctx.preset, ctx.probe, {
      strength: 0.34,
      radius: 0.32,
      threshold: 0.85,
    });
  }

  if (!ctx.probe.isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  const renderFrame = (dtSec: number, elapsedSec: number) => {
    const snap = externalState?.raceRef.current;
    const liveWpm = externalState ? externalState.getLiveWpm() : 0;

    const targetPlayerZ = snap ? -(snap.playerDist / 1000) * TRACK_WORLD_LENGTH : 0;
    const dampFast = 1 - Math.exp(-12 * dtSec);
    smoothedPlayerZ += (targetPlayerZ - smoothedPlayerZ) * dampFast;

    const prevPlayerZ = playerCar.group.position.z;
    const instVel = Math.max(0, (prevPlayerZ - smoothedPlayerZ) / Math.max(0.001, dtSec));
    const speedFactor = snap?.started && !snap.paused ? Math.max(instVel, (liveWpm / 60) * 18) : 0;

    // Position player car & subtle boost pitch/glow
    const boost = snap?.boostTimer ?? 0;
    const bodyHover = ctx.calmMode || !snap?.started || snap.paused ? 0 : Math.sin(elapsedSec * 9) * 0.015;
    playerCar.group.position.set(LANE_X[2], bodyHover, smoothedPlayerZ);
    playerCar.group.rotation.x = ctx.calmMode ? 0 : Math.min(0.055, boost * 0.11);
    playerCar.taillightMat.emissiveIntensity = 1.4 + boost * 3.0;
    if (playerCar.exhaustGlowMat) {
      playerCar.exhaustGlowMat.emissiveIntensity = 0.65 + boost * 3.8 + Math.min(1.2, liveWpm * 0.01);
    }

    wheelAngle -= speedFactor * dtSec * 1.45;
    for (const w of playerCar.wheels) {
      w.rotation.x = wheelAngle;
    }

    // Update rival cars
    if (snap) {
      for (let i = 0; i < Math.min(3, snap.rivals.length); i++) {
        const rival = snap.rivals[i];
        const targetRZ = -(rival.dist / 1000) * TRACK_WORLD_LENGTH;
        smoothedRivalZ[i] += (targetRZ - smoothedRivalZ[i]) * dampFast;
        const laneX = LANE_X[rival.lane] ?? LANE_X[i];
        rivalCars[i].group.position.set(laneX, 0, smoothedRivalZ[i]);
        const rVel = snap.started && !snap.paused ? 16 : 0;
        for (const w of rivalCars[i].wheels) {
          w.rotation.x -= rVel * dtSec * 1.45;
        }
      }
    }

    // Update light tracking player car
    playerHeadGlow.position.set(LANE_X[2], 1.4, smoothedPlayerZ - 2.6);
    if (ctx.preset.shadows) {
      dirLight.position.set(18, 28, smoothedPlayerZ + 16);
      dirLight.target.position.set(0, 0, smoothedPlayerZ - 10);
      dirLight.target.updateMatrixWorld();
    }

    // Update lane dashes around playerZ
    updateLaneDashes(smoothedPlayerZ);

    // Pooled boost sparks
    if (!ctx.calmMode && snap?.started && !snap.paused && boost > 0.02) {
      spawnAccum += dtSec * 65 * ctx.preset.particleScale;
      while (spawnAccum >= 1) {
        spawnAccum -= 1;
        const sp = sparks[sparkCursor];
        sparkCursor = (sparkCursor + 1) % maxSparks;
        sp.active = true;
        const nozzleOffset = sparkCursor % 2 === 0 ? -0.45 : 0.45;
        sp.x = LANE_X[2] + nozzleOffset + (Math.random() - 0.5) * 0.14;
        sp.y = 0.28 + Math.random() * 0.12;
        sp.z = smoothedPlayerZ + 2.25;
        sp.vx = (Math.random() - 0.5) * 1.4;
        sp.vy = 0.4 + Math.random() * 1.1;
        sp.vz = 7 + Math.random() * 6;
        sp.maxLife = 0.36;
        sp.life = sp.maxLife;
        sp.colorHex = boost > 0.24 ? palette.accent : 0xfbbf24;
      }
    }

    for (let i = 0; i < maxSparks; i++) {
      const sp = sparks[i];
      if (!sp.active) {
        SCRATCH_VEC3_A.set(0, -40, 0);
        SCRATCH_QUAT.identity();
        SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        sparkInstanced.setMatrixAt(i, SCRATCH_MAT4);
        continue;
      }
      sp.life -= dtSec;
      if (sp.life <= 0) {
        sp.active = false;
        SCRATCH_VEC3_A.set(0, -40, 0);
        SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        sparkInstanced.setMatrixAt(i, SCRATCH_MAT4);
        continue;
      }
      sp.x += sp.vx * dtSec;
      sp.y += sp.vy * dtSec;
      sp.z += sp.vz * dtSec;
      const frac = sp.life / sp.maxLife;
      SCRATCH_VEC3_A.set(sp.x, sp.y, sp.z);
      SCRATCH_EULER.set(elapsedSec * 6, i, 0);
      SCRATCH_QUAT.setFromEuler(SCRATCH_EULER);
      SCRATCH_VEC3_B.set(frac, frac, frac);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      sparkInstanced.setMatrixAt(i, SCRATCH_MAT4);
      SCRATCH_COLOR.setHex(sp.colorHex);
      sparkInstanced.setColorAt(i, SCRATCH_COLOR);
    }
    sparkInstanced.instanceMatrix.needsUpdate = true;
    if (sparkInstanced.instanceColor) sparkInstanced.instanceColor.needsUpdate = true;

    // Chase Camera + WPM-driven dynamic FOV (disabled in Calm mode)
    const lookZ = smoothedPlayerZ - 18;
    const baseCamOffsetZ = ctx.calmMode ? 28.8 : 28.6 - Math.min(1.4, liveWpm * 0.015);
    const targetCamX = LANE_X[2] * 0.42;
    const targetCamZ = lookZ + baseCamOffsetZ * camDistScale;
    const camDamp = 1 - Math.exp(-8 * dtSec);
    camPosX += (targetCamX - camPosX) * camDamp;
    camPosZ += (targetCamZ - camPosZ) * camDamp;

    camera.position.set(camPosX, 4.15 * Math.sqrt(camDistScale), camPosZ);
    camera.lookAt(LANE_X[2] * 0.32, 1.15, lookZ);

    const targetFov = ctx.calmMode
      ? baseFov
      : baseFov + Math.min(9.5, liveWpm * 0.085) + (boost > 0 ? 1.8 : 0);
    if (Math.abs(targetFov - currentFov) > 0.04) {
      currentFov += (targetFov - currentFov) * camDamp;
      camDistScale = fitPerspectiveCamera(
        camera,
        ctx.container.clientWidth,
        ctx.container.clientHeight,
        currentFov,
      );
    }

    if (realisticPost) {
      const speedNorm =
        snap?.started && !snap.paused
          ? Math.min(1, liveWpm / 110 + (boost > 0 ? 0.35 : 0))
          : 0;
      realisticPost.setSpeedStreakIntensity(speedNorm, elapsedSec);
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
      externalState = (next as TurboRacer3DState) ?? null;
    },
    setTypingActive(typing: boolean) {
      loop.setTargetFps(
        typing
          ? Math.max(ctx.preset.typingFrameCap, Math.min(60, ctx.preset.sceneFrameCap))
          : ctx.preset.sceneFrameCap,
      );
    },
    resize(w: number, h: number) {
      managed.resize(w, h, camera, currentFov);
      camDistScale = fitPerspectiveCamera(camera, w, h, currentFov);
      legacyPipeline?.resize(w, h);
      realisticPost?.setSize(w, h, managed.pixelRatio);
    },
    dispose() {
      disposed = true;
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
      shadowTex.dispose();
      finishTex.dispose();
      if (acquiredPbrSize) {
        releaseSessionPbrTextures(acquiredPbrSize);
        acquiredPbrSize = null;
      }
      managed.dispose();
    },
  };
}
