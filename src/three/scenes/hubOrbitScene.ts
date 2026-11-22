import * as THREE from 'three';
import {getDetailConstants} from '@/src/graphics/detail';
import {graphicsModeService} from '@/src/graphics/graphicsModeService';
import {
  addRealisticStudioLights,
  createCappedLoop,
  createManagedRenderer,
  fitPerspectiveCamera,
  readThemePalette3D,
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

interface OrbitKeyParticle {
  radius: number;
  angle: number;
  speed: number;
  yOffset: number;
  bobPhase: number;
  rotSpeedX: number;
  rotSpeedY: number;
  scale: number;
}

const KEY_LEGENDS = [
  'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']',
  'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", '↵',
  'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', '⇧', '⌥',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=',
];

function createRoundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const radius = Math.min(r, hw * 0.45, hd * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + radius, -hd);
  shape.lineTo(hw - radius, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + radius);
  shape.lineTo(hw, hd - radius);
  shape.quadraticCurveTo(hw, hd, hw - radius, hd);
  shape.lineTo(-hw + radius, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - radius);
  shape.lineTo(-hw, -hd + radius);
  shape.quadraticCurveTo(-hw, -hd, -hw + radius, -hd);
  return shape;
}

/**
 * Generates a crisp procedural 1024x1024 keycap legend atlas (8x6 grid = 48 cells)
 * offline using a 2D canvas with high contrast and mipmapped anisotropy.
 */
function createKeyLegendAtlas1024(
  maxAnisotropy: number,
  accentHex: number,
  isDark: boolean,
): THREE.CanvasTexture {
  const size = 1024;
  const cols = 8;
  const rows = 6;
  const cellW = size / cols;
  const cellH = size / rows;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const accentCss = '#' + accentHex.toString(16).padStart(6, '0');
  const fgCss = isDark ? '#f8fafc' : '#0f172a';

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = col * cellW + cellW * 0.5;
    const cy = row * cellH + cellH * 0.5;
    const label = KEY_LEGENDS[i % KEY_LEGENDS.length];

    // Subtle keycap dish border highlight
    ctx.strokeStyle = i === 15 || i === 18 ? accentCss : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 4;
    ctx.strokeRect(col * cellW + 16, row * cellH + 16, cellW - 32, cellH - 32);

    ctx.fillStyle = label === 'F' || label === 'J' ? accentCss : fgCss;
    ctx.font = '700 68px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

function createLegendDecalInstancedMesh(
  count: number,
  atlasTex: THREE.CanvasTexture,
  opacity = 0.94,
): THREE.InstancedMesh {
  const cols = 8;
  const rows = 6;
  const geo = new THREE.PlaneGeometry(0.28, 0.28);
  geo.rotateX(-Math.PI / 2);

  const tileOffsets = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const idx = i % (cols * rows);
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    tileOffsets[i * 2] = col / cols;
    // Canvas y=0 is top; UV v=1 is top
    tileOffsets[i * 2 + 1] = 1 - (row + 1) / rows;
  }
  geo.setAttribute('aTileOffset', new THREE.InstancedBufferAttribute(tileOffsets, 2));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: {
      uAtlas: {value: atlasTex},
      uTileScale: {value: new THREE.Vector2(1 / cols, 1 / rows)},
      uOpacity: {value: opacity},
    },
    vertexShader: /* glsl */ `
      attribute vec2 aTileOffset;
      varying vec2 vAtlasUv;
      uniform vec2 uTileScale;
      void main() {
        vAtlasUv = uv * uTileScale + aTileOffset;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform float uOpacity;
      varying vec2 vAtlasUv;
      void main() {
        vec4 texel = texture2D(uAtlas, vAtlasUv);
        if (texel.a < 0.05) discard;
        gl_FragColor = vec4(texel.rgb, texel.a * uOpacity);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Hub Background "Orbit":
 * Slow-drifting scene of floating 3D keycaps orbiting a glowing keyboard island
 * with gentle camera parallax following the pointer.
 * At Realistic detail: sculpted bevelled glossy keycaps, 1024 legend atlas,
 * soft contact shadow blobs, IBL studio lighting, directional shadow map, and EffectComposer.
 */
export function mountScene(ctx: LazyThreeMountContext): LazyThreeSceneHandle {
  const palette = readThemePalette3D();
  const isRealistic = Boolean(ctx.preset.realistic || ctx.preset.mode === '3d-realistic');
  const consts = getDetailConstants(ctx.preset.mode);

  const managed = createManagedRenderer(ctx.container, ctx.preset, {
    alpha: true,
    useEnvironment: ctx.preset.tier !== 'low',
    clearAlpha: isRealistic && ctx.preset.postEffects ? 1 : 0,
  });
  const {renderer, scene} = managed;

  const width = Math.max(1, ctx.container.clientWidth);
  const height = Math.max(1, ctx.container.clientHeight);
  const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 120);
  camera.position.set(0, 4.2, 13.5);
  camera.lookAt(0, 0.2, 0);
  fitPerspectiveCamera(camera, width, height, 46);

  if (isRealistic && ctx.preset.postEffects) {
    scene.background = new THREE.Color(palette.bg);
  }
  if (ctx.preset.fog) {
    scene.fog = new THREE.FogExp2(palette.bg, isRealistic ? 0.024 : 0.032);
  }

  // Lighting: Light & Full preserve exact Phase 11 look; Realistic uses calibrated studio 3-pt shadows
  if (isRealistic) {
    addRealisticStudioLights(scene, {
      shadows: ctx.preset.shadows,
      accentColor: palette.accent,
      surfaceColor: palette.surface,
      shadowExtent: 6.5,
    });
  } else {
    const ambient = new THREE.HemisphereLight(
      palette.isDark ? 0xa5f3fc : 0xffffff,
      palette.surface,
      palette.isDark ? 0.85 : 1.05,
    );
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(6, 10, 7);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(palette.accent, 2.2, 26, 1.6);
    rimLight.position.set(-5, 3.2, -3);
    scene.add(rimLight);
  }

  const rootGroup = new THREE.Group();
  rootGroup.position.set(0, -0.4, 0);
  scene.add(rootGroup);

  const islandGroup = new THREE.Group();
  islandGroup.rotation.x = 0.24;
  islandGroup.rotation.y = -0.18;
  rootGroup.add(islandGroup);

  // Island deck geometry & materials
  let deckMat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  if (isRealistic) {
    const deckGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(6.8, 3.1, 0.32), {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: consts.keycapBevelSegments,
    });
    deckGeo.rotateX(-Math.PI / 2);
    deckGeo.center();

    deckMat = new THREE.MeshPhysicalMaterial({
      color: palette.surface,
      roughness: 0.34,
      metalness: 0.52,
      clearcoat: 0.65,
      clearcoatRoughness: 0.16,
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.castShadow = ctx.preset.shadows;
    deckMesh.receiveShadow = ctx.preset.shadows;
    islandGroup.add(deckMesh);
  } else {
    const deckGeo = new THREE.BoxGeometry(6.8, 0.42, 3.1);
    deckMat = new THREE.MeshStandardMaterial({
      color: palette.surface,
      roughness: 0.42,
      metalness: 0.35,
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    islandGroup.add(deckMesh);
  }

  // Glowing under-rim
  const rimGeo = isRealistic
    ? (() => {
        const g = new THREE.ExtrudeGeometry(createRoundedRectShape(7.02, 3.32, 0.36), {
          depth: 0.08,
          bevelEnabled: true,
          bevelThickness: 0.025,
          bevelSize: 0.025,
          bevelSegments: 4,
        });
        g.rotateX(-Math.PI / 2);
        g.center();
        return g;
      })()
    : new THREE.BoxGeometry(7.05, 0.12, 3.35);

  const rimMat = new THREE.MeshStandardMaterial({
    color: palette.accent,
    emissive: palette.accent,
    emissiveIntensity: isRealistic
      ? palette.isDark
        ? 1.45
        : 0.85
      : palette.isDark
        ? 0.65
        : 0.35,
    roughness: 0.25,
    metalness: 0.2,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = -0.16;
  islandGroup.add(rimMesh);

  // Luminous halo ring around keyboard island
  const ringGeo = new THREE.TorusGeometry(
    4.9,
    isRealistic ? 0.04 : 0.035,
    isRealistic ? 16 : 10,
    isRealistic ? consts.latheSegments : 64,
  );
  const ringMat = new THREE.MeshBasicMaterial({
    color: palette.accent,
    transparent: true,
    opacity: palette.isDark ? 0.32 : 0.2,
  });
  const haloRing = new THREE.Mesh(ringGeo, ringMat);
  haloRing.rotation.x = Math.PI / 2;
  haloRing.position.y = -0.35;
  islandGroup.add(haloRing);

  // Keycap geometry & materials
  const islandKeyGeo = isRealistic
    ? (() => {
        const g = new THREE.ExtrudeGeometry(createRoundedRectShape(0.35, 0.35, 0.06), {
          depth: 0.13,
          bevelEnabled: true,
          bevelThickness: 0.038,
          bevelSize: 0.038,
          bevelSegments: consts.keycapBevelSegments,
        });
        g.rotateX(-Math.PI / 2);
        g.center();
        return g;
      })()
    : (() => {
        const g = new THREE.CylinderGeometry(0.18, 0.24, 0.22, 4);
        g.rotateY(Math.PI / 4);
        return g;
      })();

  const islandKeyMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: palette.isDark ? 0x1e293b : 0xe2e8f0,
        emissive: palette.accent,
        emissiveIntensity: 0.09,
        roughness: 0.3,
        metalness: 0.16,
        clearcoat: 0.92,
        clearcoatRoughness: 0.09,
      })
    : new THREE.MeshStandardMaterial({
        color: palette.isDark ? 0x1e293b : 0xe2e8f0,
        emissive: palette.accent,
        emissiveIntensity: 0.14,
        roughness: 0.38,
        metalness: 0.25,
      });

  const rows = 4;
  const cols = 12;
  const islandCapsCount = rows * cols;
  const islandCaps = new THREE.InstancedMesh(islandKeyGeo, islandKeyMat, islandCapsCount);
  islandCaps.castShadow = isRealistic && ctx.preset.shadows;
  islandCaps.receiveShadow = isRealistic && ctx.preset.shadows;

  let legendAtlas: THREE.CanvasTexture | null = null;
  let islandLegends: THREE.InstancedMesh | null = null;
  let blobMat: THREE.MeshBasicMaterial | null = null;
  let islandBlobs: THREE.InstancedMesh | null = null;

  if (isRealistic) {
    const maxAniso = renderer.capabilities.getMaxAnisotropy?.() ?? 4;
    legendAtlas = createKeyLegendAtlas1024(maxAniso, palette.accent, palette.isDark);
    islandLegends = createLegendDecalInstancedMesh(islandCapsCount, legendAtlas, 0.92);
    islandGroup.add(islandLegends);

    // Grounding radial contact shadow decals under each keycap (1 draw call)
    const blobGeo = new THREE.PlaneGeometry(0.49, 0.49);
    blobGeo.rotateX(-Math.PI / 2);
    blobMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      visible: false,
    });
    islandBlobs = new THREE.InstancedMesh(blobGeo, blobMat, islandCapsCount);
    islandGroup.add(islandBlobs);
  }

  let idx = 0;
  const capY = isRealistic ? 0.338 : 0.32;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * 0.51 + (r % 2) * 0.08;
      const z = (r - (rows - 1) / 2) * 0.62;
      SCRATCH_VEC3_A.set(x, capY, z);
      SCRATCH_QUAT.identity();
      SCRATCH_VEC3_B.set(1, 1, 1);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      islandCaps.setMatrixAt(idx, SCRATCH_MAT4);

      if (islandLegends) {
        SCRATCH_VEC3_A.set(x, 0.446, z);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        islandLegends.setMatrixAt(idx, SCRATCH_MAT4);
      }
      if (islandBlobs) {
        SCRATCH_VEC3_A.set(x, 0.232, z);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        islandBlobs.setMatrixAt(idx, SCRATCH_MAT4);
      }
      idx++;
    }
  }
  islandCaps.instanceMatrix.needsUpdate = true;
  islandCaps.computeBoundingSphere();
  islandGroup.add(islandCaps);
  if (islandLegends) islandLegends.instanceMatrix.needsUpdate = true;
  if (islandBlobs) islandBlobs.instanceMatrix.needsUpdate = true;

  // Floating Orbiting Keycaps (InstancedMesh -> 1 draw call; 1 extra legend draw call in Realistic)
  const orbitCount = Math.max(12, Math.round(28 * ctx.preset.particleScale));
  const orbitKeyGeo = isRealistic
    ? (() => {
        const g = new THREE.ExtrudeGeometry(createRoundedRectShape(0.42, 0.42, 0.07), {
          depth: 0.16,
          bevelEnabled: true,
          bevelThickness: 0.045,
          bevelSize: 0.045,
          bevelSegments: consts.keycapBevelSegments,
        });
        g.rotateX(-Math.PI / 2);
        g.center();
        return g;
      })()
    : (() => {
        const g = new THREE.CylinderGeometry(0.24, 0.31, 0.26, 4);
        g.rotateY(Math.PI / 4);
        return g;
      })();

  const orbitKeyMat = isRealistic
    ? new THREE.MeshPhysicalMaterial({
        color: palette.isDark ? 0x1e293b : 0xf1f5f9,
        emissive: palette.accentSecondary,
        emissiveIntensity: palette.isDark ? 0.22 : 0.12,
        roughness: 0.26,
        metalness: 0.25,
        clearcoat: 0.94,
        clearcoatRoughness: 0.08,
      })
    : new THREE.MeshStandardMaterial({
        color: palette.isDark ? 0x1e293b : 0xf1f5f9,
        emissive: palette.accentSecondary,
        emissiveIntensity: palette.isDark ? 0.35 : 0.18,
        roughness: 0.32,
        metalness: 0.35,
      });

  const orbitCaps = new THREE.InstancedMesh(orbitKeyGeo, orbitKeyMat, orbitCount);
  orbitCaps.frustumCulled = false;
  orbitCaps.castShadow = isRealistic && ctx.preset.shadows;
  scene.add(orbitCaps);

  const orbitLegends =
    isRealistic && legendAtlas
      ? createLegendDecalInstancedMesh(orbitCount, legendAtlas, 0.88)
      : null;
  if (orbitLegends) {
    scene.add(orbitLegends);
  }

  const particles: OrbitKeyParticle[] = [];
  for (let i = 0; i < orbitCount; i++) {
    particles.push({
      radius: 4.8 + (i % 5) * 1.15 + Math.random() * 0.6,
      angle: (i / orbitCount) * Math.PI * 2,
      speed: (i % 2 === 0 ? 1 : -1) * (0.08 + (i % 4) * 0.03),
      yOffset: -1.4 + ((i * 0.73) % 4.2),
      bobPhase: i * 0.9,
      rotSpeedX: 0.2 + (i % 3) * 0.12,
      rotSpeedY: 0.3 + (i % 5) * 0.1,
      scale: 0.65 + (i % 4) * 0.22,
    });
  }

  // Deep ambient star specks (1 draw call)
  const starCount = Math.max(40, Math.round(110 * ctx.preset.particleScale));
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 28;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 14;
    starPositions[i * 3 + 2] = -2 - Math.random() * 14;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: palette.accent,
    size: isRealistic ? 0.08 : 0.09,
    transparent: true,
    opacity: palette.isDark ? 0.45 : 0.25,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  let postPipeline: ManagedPostPipeline | null = null;
  if (isRealistic && ctx.preset.postEffects) {
    const realisticOpts = graphicsModeService.getSnapshot().persistedState.realisticOptions;
    postPipeline = createPostPipeline(renderer, scene, camera, {
      width,
      height,
      pixelRatio: managed.pixelRatio,
      multisampleSamples: ctx.preset.multisampleSamples,
      enableBloom: true,
      enableVignette: true,
      enableDof: realisticOpts.hubDof,
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
      deckMat.normalMap = pbr.metalNormal;
      deckMat.roughnessMap = pbr.metalRoughness;
      deckMat.needsUpdate = true;

      islandKeyMat.normalMap = pbr.keycapNormal;
      islandKeyMat.roughnessMap = pbr.keycapRoughness;
      islandKeyMat.needsUpdate = true;

      orbitKeyMat.normalMap = pbr.keycapNormal;
      orbitKeyMat.roughnessMap = pbr.keycapRoughness;
      orbitKeyMat.needsUpdate = true;

      if (blobMat) {
        blobMat.map = pbr.contactShadowBlob;
        blobMat.color.setHex(0xffffff);
        blobMat.visible = true;
        blobMat.needsUpdate = true;
      }
    });
  }

  // Pointer parallax targets
  let pointerNx = 0;
  let pointerNy = 0;
  let camOffsetX = 0;
  let camOffsetY = 0;

  const onPointerMove = (e: PointerEvent) => {
    if (ctx.calmMode) return;
    pointerNx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    pointerNy = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
  };
  window.addEventListener('pointermove', onPointerMove, {passive: true});

  const updateTransforms = (elapsed: number) => {
    const t = ctx.calmMode ? 0 : elapsed;

    if (!ctx.calmMode) {
      islandGroup.position.y = Math.sin(t * 0.7) * 0.14;
      islandGroup.rotation.y = -0.18 + Math.sin(t * 0.28) * 0.08;
      haloRing.rotation.z = t * 0.16;
      stars.rotation.y = t * 0.025;
    }

    for (let i = 0; i < orbitCount; i++) {
      const p = particles[i];
      const ang = p.angle + t * p.speed;
      const x = Math.cos(ang) * p.radius;
      const z = Math.sin(ang) * (p.radius * 0.58) - 1.2;
      const y = p.yOffset + Math.sin(t * 0.9 + p.bobPhase) * (ctx.calmMode ? 0 : 0.25);

      SCRATCH_VEC3_A.set(x, y, z);
      SCRATCH_EULER.set(t * p.rotSpeedX + i * 0.4, t * p.rotSpeedY + i * 0.7, 0.2);
      SCRATCH_QUAT.setFromEuler(SCRATCH_EULER);
      SCRATCH_VEC3_B.set(p.scale, p.scale, p.scale);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      orbitCaps.setMatrixAt(i, SCRATCH_MAT4);

      if (orbitLegends) {
        // Offset along rotated keycap +Y surface normal (0, 0.132 * scale, 0)
        const upOffset = 0.132 * p.scale;
        SCRATCH_VEC3_A.set(0, upOffset, 0).applyQuaternion(SCRATCH_QUAT).add(
          SCRATCH_VEC3_B.set(x, y, z),
        );
        SCRATCH_VEC3_B.set(p.scale * 1.15, p.scale * 1.15, p.scale * 1.15);
        SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
        orbitLegends.setMatrixAt(i, SCRATCH_MAT4);
      }
    }
    orbitCaps.instanceMatrix.needsUpdate = true;
    if (orbitLegends) orbitLegends.instanceMatrix.needsUpdate = true;

    const targetX = ctx.calmMode ? 0 : pointerNx * 1.15;
    const targetY = ctx.calmMode ? 0 : -pointerNy * 0.65;
    camOffsetX += (targetX - camOffsetX) * 0.06;
    camOffsetY += (targetY - camOffsetY) * 0.06;

    camera.position.set(camOffsetX, 4.2 + camOffsetY, 13.5);
    camera.lookAt(camOffsetX * 0.2, 0.15, 0);
  };

  const renderFrame = (dtSec?: number) => {
    if (postPipeline) {
      postPipeline.render(dtSec);
    } else {
      renderer.render(scene, camera);
    }
  };

  updateTransforms(0);
  renderFrame(0.016);

  const loop = createCappedLoop({
    targetFps: ctx.calmMode ? 20 : ctx.preset.sceneFrameCap || 40,
    isSoftwareGl: ctx.probe.isSoftwareGl,
    onSampleDtMs: ctx.onFrameDtMs,
    onFrame(dtSec, elapsedSec) {
      updateTransforms(elapsedSec);
      renderFrame(dtSec);
    },
  });
  loop.start();

  return {
    resize(w: number, h: number) {
      managed.resize(w, h, camera, 46);
      postPipeline?.setSize(w, h, managed.pixelRatio);
      renderFrame(0.016);
    },
    dispose() {
      disposed = true;
      loop.stop();
      window.removeEventListener('pointermove', onPointerMove);
      if (postPipeline) {
        postPipeline.dispose();
        postPipeline = null;
      }
      if (legendAtlas) {
        legendAtlas.dispose();
        legendAtlas = null;
      }
      if (acquiredPbrSize) {
        releaseSessionPbrTextures(acquiredPbrSize);
        acquiredPbrSize = null;
      }
      managed.dispose();
    },
  };
}
