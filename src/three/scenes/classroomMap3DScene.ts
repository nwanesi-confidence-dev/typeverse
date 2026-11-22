import * as THREE from 'three';
import {
  createCappedLoop,
  createManagedRenderer,
  readThemePalette3D,
  SCRATCH_COLOR,
} from '@/src/three/core';
import type {LazyThreeMountContext, LazyThreeSceneHandle} from '@/src/three/ThreeCanvasHost';

export interface StageIslandData {
  stageId: number;
  title: string;
  unlocked: boolean;
  starsEarned: number;
  starsMax: number;
}

export interface ClassroomMap3DState {
  stages: StageIslandData[];
  selectedStageId: number;
  onSelectStage?: (stageId: number) => void;
}

interface IslandNode {
  stageId: number;
  group: THREE.Group;
  hitTarget: THREE.Mesh;
  capMat: THREE.MeshStandardMaterial;
  haloMesh: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  starGroup: THREE.Group;
  baseY: number;
  phase: number;
}

/**
 * 3D Isometric Lesson Map:
 * 8 floating terrain islands connected along an arched winding sky-path.
 * Clicking an island selects that curriculum stage.
 */
export function mountScene(ctx: LazyThreeMountContext): LazyThreeSceneHandle {
  const palette = readThemePalette3D();
  const managed = createManagedRenderer(ctx.container, ctx.preset, {
    alpha: true,
    useEnvironment: ctx.preset.tier !== 'low',
    clearAlpha: 0,
  });
  const {renderer, scene} = managed;

  const width = Math.max(1, ctx.container.clientWidth);
  const height = Math.max(1, ctx.container.clientHeight);
  const frustumHalf = 4.6;
  const aspect = Math.max(1, width / Math.max(1, height));
  const camera = new THREE.OrthographicCamera(
    -frustumHalf * aspect,
    frustumHalf * aspect,
    frustumHalf,
    -frustumHalf,
    0.1,
    100,
  );

  // Classic isometric angle (~35.264 deg pitch, 45 deg yaw) framing all 8 horizontal islands
  camera.position.set(11, 10.5, 13.5);
  camera.lookAt(0, 0.2, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, palette.surface, 1.0);
  scene.add(hemi);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
  dirLight.position.set(8, 14, 9);
  scene.add(dirLight);
  const accentLight = new THREE.PointLight(palette.accent, 2.0, 28, 1.4);
  accentLight.position.set(0, 4.5, 2);
  scene.add(accentLight);

  const archipelago = new THREE.Group();
  // Slight yaw so horizontal progression fills landscape 240px banner cleanly
  archipelago.rotation.y = -0.32;
  scene.add(archipelago);

  // Shared island geometries
  const baseConeGeo = new THREE.CylinderGeometry(0.95, 0.36, 0.9, 6);
  const capGeo = new THREE.CylinderGeometry(1.02, 0.96, 0.24, 6);
  const haloGeo = new THREE.RingGeometry(1.12, 1.26, 6);
  const starGeo = new THREE.OctahedronGeometry(0.16, 0);

  const rockMat = new THREE.MeshStandardMaterial({
    color: palette.isDark ? 0x1e293b : 0x64748b,
    roughness: 0.78,
    metalness: 0.12,
    flatShading: true,
  });
  const starMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.75,
  });

  const nodes: IslandNode[] = [];
  const curvePoints: THREE.Vector3[] = [];
  const hitTargets: THREE.Mesh[] = [];

  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const x = (t - 0.5) * 14.5;
    const z = Math.sin(t * Math.PI * 2.1) * 1.65;
    const baseY = Math.sin(t * Math.PI) * 0.45 - 0.1;
    curvePoints.push(new THREE.Vector3(x, baseY + 0.15, z));

    const group = new THREE.Group();
    group.position.set(x, baseY, z);
    archipelago.add(group);

    const underRock = new THREE.Mesh(baseConeGeo, rockMat);
    underRock.position.y = -0.45;
    group.add(underRock);

    const capMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      roughness: 0.35,
      metalness: 0.25,
      flatShading: true,
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.y = 0.08;
    capMesh.userData.stageId = i + 1;
    group.add(capMesh);
    hitTargets.push(capMesh);

    const haloMat = new THREE.MeshBasicMaterial({
      color: palette.accent,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.rotation.z = Math.PI / 6;
    haloMesh.position.y = 0.22;
    haloMesh.visible = false;
    group.add(haloMesh);

    // 3 orbiting mini-crystal star markers above island (visibility toggled per stage progress)
    const starGroup = new THREE.Group();
    starGroup.position.y = 0.65;
    for (let s = 0; s < 3; s++) {
      const m = new THREE.Mesh(starGeo, starMat);
      m.position.set((s - 1) * 0.34, s === 1 ? 0.14 : 0, 0);
      m.visible = false;
      starGroup.add(m);
    }
    group.add(starGroup);

    nodes.push({
      stageId: i + 1,
      group,
      hitTarget: capMesh,
      capMat,
      haloMesh,
      haloMat,
      starGroup,
      baseY,
      phase: i * 0.85,
    });
  }

  // Luminous bridge path connecting all 8 islands
  const bridgeCurve = new THREE.CatmullRomCurve3(curvePoints);
  const bridgeGeo = new THREE.TubeGeometry(bridgeCurve, 64, 0.075, 6, false);
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: palette.accent,
    emissive: palette.accent,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    transparent: true,
    opacity: 0.65,
  });
  const bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
  archipelago.add(bridgeMesh);

  let currentState: ClassroomMap3DState = {
    stages: [],
    selectedStageId: 1,
  };
  let hoveredStageId: number | null = null;

  const syncVisualState = () => {
    for (const node of nodes) {
      const meta = currentState.stages.find((s) => s.stageId === node.stageId);
      const unlocked = meta?.unlocked ?? node.stageId === 1;
      const isSelected = currentState.selectedStageId === node.stageId;
      const isHovered = hoveredStageId === node.stageId;
      const completedAll = meta ? meta.starsEarned >= meta.starsMax && meta.starsMax > 0 : false;

      if (completedAll) {
        SCRATCH_COLOR.setHex(palette.success);
      } else if (isSelected) {
        SCRATCH_COLOR.setHex(palette.accent);
      } else if (unlocked) {
        SCRATCH_COLOR.setHex(palette.accentSecondary);
      } else {
        SCRATCH_COLOR.setHex(palette.isDark ? 0x334155 : 0x94a3b8);
      }

      node.capMat.color.copy(SCRATCH_COLOR);
      node.capMat.emissive.copy(SCRATCH_COLOR);
      node.capMat.emissiveIntensity = isSelected ? 0.55 : isHovered ? 0.35 : unlocked ? 0.18 : 0.02;

      node.haloMesh.visible = isSelected || isHovered;
      node.haloMat.color.setHex(isSelected ? palette.accent : palette.text);
      node.haloMat.opacity = isSelected ? 0.85 : 0.45;

      const starTier =
        !meta || meta.starsEarned <= 0
          ? 0
          : meta.starsEarned >= meta.starsMax
            ? 3
            : meta.starsEarned >= Math.ceil(meta.starsMax * 0.5)
              ? 2
              : 1;
      node.starGroup.children.forEach((child, idx) => {
        child.visible = idx < starTier;
      });

      const scaleTarget = isSelected ? 1.18 : isHovered ? 1.09 : 1.0;
      node.group.scale.setScalar(scaleTarget);
    }
  };

  // Interactive island picking
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const pickStage = (e: PointerEvent): number | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitTargets, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.stageId;
      return typeof id === 'number' ? id : null;
    }
    return null;
  };

  const onPointerMove = (e: PointerEvent) => {
    const picked = pickStage(e);
    if (picked !== hoveredStageId) {
      hoveredStageId = picked;
      renderer.domElement.style.cursor = picked ? 'pointer' : 'default';
      syncVisualState();
    }
  };

  const onPointerLeave = () => {
    if (hoveredStageId !== null) {
      hoveredStageId = null;
      renderer.domElement.style.cursor = 'default';
      syncVisualState();
    }
  };

  const onClick = (e: MouseEvent) => {
    const picked = pickStage(e as unknown as PointerEvent);
    if (picked !== null) {
      currentState.onSelectStage?.(picked);
    }
  };

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('click', onClick);

  const resizeOrtho = (w: number, h: number) => {
    const safeH = Math.max(1, h);
    const safeW = Math.max(1, w);
    const a = safeW / safeH;
    // Scale frustum cleanly on narrow viewports so all 8 islands always fit without clipping
    const halfH = a < 3.4 ? frustumHalf * (3.4 / Math.max(1.4, a)) : frustumHalf;
    camera.left = -halfH * a;
    camera.right = halfH * a;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    managed.resize(safeW, safeH);
  };

  resizeOrtho(width, height);
  syncVisualState();
  renderer.render(scene, camera);

  const loop = createCappedLoop({
    targetFps: ctx.calmMode ? 20 : ctx.preset.sceneFrameCap || 40,
    isSoftwareGl: ctx.probe.isSoftwareGl,
    onSampleDtMs: ctx.onFrameDtMs,
    onFrame(_dt, elapsed) {
      const t = ctx.calmMode ? 0 : elapsed;
      for (const node of nodes) {
        const selectedBoost = node.stageId === currentState.selectedStageId ? 0.34 : 0;
        node.group.position.y =
          node.baseY + selectedBoost + (ctx.calmMode ? 0 : Math.sin(t * 1.4 + node.phase) * 0.12);
        if (!ctx.calmMode) {
          node.starGroup.rotation.y = t * 1.1 + node.phase;
        }
      }
      renderer.render(scene, camera);
    },
  });
  loop.start();

  return {
    updateState(next: unknown) {
      if (!next || typeof next !== 'object') return;
      currentState = next as ClassroomMap3DState;
      syncVisualState();
    },
    resize(w: number, h: number) {
      resizeOrtho(w, h);
      renderer.render(scene, camera);
    },
    dispose() {
      loop.stop();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('click', onClick);
      managed.dispose();
    },
  };
}
