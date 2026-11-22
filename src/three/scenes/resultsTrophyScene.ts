import * as THREE from 'three';
import {getDetailConstants} from '@/src/graphics/detail';
import {
  addRealisticStudioLights,
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
import {createPostPipeline, type ManagedPostPipeline} from '@/src/three/postPipeline';
import {
  acquireSessionPbrTextures,
  releaseSessionPbrTextures,
} from '@/src/three/proceduralTextures';
import type {LazyThreeMountContext, LazyThreeSceneHandle} from '@/src/three/ThreeCanvasHost';

export interface ResultsTrophyState {
  stars: number;
  isNewBest: boolean;
  passed?: boolean;
}

interface ConfettiPiece {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  vrx: number;
  vry: number;
  scale: number;
}

function createStarShape(outerR: number, innerR: number, points = 5): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function createPlaqueTexture(accentCss: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = accentCss;
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = '#fbbf24';
  ctx.font = '700 42px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TYPEVERSE AWARD', 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/**
 * Results Celebration 3D:
 * Procedural 3D Trophy (LatheGeometry + handles) for Personal Bests / 3 Stars,
 * or 3D Beveled Medal for 1-2 Stars, plus InstancedMesh 3D Confetti.
 * Realistic detail uses 128-segment lathe silhouettes, clearcoat PBR gold/metal textures,
 * radial contact shadow + shadow-casting studio lights, metallic shaded confetti, and post pipeline.
 */
export function mountScene(ctx: LazyThreeMountContext): LazyThreeSceneHandle {
  const palette = readThemePalette3D();
  const isRealistic = Boolean(ctx.preset.realistic || ctx.preset.mode === '3d-realistic');
  const consts = getDetailConstants(ctx.preset.mode);
  const accentCss = '#' + palette.accent.toString(16).padStart(6, '0');

  const managed = createManagedRenderer(ctx.container, ctx.preset, {
    alpha: true,
    useEnvironment: true,
    clearAlpha: isRealistic && ctx.preset.postEffects ? 1 : 0,
  });
  const {renderer, scene} = managed;
  if (isRealistic && ctx.preset.postEffects) {
    scene.background = new THREE.Color(palette.bg);
  }

  const width = Math.max(1, ctx.container.clientWidth);
  const height = Math.max(1, ctx.container.clientHeight);
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
  camera.position.set(0, 1.3, 6.2);
  camera.lookAt(0, 0.8, 0);
  fitPerspectiveCamera(camera, width, height, 42);

  if (isRealistic) {
    addRealisticStudioLights(scene, {
      shadows: ctx.preset.shadows,
      accentColor: palette.accent,
      surfaceColor: palette.surface,
      shadowExtent: 4.5,
    });
  } else {
    const hemi = new THREE.HemisphereLight(0xffffff, palette.surface, 1.0);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff4d6, 1.6);
    keyLight.position.set(4, 7, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(palette.accent, 2.0, 20, 1.5);
    rimLight.position.set(-4, 2.5, -2.5);
    scene.add(rimLight);
  }

  const goldMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: 0xfbbf24,
        emissive: 0x92400e,
        emissiveIntensity: 0.18,
        roughness: 0.18,
        metalness: 0.94,
        clearcoat: 0.88,
        clearcoatRoughness: 0.1,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0x92400e,
        emissiveIntensity: 0.15,
        roughness: 0.22,
        metalness: 0.88,
      });

  const silverMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: 0xe2e8f0,
        roughness: 0.2,
        metalness: 0.92,
        clearcoat: 0.78,
        clearcoatRoughness: 0.12,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.24,
        metalness: 0.85,
      });

  const pedestalMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: palette.surface,
        roughness: 0.34,
        metalness: 0.45,
        clearcoat: 0.5,
        clearcoatRoughness: 0.18,
      })
    : new THREE.MeshStandardMaterial({
        color: palette.surface,
        roughness: 0.45,
        metalness: 0.35,
      });

  const ribbonMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: palette.accent,
        emissive: palette.accent,
        emissiveIntensity: 0.22,
        roughness: 0.42,
        metalness: 0.15,
        sheen: 0.65,
        sheenRoughness: 0.35,
      })
    : new THREE.MeshStandardMaterial({
        color: palette.accent,
        emissive: palette.accent,
        emissiveIntensity: 0.25,
        roughness: 0.4,
        metalness: 0.2,
      });

  const starGeo = new THREE.ExtrudeGeometry(createStarShape(0.36, 0.16, 5), {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: isRealistic ? consts.keycapBevelSegments : 2,
  });
  starGeo.center();

  // Group A: Lathe Trophy (128 radial segments at Realistic, 28 at Light/Full)
  const trophyGroup = new THREE.Group();
  const lathePoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.75, 0.0),
    new THREE.Vector2(0.72, 0.22),
    new THREE.Vector2(0.45, 0.35),
    new THREE.Vector2(0.2, 0.55),
    new THREE.Vector2(0.18, 0.95),
    new THREE.Vector2(0.36, 1.15),
    new THREE.Vector2(0.78, 1.65),
    new THREE.Vector2(0.86, 2.1),
    new THREE.Vector2(0.76, 2.15),
    new THREE.Vector2(0.68, 1.72),
    new THREE.Vector2(0.0, 1.28),
  ];
  const cupGeo = new THREE.LatheGeometry(lathePoints, isRealistic ? consts.latheSegments : 28);
  const cupMesh = new THREE.Mesh(cupGeo, goldMat);
  cupMesh.castShadow = isRealistic && ctx.preset.shadows;
  cupMesh.receiveShadow = isRealistic && ctx.preset.shadows;
  trophyGroup.add(cupMesh);

  const plinthGeo = new THREE.CylinderGeometry(
    0.76,
    0.86,
    0.32,
    isRealistic ? consts.latheSegments : 24,
  );
  const plinthMesh = new THREE.Mesh(plinthGeo, pedestalMat);
  plinthMesh.position.y = -0.16;
  plinthMesh.castShadow = isRealistic && ctx.preset.shadows;
  plinthMesh.receiveShadow = isRealistic && ctx.preset.shadows;
  trophyGroup.add(plinthMesh);

  let plaqueTex: THREE.CanvasTexture | null = null;
  if (isRealistic) {
    plaqueTex = createPlaqueTexture(accentCss);
    const plaqueGeo = new THREE.PlaneGeometry(0.92, 0.22);
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex,
      roughness: 0.3,
      metalness: 0.4,
    });
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(0, -0.16, 0.825);
    plaque.rotation.x = -0.14;
    trophyGroup.add(plaque);
  }

  const handleGeo = new THREE.TorusGeometry(
    0.36,
    0.065,
    isRealistic ? 22 : 10,
    isRealistic ? consts.latheSegments : 24,
    Math.PI * 1.1,
  );
  const handleLeft = new THREE.Mesh(handleGeo, goldMat);
  handleLeft.position.set(-0.74, 1.68, 0);
  handleLeft.rotation.z = Math.PI * 0.45;
  handleLeft.castShadow = isRealistic && ctx.preset.shadows;
  trophyGroup.add(handleLeft);

  const handleRight = new THREE.Mesh(handleGeo, goldMat);
  handleRight.position.set(0.74, 1.68, 0);
  handleRight.rotation.z = -Math.PI * 0.55;
  handleRight.rotation.y = Math.PI;
  handleRight.castShadow = isRealistic && ctx.preset.shadows;
  trophyGroup.add(handleRight);

  const trophyStar = new THREE.Mesh(starGeo, goldMat);
  trophyStar.position.set(0, 2.48, 0);
  trophyStar.castShadow = isRealistic && ctx.preset.shadows;
  trophyGroup.add(trophyStar);

  trophyGroup.position.set(0, -0.35, 0);
  scene.add(trophyGroup);

  // Radial contact shadow blob beneath the award (Realistic)
  let contactBlobMat: THREE.MeshBasicMaterial | null = null;
  if (isRealistic) {
    const contactGeo = new THREE.PlaneGeometry(2.6, 2.6);
    contactGeo.rotateX(-Math.PI / 2);
    contactBlobMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      visible: false,
    });
    const contactBlob = new THREE.Mesh(contactGeo, contactBlobMat);
    contactBlob.position.set(0, -0.68, 0);
    scene.add(contactBlob);
  }

  // Group B: Ribboned Star Medal
  const medalGroup = new THREE.Group();
  const discGeo = new THREE.CylinderGeometry(
    0.95,
    0.95,
    0.16,
    isRealistic ? consts.latheSegments : 32,
  );
  discGeo.rotateX(Math.PI / 2);
  const discMesh = new THREE.Mesh(discGeo, silverMat);
  discMesh.castShadow = isRealistic && ctx.preset.shadows;
  medalGroup.add(discMesh);

  const ringGeo = new THREE.TorusGeometry(
    0.96,
    0.085,
    isRealistic ? 22 : 12,
    isRealistic ? consts.latheSegments : 32,
  );
  const ringMesh = new THREE.Mesh(ringGeo, goldMat);
  ringMesh.castShadow = isRealistic && ctx.preset.shadows;
  medalGroup.add(ringMesh);

  const medalStar = new THREE.Mesh(starGeo, goldMat);
  medalStar.position.z = 0.09;
  medalStar.scale.setScalar(1.25);
  medalGroup.add(medalStar);

  const ribbonGeo = new THREE.BoxGeometry(0.46, 0.9, 0.06);
  const ribbonLeft = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonLeft.position.set(-0.26, 1.25, 0);
  ribbonLeft.rotation.z = 0.24;
  medalGroup.add(ribbonLeft);

  const ribbonRight = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonRight.position.set(0.26, 1.25, 0);
  ribbonRight.rotation.z = -0.24;
  medalGroup.add(ribbonRight);

  medalGroup.position.set(0, 0.72, 0);
  medalGroup.visible = false;
  scene.add(medalGroup);

  // Instanced 3D Confetti (shaded double-sided metallic foil at Realistic)
  const confettiCount = Math.max(36, Math.round(90 * ctx.preset.particleScale));
  const confettiGeo = isRealistic
    ? new THREE.PlaneGeometry(0.16, 0.1, 2, 1)
    : new THREE.BoxGeometry(0.14, 0.09, 0.02);
  if (isRealistic) {
    // Subtle saddle bend on confetti foil so light catches realistic curved highlights
    const pos = confettiGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      pos.setZ(i, Math.sin((px / 0.08) * 0.9) * 0.018);
    }
    confettiGeo.computeVertexNormals();
  }

  const confettiMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.24,
        metalness: 0.68,
        clearcoat: 0.65,
        clearcoatRoughness: 0.14,
        side: THREE.DoubleSide,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.25,
      });

  const confettiMesh = new THREE.InstancedMesh(confettiGeo, confettiMat, confettiCount);
  confettiMesh.frustumCulled = false;
  const confettiColors = [0x22d3ee, 0x34d399, 0xfbbf24, 0xf472b6, 0xa78bfa];
  const confettiPieces: ConfettiPiece[] = [];

  for (let i = 0; i < confettiCount; i++) {
    SCRATCH_COLOR.setHex(confettiColors[i % confettiColors.length]);
    confettiMesh.setColorAt(i, SCRATCH_COLOR);
    confettiPieces.push({
      x: (Math.random() - 0.5) * 8.5,
      y: 0.4 + Math.random() * 4.5,
      z: (Math.random() - 0.5) * 4.2,
      vx: (Math.random() - 0.5) * 0.9,
      vy: -(0.7 + Math.random() * 1.1),
      vz: (Math.random() - 0.5) * 0.6,
      rx: Math.random() * Math.PI,
      ry: Math.random() * Math.PI,
      vrx: (Math.random() - 0.5) * 4.2,
      vry: (Math.random() - 0.5) * 4.2,
      scale: 0.75 + Math.random() * 0.65,
    });
  }
  if (confettiMesh.instanceColor) confettiMesh.instanceColor.needsUpdate = true;
  scene.add(confettiMesh);

  let postPipeline: ManagedPostPipeline | null = null;
  if (isRealistic && ctx.preset.postEffects) {
    postPipeline = createPostPipeline(renderer, scene, camera, {
      width,
      height,
      pixelRatio: managed.pixelRatio,
      multisampleSamples: ctx.preset.multisampleSamples,
      enableBloom: true,
      enableVignette: true,
    });
  }

  let disposed = false;
  let acquiredPbrSize: 512 | 1024 | null = null;
  if (isRealistic) {
    void acquireSessionPbrTextures(renderer, 1024).then((pbr) => {
      if (disposed) {
        releaseSessionPbrTextures(pbr.sizeTier);
        return;
      }
      acquiredPbrSize = pbr.sizeTier;
      goldMat.normalMap = pbr.metalNormal;
      goldMat.roughnessMap = pbr.metalRoughness;
      goldMat.needsUpdate = true;

      silverMat.normalMap = pbr.metalNormal;
      silverMat.roughnessMap = pbr.metalRoughness;
      silverMat.needsUpdate = true;

      pedestalMat.normalMap = pbr.metalNormal;
      pedestalMat.roughnessMap = pbr.metalRoughness;
      pedestalMat.needsUpdate = true;

      if (contactBlobMat) {
        contactBlobMat.map = pbr.contactShadowBlob;
        contactBlobMat.visible = true;
        contactBlobMat.needsUpdate = true;
      }
    });
  }

  let currentState: ResultsTrophyState = {
    stars: 3,
    isNewBest: false,
  };

  const applyAwardMode = () => {
    const showTrophy = currentState.isNewBest || currentState.stars >= 3;
    trophyGroup.visible = showTrophy;
    medalGroup.visible = !showTrophy;
    discMesh.material = currentState.stars >= 2 ? goldMat : silverMat;
    confettiMesh.visible = !ctx.calmMode && (currentState.isNewBest || currentState.stars >= 2);
  };

  applyAwardMode();

  const updateFrame = (dtSec: number, elapsedSec: number) => {
    const activeAward = trophyGroup.visible ? trophyGroup : medalGroup;
    if (!ctx.calmMode) {
      activeAward.rotation.y = Math.sin(elapsedSec * 0.9) * 0.45 + elapsedSec * 0.45;
      trophyStar.rotation.y = elapsedSec * 1.6;
      trophyStar.position.y = 2.48 + Math.sin(elapsedSec * 2.2) * 0.08;
    } else {
      activeAward.rotation.y = 0.28;
    }

    if (confettiMesh.visible) {
      for (let i = 0; i < confettiCount; i++) {
        const p = confettiPieces[i];
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
        p.z += p.vz * dtSec;
        p.rx += p.vrx * dtSec;
        p.ry += p.vry * dtSec;

        if (p.y < -1.8) {
          p.y = 3.8 + Math.random() * 1.2;
          p.x = (Math.random() - 0.5) * 8.5;
        }

        SCRATCH_VEC3_A.set(p.x, p.y, p.z);
        SCRATCH_EULER.set(p.rx, p.ry, 0);
        SCRATCH_QUAT.setFromEuler(SCRATCH_EULER);
        SCRATCH_VEC3_B.set(p.scale, p.scale, p.scale);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        confettiMesh.setMatrixAt(i, SCRATCH_MAT4);
      }
      confettiMesh.instanceMatrix.needsUpdate = true;
    }
  };

  const renderFrame = (dtSec?: number) => {
    if (postPipeline) {
      postPipeline.render(dtSec);
    } else {
      renderer.render(scene, camera);
    }
  };

  updateFrame(0.016, 0);
  renderFrame(0.016);

  const loop = createCappedLoop({
    targetFps: ctx.calmMode ? 20 : ctx.preset.sceneFrameCap || 40,
    isSoftwareGl: ctx.probe.isSoftwareGl,
    onSampleDtMs: ctx.onFrameDtMs,
    onFrame(dtSec, elapsedSec) {
      updateFrame(dtSec, elapsedSec);
      renderFrame(dtSec);
    },
  });
  loop.start();

  return {
    updateState(next: unknown) {
      if (!next || typeof next !== 'object') return;
      currentState = next as ResultsTrophyState;
      applyAwardMode();
    },
    resize(w: number, h: number) {
      managed.resize(w, h, camera, 42);
      postPipeline?.setSize(w, h, managed.pixelRatio);
      renderFrame(0.016);
    },
    dispose() {
      disposed = true;
      loop.stop();
      if (postPipeline) {
        postPipeline.dispose();
        postPipeline = null;
      }
      if (plaqueTex) {
        plaqueTex.dispose();
        plaqueTex = null;
      }
      if (acquiredPbrSize) {
        releaseSessionPbrTextures(acquiredPbrSize);
        acquiredPbrSize = null;
      }
      managed.dispose();
    },
  };
}
