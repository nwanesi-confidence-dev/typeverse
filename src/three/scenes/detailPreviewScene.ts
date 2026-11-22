import * as THREE from 'three';
import {
  computeRenderResolution,
  getDetailConstants,
  REALISTIC_VISUAL_TUNING,
} from '@/src/graphics/detail';
import {buildRenderSpecForMode, modeFromDetail3D} from '@/src/graphics/decision';
import {
  addRealisticStudioLights,
  disposeThreeScene,
  fitPerspectiveCamera,
  getOrCreateSessionEnvironment,
  readThemePalette3D,
} from '@/src/three/core';
import {createPostPipeline, type ManagedPostPipeline} from '@/src/three/postPipeline';
import {
  acquireSessionPbrTextures,
  type ProceduralPbrTextureSet,
} from '@/src/three/proceduralTextures';
import type {GraphicsDetailLevel, RealisticOptions} from '@/src/types/app';

export interface DetailPreviewStats {
  fps: number;
  triangles: number;
  drawCalls: number;
  renderWidth: number;
  renderHeight: number;
}

export interface DetailPreviewHandle {
  setDetail: (detail: GraphicsDetailLevel, realisticOptions: RealisticOptions) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

function createStarShape(outerR: number, innerR: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

function createRoundedKeycapShape(w: number, d: number, radius: number): THREE.Shape {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const r = Math.min(radius, hw * 0.4, hd * 0.4);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return shape;
}

function createKeycapLegendTexture(letter: string, accentHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(18, 18, 220, 220);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 132px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export async function mountDetailPreviewScene(options: {
  container: HTMLElement;
  initialDetail: GraphicsDetailLevel;
  realisticOptions: RealisticOptions;
  onStats: (stats: DetailPreviewStats) => void;
}): Promise<DetailPreviewHandle> {
  const {container, onStats} = options;
  const palette = readThemePalette3D();
  const accentCss = '#' + palette.accent.toString(16).padStart(6, '0');

  let currentDetail = options.initialDetail;
  let currentRealisticOpts = options.realisticOptions;
  let disposed = false;

  const width = Math.max(240, container.clientWidth || 480);
  const height = Math.max(180, container.clientHeight || 280);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = REALISTIC_VISUAL_TUNING.toneMappingExposure;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b15);

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
  camera.position.set(0, 2.2, 6.4);
  camera.lookAt(0, 0.65, 0);
  fitPerspectiveCamera(camera, width, height, 40);

  let pbrSet: ProceduralPbrTextureSet | null = null;
  let postPipeline: ManagedPostPipeline | null = null;
  const legendTex = createKeycapLegendTexture('T', accentCss);

  const showcaseGroup = new THREE.Group();
  scene.add(showcaseGroup);

  const buildSceneTier = async (
    detail: GraphicsDetailLevel,
    realisticOpts: RealisticOptions,
  ) => {
    if (disposed) return;
    currentDetail = detail;
    currentRealisticOpts = realisticOpts;

    const resolved = modeFromDetail3D(detail);
    const spec = buildRenderSpecForMode(resolved, realisticOpts);
    const consts = getDetailConstants(detail);

    if (postPipeline) {
      postPipeline.dispose();
      postPipeline = null;
    }

    // Clear old scene children safely (preserve legendTex via shared userData flag)
    legendTex.userData = {sharedSessionTexture: true};
    scene.remove(showcaseGroup);
    disposeThreeScene(scene);
    showcaseGroup.clear();
    scene.add(showcaseGroup);

    const cssW = Math.max(240, container.clientWidth || width);
    const cssH = Math.max(180, container.clientHeight || height);
    const res = computeRenderResolution({
      cssWidth: cssW,
      cssHeight: cssH,
      devicePixelRatio: window.devicePixelRatio || 1,
      resolvedMode: resolved,
      realisticOptions: realisticOpts,
    });
    renderer.setPixelRatio(res.pixelRatio);
    renderer.setSize(cssW, cssH, false);
    renderer.shadowMap.enabled = spec.shadows;
    if (spec.shadows) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    if (spec.useEnvironment) {
      scene.environment = getOrCreateSessionEnvironment(renderer, detail === 'realistic');
      if ('environmentIntensity' in scene) {
        scene.environmentIntensity =
          detail === 'realistic'
            ? REALISTIC_VISUAL_TUNING.darkEnvIntensity
            : 0.65;
      }
    } else {
      scene.environment = null;
    }

    scene.fog = spec.fog ? new THREE.FogExp2(0x070b15, 0.045) : null;

    if (detail === 'realistic' && !pbrSet) {
      pbrSet = await acquireSessionPbrTextures(renderer, 512);
      if (disposed || currentDetail !== 'realistic') return;
    }

    // Lighting per tier
    if (detail === 'light') {
      const hemi = new THREE.HemisphereLight(0xf1f5f9, 0x0f172a, 0.95);
      const dir = new THREE.DirectionalLight(0xfff4d6, 1.3);
      dir.position.set(4, 6, 5);
      scene.add(hemi, dir);
    } else {
      addRealisticStudioLights(scene, {
        shadows: spec.shadows,
        accentColor: palette.accent,
        surfaceColor: 0x0f172a,
        shadowExtent: 4.5,
      });
    }

    // Stage floor / plinth disk
    const stageGeo = new THREE.CylinderGeometry(3.2, 3.4, 0.24, consts.latheSegments);
    const stageMat =
      detail === 'realistic' && pbrSet
        ? new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            metalness: 0.55,
            roughness: 0.42,
            normalMap: pbrSet.metalNormal,
            roughnessMap: pbrSet.metalRoughness,
          })
        : new THREE.MeshStandardMaterial({
            color: 0x162033,
            metalness: 0.35,
            roughness: 0.55,
          });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = -0.14;
    stage.receiveShadow = spec.shadows;
    showcaseGroup.add(stage);

    // Trophy (left-of-center)
    const trophyMat =
      detail === 'realistic' && pbrSet
        ? new THREE.MeshPhysicalMaterial({
            color: 0xfbbf24,
            metalness: 0.92,
            roughness: 0.2,
            normalMap: pbrSet.metalNormal,
            roughnessMap: pbrSet.metalRoughness,
            clearcoat: 0.85,
            clearcoatRoughness: 0.12,
            emissive: 0x78350f,
            emissiveIntensity: 0.14,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            metalness: detail === 'full' ? 0.88 : 0.65,
            roughness: detail === 'full' ? 0.24 : 0.42,
          });

    const trophy = new THREE.Group();
    const cupPts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.62, 0.0),
      new THREE.Vector2(0.58, 0.16),
      new THREE.Vector2(0.24, 0.36),
      new THREE.Vector2(0.16, 0.82),
      new THREE.Vector2(0.68, 1.48),
      new THREE.Vector2(0.74, 1.88),
      new THREE.Vector2(0.64, 1.92),
      new THREE.Vector2(0.55, 1.54),
      new THREE.Vector2(0.0, 1.15),
    ];
    const cup = new THREE.Mesh(new THREE.LatheGeometry(cupPts, consts.latheSegments), trophyMat);
    cup.castShadow = spec.shadows;
    cup.receiveShadow = spec.shadows;
    trophy.add(cup);

    const handleGeo = new THREE.TorusGeometry(
      0.3,
      0.055,
      detail === 'light' ? 8 : detail === 'full' ? 14 : 24,
      consts.latheSegments,
      Math.PI * 1.1,
    );
    const hLeft = new THREE.Mesh(handleGeo, trophyMat);
    hLeft.position.set(-0.62, 1.46, 0);
    hLeft.rotation.z = Math.PI * 0.45;
    hLeft.castShadow = spec.shadows;
    const hRight = new THREE.Mesh(handleGeo, trophyMat);
    hRight.position.set(0.62, 1.46, 0);
    hRight.rotation.z = -Math.PI * 0.55;
    hRight.rotation.y = Math.PI;
    hRight.castShadow = spec.shadows;
    trophy.add(hLeft, hRight);

    const starGeo = new THREE.ExtrudeGeometry(createStarShape(0.28, 0.13), {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: consts.keycapBevelSegments,
    });
    starGeo.center();
    const trophyStar = new THREE.Mesh(starGeo, trophyMat);
    trophyStar.position.set(0, 2.22, 0);
    trophyStar.castShadow = spec.shadows;
    trophy.add(trophyStar);

    trophy.position.set(-1.12, 0, 0.1);
    showcaseGroup.add(trophy);

    // Keycap (right-of-center)
    const keycapGroup = new THREE.Group();
    const keyGeo = new THREE.ExtrudeGeometry(createRoundedKeycapShape(1.38, 1.38, 0.18), {
      depth: 0.62,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: consts.keycapBevelSegments,
    });
    keyGeo.rotateX(-Math.PI / 2);
    keyGeo.center();

    const keyMat =
      detail === 'realistic' && pbrSet
        ? new THREE.MeshPhysicalMaterial({
            color: palette.surface,
            metalness: 0.12,
            roughness: 0.34,
            normalMap: pbrSet.keycapNormal,
            roughnessMap: pbrSet.keycapRoughness,
            clearcoat: 0.92,
            clearcoatRoughness: 0.09,
          })
        : detail === 'full'
          ? new THREE.MeshPhysicalMaterial({
              color: palette.surface,
              metalness: 0.1,
              roughness: 0.36,
              clearcoat: 0.75,
              clearcoatRoughness: 0.14,
            })
          : new THREE.MeshStandardMaterial({
              color: palette.surface,
              metalness: 0.1,
              roughness: 0.5,
            });

    const keyMesh = new THREE.Mesh(keyGeo, keyMat);
    keyMesh.position.y = 0.42;
    keyMesh.castShadow = spec.shadows;
    keyMesh.receiveShadow = spec.shadows;
    keycapGroup.add(keyMesh);

    // Glowing emissive underglow skirt + crisp legend cap
    const glowRingGeo = new THREE.BoxGeometry(1.42, 0.06, 1.42);
    const glowRingMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: detail === 'realistic' ? 1.85 : detail === 'full' ? 1.15 : 0.45,
      roughness: 0.25,
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.position.y = 0.04;
    keycapGroup.add(glowRing);

    const capTopGeo = new THREE.PlaneGeometry(0.95, 0.95);
    const capTopMat = new THREE.MeshBasicMaterial({map: legendTex});
    const capTop = new THREE.Mesh(capTopGeo, capTopMat);
    capTop.rotation.x = -Math.PI / 2;
    capTop.position.y = 0.84;
    keycapGroup.add(capTop);

    keycapGroup.position.set(1.18, 0.12, 0.1);
    showcaseGroup.add(keycapGroup);

    if (detail === 'realistic' && spec.postEffects) {
      postPipeline = createPostPipeline(renderer, scene, camera, {
        width: cssW,
        height: cssH,
        pixelRatio: res.pixelRatio,
        multisampleSamples: spec.multisampleSamples,
        enableBloom: true,
        enableVignette: true,
      });
    }
  };

  await buildSceneTier(currentDetail, currentRealisticOpts);

  let rafId = 0;
  let lastTime = performance.now();
  let accumMs = 0;
  let frames = 0;

  const tick = (now: number) => {
    if (disposed) return;
    const dtMs = now - lastTime;
    lastTime = now;
    const t = now * 0.001;

    showcaseGroup.rotation.y = Math.sin(t * 0.45) * 0.48 + 0.18;

    if (postPipeline) {
      postPipeline.render(dtMs * 0.001);
    } else {
      renderer.render(scene, camera);
    }

    if (dtMs > 0 && dtMs < 500) {
      accumMs += dtMs;
      frames += 1;
      if (accumMs >= 420) {
        const fps = Math.round((frames * 1000) / accumMs);
        const buf = new THREE.Vector2();
        renderer.getDrawingBufferSize(buf);
        onStats({
          fps,
          triangles: renderer.info.render.triangles,
          drawCalls: renderer.info.render.calls,
          renderWidth: Math.round(buf.x),
          renderHeight: Math.round(buf.y),
        });
        accumMs = 0;
        frames = 0;
      }
    }

    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  return {
    setDetail(nextDetail, nextOpts) {
      void buildSceneTier(nextDetail, nextOpts);
    },
    resize(w, h) {
      const cssW = Math.max(240, w);
      const cssH = Math.max(180, h);
      const resolved = modeFromDetail3D(currentDetail);
      const res = computeRenderResolution({
        cssWidth: cssW,
        cssHeight: cssH,
        devicePixelRatio: window.devicePixelRatio || 1,
        resolvedMode: resolved,
        realisticOptions: currentRealisticOpts,
      });
      renderer.setPixelRatio(res.pixelRatio);
      renderer.setSize(cssW, cssH, false);
      fitPerspectiveCamera(camera, cssW, cssH, 40);
      postPipeline?.setSize(cssW, cssH, res.pixelRatio);
    },
    dispose() {
      disposed = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (postPipeline) {
        postPipeline.dispose();
        postPipeline = null;
      }
      disposeThreeScene(scene);
      legendTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
