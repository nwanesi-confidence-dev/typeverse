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
  nose: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  spoilerWing: THREE.BufferGeometry;
  spoilerStrut: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  headlight: THREE.BufferGeometry;
  taillight: THREE.BufferGeometry;
  shadowPlane: THREE.BufferGeometry;
}

interface BuiltCar {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  taillightMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshPhysicalMaterial;
}

function createSharedCarGeometries(): CarGeometries {
  // Primary lower wedge body profile extruded symmetrically along X then centered
  const profile = new THREE.Shape();
  profile.moveTo(-2.1, 0.2);
  profile.lineTo(1.95, 0.16);
  profile.lineTo(2.2, 0.34);
  profile.lineTo(1.3, 0.58);
  profile.lineTo(-1.35, 0.68);
  profile.lineTo(-2.15, 0.56);
  profile.closePath();

  const chassis = new THREE.ExtrudeGeometry(profile, {
    depth: 1.56,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  chassis.center();
  // Rotate so length aligns along -Z (front = -Z, rear = +Z)
  chassis.rotateY(Math.PI / 2);

  const nose = new THREE.BoxGeometry(1.42, 0.14, 0.42);
  const canopy = new THREE.BoxGeometry(1.18, 0.36, 1.82);
  const spoilerWing = new THREE.BoxGeometry(1.66, 0.07, 0.36);
  const spoilerStrut = new THREE.BoxGeometry(0.08, 0.28, 0.18);

  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 16);
  wheel.rotateZ(Math.PI / 2);

  const headlight = new THREE.BoxGeometry(0.34, 0.09, 0.08);
  const taillight = new THREE.BoxGeometry(1.42, 0.1, 0.08);
  const shadowPlane = new THREE.PlaneGeometry(2.6, 5.2);
  shadowPlane.rotateX(-Math.PI / 2);

  return {
    chassis,
    nose,
    canopy,
    spoilerWing,
    spoilerStrut,
    wheel,
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
): BuiltCar {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: accentColorHex,
    metalness: 0.58,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    emissive: accentColorHex,
    emissiveIntensity: isPlayer ? 0.22 : 0.12,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.35,
    roughness: 0.65,
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x091020,
    metalness: 0.2,
    roughness: 0.08,
    clearcoat: 1.0,
    emissive: accentColorHex,
    emissiveIntensity: 0.06,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.1,
    roughness: 0.86,
  });

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

  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  const shadowMesh = new THREE.Mesh(geos.shadowPlane, shadowMat);
  shadowMesh.position.set(0, 0.02, 0);
  group.add(shadowMesh);

  const hull = new THREE.Mesh(geos.chassis, bodyMat);
  hull.position.set(0, 0.44, 0);
  hull.castShadow = castShadow;
  hull.receiveShadow = castShadow;
  group.add(hull);

  const splitter = new THREE.Mesh(geos.nose, darkTrimMat);
  splitter.position.set(0, 0.22, -2.06);
  group.add(splitter);

  const cockpit = new THREE.Mesh(geos.canopy, canopyMat);
  cockpit.position.set(0, 0.78, 0.06);
  cockpit.castShadow = castShadow;
  group.add(cockpit);

  const wing = new THREE.Mesh(geos.spoilerWing, darkTrimMat);
  wing.position.set(0, 0.96, 1.88);
  wing.castShadow = castShadow;
  group.add(wing);

  const strutL = new THREE.Mesh(geos.spoilerStrut, bodyMat);
  strutL.position.set(-0.56, 0.81, 1.88);
  group.add(strutL);

  const strutR = new THREE.Mesh(geos.spoilerStrut, bodyMat);
  strutR.position.set(0.56, 0.81, 1.88);
  group.add(strutR);

  const headL = new THREE.Mesh(geos.headlight, headlightMat);
  headL.position.set(-0.54, 0.42, -2.14);
  group.add(headL);

  const headR = new THREE.Mesh(geos.headlight, headlightMat);
  headR.position.set(0.54, 0.42, -2.14);
  group.add(headR);

  const tailBar = new THREE.Mesh(geos.taillight, taillightMat);
  tailBar.position.set(0, 0.56, 2.15);
  group.add(tailBar);

  const wheels: THREE.Mesh[] = [];
  const wheelCoords: [number, number, number][] = [
    [-0.86, 0.32, -1.32],
    [0.86, 0.32, -1.32],
    [-0.86, 0.32, 1.32],
    [0.86, 0.32, 1.32],
  ];
  for (const [wx, wy, wz] of wheelCoords) {
    const wMesh = new THREE.Mesh(geos.wheel, tireMat);
    wMesh.position.set(wx, wy, wz);
    wMesh.castShadow = castShadow;
    group.add(wMesh);
    wheels.push(wMesh);
  }

  return {group, wheels, taillightMat, bodyMat};
}

export function mountScene(ctx: LazyThreeMountContext): LazyThreeSceneHandle {
  const palette = readThemePalette3D();
  const managed = createManagedRenderer(ctx.container, ctx.preset, {
    alpha: false,
    useEnvironment: true,
  });
  const {renderer, scene} = managed;

  const skyColor = palette.isDark ? palette.bg : 0x0a1024;
  scene.background = new THREE.Color(skyColor);
  if (ctx.preset.fog) {
    const fogFar = 160 * ctx.preset.drawDistanceScale;
    scene.fog = new THREE.Fog(skyColor, 34, Math.max(105, fogFar));
  }

  const baseFov = 54;
  const camera = new THREE.PerspectiveCamera(
    baseFov,
    Math.max(1, ctx.container.clientWidth) / Math.max(1, ctx.container.clientHeight),
    0.2,
    360,
  );
  fitPerspectiveCamera(
    camera,
    ctx.container.clientWidth,
    ctx.container.clientHeight,
    baseFov,
  );

  // Studio + Cyber Highway 3-Light Rig (strictly <= 3 dynamic lights)
  const hemi = new THREE.HemisphereLight(0xbae6fd, 0x090d1f, 0.72);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xfff1e6, 1.45);
  dirLight.position.set(18, 28, 16);
  if (ctx.preset.shadows) {
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 90;
    dirLight.shadow.camera.left = -22;
    dirLight.shadow.camera.right = 22;
    dirLight.shadow.camera.top = 24;
    dirLight.shadow.camera.bottom = -24;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    scene.add(dirLight.target);
  }
  scene.add(dirLight);

  const playerHeadGlow = new THREE.PointLight(palette.accent, 2.8, 32, 1.5);
  scene.add(playerHeadGlow);

  // 1. Cyber Terrain Floor & Neon Highway Deck
  const terrainGeo = new THREE.PlaneGeometry(260, TRACK_WORLD_LENGTH + 180);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x050814,
    roughness: 0.9,
    metalness: 0.15,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.set(0, -0.14, -TRACK_WORLD_LENGTH / 2 + 20);
  scene.add(terrain);

  const roadGeo = new THREE.PlaneGeometry(15.2, TRACK_WORLD_LENGTH + 140);
  roadGeo.rotateX(-Math.PI / 2);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x0d152a,
    roughness: 0.52,
    metalness: 0.35,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.position.set(0, 0, -TRACK_WORLD_LENGTH / 2 + 20);
  road.receiveShadow = ctx.preset.shadows;
  scene.add(road);

  // Glowing side barrier curbs (offset +0.02 on Y to prevent Z-fighting)
  const curbGeo = new THREE.BoxGeometry(0.45, 0.28, TRACK_WORLD_LENGTH + 140);
  const curbMat = new THREE.MeshStandardMaterial({
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

  // 3. InstancedMesh #2: Roadside Neon Pylons
  const pylonPairCount = ctx.preset.tier === 'low' ? 38 : 64;
  const pylonTotal = pylonPairCount * 2;
  const pylonGeo = new THREE.BoxGeometry(0.32, 4.2, 0.32);
  const pylonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: palette.accent,
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metalness: 0.7,
  });
  const pylonInstanced = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonTotal);
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

    SCRATCH_VEC3_A.set(8.6, 2.0, z);
    SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
    pylonInstanced.setMatrixAt(i * 2 + 1, SCRATCH_MAT4);
    pylonInstanced.setColorAt(i * 2 + 1, SCRATCH_COLOR);
  }
  pylonInstanced.instanceMatrix.needsUpdate = true;
  if (pylonInstanced.instanceColor) pylonInstanced.instanceColor.needsUpdate = true;
  pylonInstanced.computeBoundingSphere();
  scene.add(pylonInstanced);

  // 4. InstancedMesh #3: Low-Poly Roadside Cyber Monoliths / Skyline Towers
  const towerCount = ctx.preset.tier === 'low' ? 44 : 84;
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x0f1a36,
    emissive: 0x1e293b,
    emissiveIntensity: 0.3,
    roughness: 0.6,
    metalness: 0.5,
  });
  const towerInstanced = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
  for (let i = 0; i < towerCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const distOut = 15 + ((i * 37) % 36);
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
  }
  towerInstanced.instanceMatrix.needsUpdate = true;
  if (towerInstanced.instanceColor) towerInstanced.instanceColor.needsUpdate = true;
  towerInstanced.computeBoundingSphere();
  scene.add(towerInstanced);

  // 5. Holographic Finish Gate at z = -TRACK_WORLD_LENGTH
  const finishGroup = new THREE.Group();
  finishGroup.position.set(0, 0, -TRACK_WORLD_LENGTH);
  const gatePillarGeo = new THREE.BoxGeometry(0.9, 6.8, 0.9);
  const gatePillarMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: palette.accent,
    emissiveIntensity: 0.65,
    metalness: 0.75,
    roughness: 0.22,
  });
  const gatePillarL = new THREE.Mesh(gatePillarGeo, gatePillarMat);
  gatePillarL.position.set(-8.1, 3.4, 0);
  finishGroup.add(gatePillarL);
  const gatePillarR = new THREE.Mesh(gatePillarGeo, gatePillarMat);
  gatePillarR.position.set(8.1, 3.4, 0);
  finishGroup.add(gatePillarR);

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

  // Ground finish stripe (offset +0.02 on Y to prevent Z-fighting)
  const stripeGeo = new THREE.PlaneGeometry(15.2, 2.2);
  stripeGeo.rotateX(-Math.PI / 2);
  const stripeMat = new THREE.MeshBasicMaterial({
    map: finishTex,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const finishStripe = new THREE.Mesh(stripeGeo, stripeMat);
  finishStripe.position.set(0, 0.02, 0);
  finishGroup.add(finishStripe);
  scene.add(finishGroup);

  // 6. Composite Player & 3 Rival Cars + Pooled Nameplate Sprites
  const carGeos = createSharedCarGeometries();
  const shadowTex = createContactShadowTexture();
  const wordSprites = new WordSpritePool(8, 12);

  const playerCar = buildCompositeCar(
    carGeos,
    palette.accent,
    true,
    shadowTex,
    ctx.preset.shadows,
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
    const built = buildCompositeCar(carGeos, col, false, shadowTex, ctx.preset.shadows);
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
        // Clamp within highway bounds
        const wrappedZ = Math.max(-TRACK_WORLD_LENGTH, Math.min(20, dz));
        SCRATCH_VEC3_A.set(lx, 0.02, wrappedZ);
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

  const pipeline = createSceneRenderPipeline(renderer, scene, camera, ctx.preset, ctx.probe, {
    strength: 0.34,
    radius: 0.32,
    threshold: 0.85,
  });

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
      dirLight.target.position.set(0, 0, smoothedPlayerZ - 8);
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
    const targetCamX = LANE_X[2] * 0.42;
    const targetCamZ = smoothedPlayerZ + (ctx.calmMode ? 10.8 : 10.6 - Math.min(1.4, liveWpm * 0.015));
    const camDamp = 1 - Math.exp(-8 * dtSec);
    camPosX += (targetCamX - camPosX) * camDamp;
    camPosZ += (targetCamZ - camPosZ) * camDamp;

    camera.position.set(camPosX, 4.15, camPosZ);
    camera.lookAt(LANE_X[2] * 0.32, 1.15, smoothedPlayerZ - 18);

    const targetFov = ctx.calmMode
      ? baseFov
      : baseFov + Math.min(9.5, liveWpm * 0.085) + (boost > 0 ? 1.8 : 0);
    if (Math.abs(targetFov - currentFov) > 0.04) {
      currentFov += (targetFov - currentFov) * camDamp;
      fitPerspectiveCamera(
        camera,
        ctx.container.clientWidth,
        ctx.container.clientHeight,
        currentFov,
      );
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
      externalState = (next as TurboRacer3DState) ?? null;
    },
    setTypingActive(typing: boolean) {
      loop.setTargetFps(
        typing
          ? Math.max(ctx.preset.typingFrameCap, Math.min(60, ctx.preset.sceneFrameCap))
          : ctx.preset.sceneFrameCap,
      );
    },
    resize(width: number, height: number) {
      managed.resize(width, height, camera, currentFov);
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
