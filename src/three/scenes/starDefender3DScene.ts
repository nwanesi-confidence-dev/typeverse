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
  SCRATCH_VEC3_C,
} from '@/src/three/core';
import {WordSpritePool, type PooledWordLabel} from '@/src/three/labelSprites';
import type {LazyThreeMountContext, LazyThreeSceneHandle} from '@/src/three/ThreeCanvasHost';

export interface StarDefenderAsteroidSnapshot {
  id: number;
  word: string;
  typed: number;
  x: number; // 0..1
  y: number; // px (26..318)
  isBoss: boolean;
}

export interface StarDefenderLaserEvent {
  xNorm: number;
  yNorm: number;
}

export interface StarDefenderExplosionEvent {
  xNorm: number;
  yNorm: number;
  isBoss: boolean;
}

export interface StarDefenderMutableSnapshot {
  paused: boolean;
  finished: boolean;
  started: boolean;
  shields: number;
  wave: number;
  lockedId: number | null;
  asteroids: StarDefenderAsteroidSnapshot[];
  pendingLasers3D?: StarDefenderLaserEvent[];
  pendingExplosions3D?: StarDefenderExplosionEvent[];
}

export interface StarDefender3DState {
  gameRef: {current: StarDefenderMutableSnapshot};
  fieldHeight: number;
}

interface PooledLaser {
  active: boolean;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  life: number;
}

interface PooledExplosionShard {
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

interface AsteroidVisual {
  group: THREE.Group;
  rockMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  rockMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
  badge: PooledWordLabel | null;
  inUse: boolean;
  assignedId: number;
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);

function mapPlayfieldCoords(
  xNorm: number,
  yPx: number,
  fieldHeight: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const maxY = Math.max(120, fieldHeight - 42);
  const progress = Math.max(0, Math.min(1, (yPx - 26) / Math.max(1, maxY - 26)));
  const wx = (xNorm - 0.5) * 13.2;
  const wy = 1.65 - progress * 1.4;
  const wz = -33 + progress * 35.8;
  return out.set(wx, wy, wz);
}

function buildDefenderFighter(
  accentHex: number,
  castShadow: boolean,
): {group: THREE.Group; thrusterMat: THREE.MeshStandardMaterial} {
  const group = new THREE.Group();

  // Delta wing hull (beveled extruded silhouette)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -1.65);
  wingShape.lineTo(1.55, 0.95);
  wingShape.lineTo(0.45, 1.2);
  wingShape.lineTo(0, 0.85);
  wingShape.lineTo(-0.45, 1.2);
  wingShape.lineTo(-1.55, 0.95);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  wingGeo.rotateX(Math.PI / 2);

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    metalness: 0.72,
    roughness: 0.25,
    clearcoat: 0.85,
  });
  const wingMesh = new THREE.Mesh(wingGeo, hullMat);
  wingMesh.position.set(0, 0.24, 0);
  wingMesh.castShadow = castShadow;
  group.add(wingMesh);

  // Accent fuselage spine
  const spineGeo = new THREE.ConeGeometry(0.38, 2.5, 6);
  spineGeo.rotateX(-Math.PI / 2);
  const spineMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.28,
    metalness: 0.55,
    roughness: 0.22,
  });
  const spineMesh = new THREE.Mesh(spineGeo, spineMat);
  spineMesh.position.set(0, 0.36, -0.35);
  spineMesh.castShadow = castShadow;
  group.add(spineMesh);

  // Glass cockpit canopy
  const canopyGeo = new THREE.SphereGeometry(0.32, 12, 10);
  canopyGeo.scale(0.85, 0.65, 1.85);
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.15,
    clearcoat: 1.0,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 0.52, -0.1);
  group.add(canopy);

  // Wingtip laser cannons
  const barrelGeo = new THREE.CylinderGeometry(0.055, 0.07, 1.05, 8);
  barrelGeo.rotateX(Math.PI / 2);
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.85,
    roughness: 0.2,
  });
  const barrelL = new THREE.Mesh(barrelGeo, barrelMat);
  barrelL.position.set(-1.12, 0.22, -0.22);
  group.add(barrelL);

  const barrelR = new THREE.Mesh(barrelGeo, barrelMat);
  barrelR.position.set(1.12, 0.22, -0.22);
  group.add(barrelR);

  // Twin plasma thrusters
  const thrusterGeo = new THREE.CylinderGeometry(0.14, 0.09, 0.34, 10);
  thrusterGeo.rotateX(Math.PI / 2);
  const thrusterMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.8,
    roughness: 0.15,
  });
  const thrustL = new THREE.Mesh(thrusterGeo, thrusterMat);
  thrustL.position.set(-0.34, 0.22, 1.08);
  group.add(thrustL);

  const thrustR = new THREE.Mesh(thrusterGeo, thrusterMat);
  thrustR.position.set(0.34, 0.22, 1.08);
  group.add(thrustR);

  return {group, thrusterMat};
}

export function mountScene(ctx: LazyThreeMountContext): LazyThreeSceneHandle {
  const palette = readThemePalette3D();
  const managed = createManagedRenderer(ctx.container, ctx.preset, {
    alpha: false,
    useEnvironment: true,
  });
  const {renderer, scene} = managed;

  const skyColor = 0x040714;
  scene.background = new THREE.Color(skyColor);
  if (ctx.preset.fog) {
    scene.fog = new THREE.FogExp2(skyColor, 0.014 / Math.max(0.7, ctx.preset.drawDistanceScale));
  }

  const baseFov = 50;
  const camera = new THREE.PerspectiveCamera(
    baseFov,
    Math.max(1, ctx.container.clientWidth) / Math.max(1, ctx.container.clientHeight),
    0.2,
    220,
  );
  camera.position.set(0, 5.4, 13.6);
  camera.lookAt(0, 0.3, -12);
  fitPerspectiveCamera(
    camera,
    ctx.container.clientWidth,
    ctx.container.clientHeight,
    baseFov,
  );

  // 3-Light Space Rig (<= 3 lights)
  const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x090d1f, 0.65);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xfff1e6, 1.55);
  dirLight.position.set(14, 22, 16);
  if (ctx.preset.shadows) {
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 70;
    dirLight.shadow.camera.left = -16;
    dirLight.shadow.camera.right = 16;
    dirLight.shadow.camera.top = 16;
    dirLight.shadow.camera.bottom = -16;
    dirLight.shadow.bias = -0.0005;
  }
  scene.add(dirLight);

  const shipGlow = new THREE.PointLight(palette.accent, 2.4, 26, 1.6);
  shipGlow.position.set(0, 1.2, 4.6);
  scene.add(shipGlow);

  // 1. InstancedMesh #1: Deep 3D Drifting Starfield
  const starCount = ctx.preset.tier === 'low' ? 140 : 280;
  const starGeo = new THREE.OctahedronGeometry(0.08, 0);
  const starMat = new THREE.MeshBasicMaterial({color: 0xffffff});
  const starInstanced = new THREE.InstancedMesh(starGeo, starMat, starCount);
  starInstanced.frustumCulled = false;

  const starCoords = new Float32Array(starCount * 4); // x, y, z, speed
  for (let i = 0; i < starCount; i++) {
    starCoords[i * 4 + 0] = (((i * 73) % 100) / 100 - 0.5) * 48;
    starCoords[i * 4 + 1] = (((i * 41) % 100) / 100 - 0.35) * 26;
    starCoords[i * 4 + 2] = -70 + ((i * 29) % 85);
    starCoords[i * 4 + 3] = 5 + (i % 7) * 1.4;
    SCRATCH_COLOR.setHex(i % 5 === 0 ? palette.accent : i % 3 === 0 ? 0xe0f2fe : 0x94a3b8);
    starInstanced.setColorAt(i, SCRATCH_COLOR);
  }
  if (starInstanced.instanceColor) starInstanced.instanceColor.needsUpdate = true;
  scene.add(starInstanced);

  // 2. Holographic Shield Barrier Line near z = +2.8
  const shieldGeo = new THREE.BoxGeometry(16.5, 0.08, 0.14);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: palette.accent,
    emissive: palette.accent,
    emissiveIntensity: 1.4,
    transparent: true,
    opacity: 0.72,
  });
  const shieldBar = new THREE.Mesh(shieldGeo, shieldMat);
  shieldBar.position.set(0, 0.1, 2.8);
  scene.add(shieldBar);

  // 3. Composite Player Defender Starfighter
  const fighter = buildDefenderFighter(palette.accent, ctx.preset.shadows);
  fighter.group.position.set(0, 0.15, 5.2);
  scene.add(fighter.group);

  // 4. Object Pool of Asteroid / Enemy Cruiser Targets + WordSpritePool
  const rockGeo = new THREE.DodecahedronGeometry(0.68, 1);
  // Subtle vertex displacement once on shared rock geometry for craggy silhouette
  const posAttr = rockGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const factor = 1 + 0.16 * Math.sin(vx * 5.2 + vy * 3.1) * Math.cos(vz * 4.7);
    posAttr.setXYZ(i, vx * factor, vy * factor, vz * factor);
  }
  rockGeo.computeVertexNormals();

  const bossRingGeo = new THREE.TorusGeometry(1.18, 0.08, 8, 28);
  bossRingGeo.rotateX(Math.PI / 2.6);
  const coreGeo = new THREE.OctahedronGeometry(0.45, 0);

  const wordSprites = new WordSpritePool(12, 24);
  const maxAsteroidsPool = 10;
  const asteroidPool: AsteroidVisual[] = Array.from({length: maxAsteroidsPool}, () => {
    const group = new THREE.Group();
    group.visible = false;

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.78,
      metalness: 0.25,
      emissive: 0x0f172a,
      emissiveIntensity: 0.2,
    });
    const rockMesh = new THREE.Mesh(rockGeo, rockMat);
    rockMesh.castShadow = ctx.preset.shadows;
    group.add(rockMesh);

    const coreMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 1.35,
      roughness: 0.2,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    const ringMesh = new THREE.Mesh(bossRingGeo, coreMat);
    ringMesh.visible = false;
    group.add(ringMesh);

    scene.add(group);
    return {
      group,
      rockMesh,
      ringMesh,
      coreMesh,
      rockMat,
      coreMat,
      badge: null,
      inUse: false,
      assignedId: -1,
    };
  });

  // 5. InstancedMesh #2: Pooled 3D Laser Beams
  const maxLasers = 12;
  const laserGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 6);
  const laserMat = new THREE.MeshBasicMaterial({
    color: palette.accent,
    transparent: true,
    opacity: 0.92,
  });
  const laserInstanced = new THREE.InstancedMesh(laserGeo, laserMat, maxLasers);
  laserInstanced.frustumCulled = false;
  scene.add(laserInstanced);

  const lasers: PooledLaser[] = Array.from({length: maxLasers}, (_, idx) => {
    SCRATCH_VEC3_A.set(0, -40, 0);
    SCRATCH_QUAT.identity();
    SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
    SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
    laserInstanced.setMatrixAt(idx, SCRATCH_MAT4);
    return {
      active: false,
      x1: 0,
      y1: 0,
      z1: 0,
      x2: 0,
      y2: 0,
      z2: 0,
      life: 0,
    };
  });
  laserInstanced.instanceMatrix.needsUpdate = true;
  let laserCursor = 0;

  // 6. InstancedMesh #3: Pooled Explosion Shards
  const maxShards = Math.max(24, Math.round(96 * ctx.preset.particleScale));
  const shardGeo = new THREE.OctahedronGeometry(0.14, 0);
  const shardMat = new THREE.MeshBasicMaterial({color: 0xffffff});
  const shardInstanced = new THREE.InstancedMesh(shardGeo, shardMat, maxShards);
  shardInstanced.frustumCulled = false;
  scene.add(shardInstanced);

  const shards: PooledExplosionShard[] = Array.from({length: maxShards}, (_, idx) => {
    SCRATCH_VEC3_A.set(0, -40, 0);
    SCRATCH_QUAT.identity();
    SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
    SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
    shardInstanced.setMatrixAt(idx, SCRATCH_MAT4);
    SCRATCH_COLOR.setHex(palette.accent);
    shardInstanced.setColorAt(idx, SCRATCH_COLOR);
    return {
      active: false,
      x: 0,
      y: -40,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.5,
      colorHex: palette.accent,
    };
  });
  shardInstanced.instanceMatrix.needsUpdate = true;
  if (shardInstanced.instanceColor) shardInstanced.instanceColor.needsUpdate = true;
  let shardCursor = 0;

  const accentCss = '#' + new THREE.Color(palette.accent).getHexString();
  let externalState: StarDefender3DState | null = null;
  let shipAimYaw = 0;
  let prevShields = 3;
  let shieldHitFlash = 0;

  const pipeline = createSceneRenderPipeline(renderer, scene, camera, ctx.preset, ctx.probe, {
    strength: 0.38,
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

    // 1. Drift stars toward camera
    const starSpeedMul = snap?.paused || ctx.calmMode ? 0.15 : 1.0;
    for (let i = 0; i < starCount; i++) {
      let z = starCoords[i * 4 + 2];
      if (!ctx.calmMode) {
        z += starCoords[i * 4 + 3] * dtSec * starSpeedMul;
        if (z > 14) z = -70;
        starCoords[i * 4 + 2] = z;
      }
      SCRATCH_VEC3_A.set(starCoords[i * 4 + 0], starCoords[i * 4 + 1], z);
      SCRATCH_QUAT.identity();
      const stScale = i % 6 === 0 ? 1.35 : 0.85;
      SCRATCH_VEC3_B.set(stScale, stScale, stScale * (ctx.calmMode ? 1 : 2.2));
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      starInstanced.setMatrixAt(i, SCRATCH_MAT4);
    }
    starInstanced.instanceMatrix.needsUpdate = true;

    // 2. Shield barrier feedback
    if (snap) {
      if (snap.shields < prevShields) {
        shieldHitFlash = 1.0;
      }
      prevShields = snap.shields;
    }
    if (shieldHitFlash > 0) {
      shieldHitFlash = Math.max(0, shieldHitFlash - dtSec * 3.2);
      shieldMat.color.setHex(palette.error);
      shieldMat.emissive.setHex(palette.error);
      shieldMat.emissiveIntensity = 1.6 + shieldHitFlash * 1.4;
    } else {
      shieldMat.color.setHex(palette.accent);
      shieldMat.emissive.setHex(palette.accent);
      shieldMat.emissiveIntensity = 1.15;
    }

    // 3. Sync active asteroids & word sprites (zero per-frame allocations)
    const activeList = snap?.asteroids ?? [];
    for (const slot of asteroidPool) {
      if (!slot.inUse) continue;
      const stillAlive = activeList.some((a) => a.id === slot.assignedId);
      if (!stillAlive) {
        slot.inUse = false;
        slot.assignedId = -1;
        slot.group.visible = false;
        if (slot.badge) {
          wordSprites.release(slot.badge);
          slot.badge = null;
        }
      }
    }

    let lockedWorldX = 0;
    let hasLockedTarget = false;

    for (const ast of activeList) {
      let slot = asteroidPool.find((s) => s.inUse && s.assignedId === ast.id);
      if (!slot) {
        slot = asteroidPool.find((s) => !s.inUse);
        if (!slot) continue;
        slot.inUse = true;
        slot.assignedId = ast.id;
        slot.group.visible = true;
        slot.badge = wordSprites.acquire(scene);
        slot.badge.sprite.scale.set(ast.isBoss ? 3.5 : 2.85, ast.isBoss ? 0.88 : 0.72, 1);
      }

      mapPlayfieldCoords(ast.x, ast.y, fieldH, SCRATCH_VEC3_A);
      slot.group.position.copy(SCRATCH_VEC3_A);
      const scale = ast.isBoss ? 1.52 : 0.96;
      slot.group.scale.set(scale, scale, scale);

      const isLocked = snap?.lockedId === ast.id;
      if (isLocked) {
        lockedWorldX = SCRATCH_VEC3_A.x;
        hasLockedTarget = true;
      }

      if (!ctx.calmMode && !snap?.paused) {
        slot.rockMesh.rotation.y += dtSec * (ast.isBoss ? 0.7 : 1.1);
        slot.rockMesh.rotation.x += dtSec * 0.5;
        slot.ringMesh.rotation.z += dtSec * 1.8;
      }

      slot.ringMesh.visible = ast.isBoss || isLocked;
      const toneHex = isLocked ? palette.accent : ast.isBoss ? palette.warning : 0x64748b;
      slot.rockMat.color.setHex(ast.isBoss ? 0x451a03 : 0x1e293b);
      slot.rockMat.emissive.setHex(isLocked ? palette.accent : ast.isBoss ? 0x78350f : 0x0f172a);
      slot.rockMat.emissiveIntensity = isLocked ? 0.45 : ast.isBoss ? 0.35 : 0.16;
      slot.coreMat.color.setHex(toneHex);
      slot.coreMat.emissive.setHex(toneHex);
      slot.coreMat.emissiveIntensity = isLocked ? 2.1 : ast.isBoss ? 1.7 : 0.9;

      if (slot.badge) {
        slot.badge.sprite.position.set(
          SCRATCH_VEC3_A.x,
          SCRATCH_VEC3_A.y + (ast.isBoss ? 1.85 : 1.35),
          SCRATCH_VEC3_A.z + 0.5,
        );
        wordSprites.updateLabel(slot.badge, {
          text: ast.word,
          typedCount: ast.typed,
          isActive: isLocked,
          accentHex: ast.isBoss ? '#FBBF24' : accentCss,
        });
      }
    }

    // 4. Aim Starfighter smoothly toward locked target
    const targetYaw = hasLockedTarget ? Math.atan2(-lockedWorldX, 18) : 0;
    const dampShip = 1 - Math.exp(-12 * dtSec);
    shipAimYaw += (targetYaw - shipAimYaw) * dampShip;
    fighter.group.rotation.y = shipAimYaw;
    fighter.group.rotation.z = ctx.calmMode ? 0 : shipAimYaw * 0.45;
    fighter.thrusterMat.emissiveIntensity = ctx.calmMode ? 1.3 : 1.5 + Math.sin(elapsedSec * 14) * 0.35;

    // 5. Consume pending laser fire events
    if (snap?.pendingLasers3D && snap.pendingLasers3D.length > 0) {
      while (snap.pendingLasers3D.length > 0) {
        const ev = snap.pendingLasers3D.shift()!;
        const laser = lasers[laserCursor];
        laserCursor = (laserCursor + 1) % maxLasers;
        mapPlayfieldCoords(ev.xNorm, ev.yNorm, fieldH, SCRATCH_VEC3_A);
        laser.active = true;
        laser.x1 = fighter.group.position.x;
        laser.y1 = fighter.group.position.y + 0.35;
        laser.z1 = fighter.group.position.z - 1.3;
        laser.x2 = SCRATCH_VEC3_A.x;
        laser.y2 = SCRATCH_VEC3_A.y;
        laser.z2 = SCRATCH_VEC3_A.z;
        laser.life = 1.0;
      }
    }

    for (let i = 0; i < maxLasers; i++) {
      const l = lasers[i];
      if (!l.active) continue;
      l.life -= dtSec * 8.5;
      if (l.life <= 0) {
        l.active = false;
        SCRATCH_VEC3_A.set(0, -40, 0);
        SCRATCH_QUAT.identity();
        SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        laserInstanced.setMatrixAt(i, SCRATCH_MAT4);
        continue;
      }
      SCRATCH_VEC3_A.set(l.x1, l.y1, l.z1);
      SCRATCH_VEC3_B.set(l.x2, l.y2, l.z2);
      SCRATCH_VEC3_C.subVectors(SCRATCH_VEC3_B, SCRATCH_VEC3_A);
      const len = Math.max(0.05, SCRATCH_VEC3_C.length());
      SCRATCH_VEC3_C.divideScalar(len);
      SCRATCH_QUAT.setFromUnitVectors(UP_AXIS, SCRATCH_VEC3_C);
      SCRATCH_VEC3_A.addVectors(SCRATCH_VEC3_A, SCRATCH_VEC3_B).multiplyScalar(0.5);
      const thick = 0.65 + l.life * 0.85;
      SCRATCH_VEC3_B.set(thick, len, thick);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      laserInstanced.setMatrixAt(i, SCRATCH_MAT4);
    }
    laserInstanced.instanceMatrix.needsUpdate = true;

    // 6. Consume pending explosion events into pooled shards
    if (snap?.pendingExplosions3D && snap.pendingExplosions3D.length > 0) {
      const shardsPerBurst = Math.max(6, Math.round(14 * ctx.preset.particleScale));
      while (snap.pendingExplosions3D.length > 0) {
        const ev = snap.pendingExplosions3D.shift()!;
        if (ctx.calmMode) continue;
        mapPlayfieldCoords(ev.xNorm, ev.yNorm, fieldH, SCRATCH_VEC3_A);
        for (let k = 0; k < shardsPerBurst; k++) {
          const sh = shards[shardCursor];
          shardCursor = (shardCursor + 1) % maxShards;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const spd = (ev.isBoss ? 7.5 : 5.0) + Math.random() * 5.5;
          sh.active = true;
          sh.x = SCRATCH_VEC3_A.x;
          sh.y = SCRATCH_VEC3_A.y;
          sh.z = SCRATCH_VEC3_A.z;
          sh.vx = Math.sin(phi) * Math.cos(theta) * spd;
          sh.vy = Math.cos(phi) * spd * 0.8;
          sh.vz = Math.sin(phi) * Math.sin(theta) * spd;
          sh.maxLife = 0.48;
          sh.life = sh.maxLife;
          sh.colorHex = ev.isBoss ? palette.warning : palette.accent;
        }
      }
    }

    for (let i = 0; i < maxShards; i++) {
      const sh = shards[i];
      if (!sh.active) continue;
      sh.life -= dtSec;
      if (sh.life <= 0) {
        sh.active = false;
        SCRATCH_VEC3_A.set(0, -40, 0);
        SCRATCH_QUAT.identity();
        SCRATCH_VEC3_B.set(0.001, 0.001, 0.001);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        shardInstanced.setMatrixAt(i, SCRATCH_MAT4);
        continue;
      }
      sh.x += sh.vx * dtSec;
      sh.y += sh.vy * dtSec;
      sh.z += sh.vz * dtSec;
      const frac = sh.life / sh.maxLife;
      SCRATCH_VEC3_A.set(sh.x, sh.y, sh.z);
      SCRATCH_EULER.set(elapsedSec * 5 + i, i * 0.7, 0);
      SCRATCH_QUAT.setFromEuler(SCRATCH_EULER);
      SCRATCH_VEC3_B.set(frac, frac, frac);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      shardInstanced.setMatrixAt(i, SCRATCH_MAT4);
      SCRATCH_COLOR.setHex(sh.colorHex);
      shardInstanced.setColorAt(i, SCRATCH_COLOR);
    }
    shardInstanced.instanceMatrix.needsUpdate = true;
    if (shardInstanced.instanceColor) shardInstanced.instanceColor.needsUpdate = true;

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
      externalState = (next as StarDefender3DState) ?? null;
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
