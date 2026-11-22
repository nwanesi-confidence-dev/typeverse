import * as THREE from 'three';
import type {KeyAggregateMetric} from '@/src/types/app';
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
import type {LazyThreeMountContext, LazyThreeSceneHandle} from '@/src/three/ThreeCanvasHost';

export const HEATMAP_ROWS_3D: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
];

export interface Heatmap3DState {
  keyMetrics: Record<string, KeyAggregateMetric>;
  metricView: 'speed' | 'accuracy';
  selectedKeys: string[];
  hoveredKey: string | null;
  onHoverKey?: (key: string | null) => void;
  onToggleKey?: (key: string) => void;
}

interface FlatKeyEntry {
  key: string;
  row: number;
  col: number;
  x: number;
  z: number;
  currentHeight: number;
  targetHeight: number;
}

const ATLAS_COLS = 8;
const ATLAS_ROWS = 6;
const CELL_PX = 128;

/**
 * 3D Keyboard Height Map:
 * Key column height scales with key weakness (higher latency or more errors = taller pedestal).
 * Uses 1 InstancedMesh for all 45 key columns + 1 combined key-face atlas geometry = ~3 draw calls total.
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
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 7.6, 8.2);
  camera.lookAt(0, 0.55, 0.25);
  fitPerspectiveCamera(camera, width, height, 40);

  const hemi = new THREE.HemisphereLight(0xffffff, palette.surface, 1.0);
  scene.add(hemi);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.45);
  dirLight.position.set(5, 11, 6);
  scene.add(dirLight);

  // Dark keyboard deck tray
  const trayGeo = new THREE.BoxGeometry(11.8, 0.28, 4.4);
  const trayMat = new THREE.MeshStandardMaterial({
    color: palette.surface,
    roughness: 0.5,
    metalness: 0.3,
  });
  const trayMesh = new THREE.Mesh(trayGeo, trayMat);
  trayMesh.position.set(0, -0.14, 0.12);
  scene.add(trayMesh);

  // Flatten keys
  const keys: FlatKeyEntry[] = [];
  HEATMAP_ROWS_3D.forEach((row, rIdx) => {
    const rowWidth = row.length * 0.88;
    const xStart = -rowWidth / 2 + 0.44 + rIdx * 0.16;
    const z = (rIdx - 1.5) * 0.92;
    row.forEach((k, cIdx) => {
      keys.push({
        key: k,
        row: rIdx,
        col: cIdx,
        x: xStart + cIdx * 0.88,
        z,
        currentHeight: 0.24,
        targetHeight: 0.24,
      });
    });
  });

  // 1) Extruded 3D columns via InstancedMesh (origin shifted so bottom sits at y=0)
  const colGeo = new THREE.BoxGeometry(0.76, 1, 0.76);
  colGeo.translate(0, 0.5, 0);
  const colMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0.22,
  });
  const columns = new THREE.InstancedMesh(colGeo, colMat, keys.length);
  columns.frustumCulled = false;
  scene.add(columns);

  // 2) Canvas atlas for top faces (key letter + metric printed crisply)
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_COLS * CELL_PX;
  atlasCanvas.height = ATLAS_ROWS * CELL_PX;
  const atlasCtx = atlasCanvas.getContext('2d')!;
  const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  // 3) Combined Plane tops so key faces float right on top of each key column in 1 draw call
  const faceCount = keys.length;
  const positions = new Float32Array(faceCount * 4 * 3);
  const normals = new Float32Array(faceCount * 4 * 3);
  const uvs = new Float32Array(faceCount * 4 * 2);
  const indices = new Uint16Array(faceCount * 6);

  const half = 0.35;
  for (let i = 0; i < faceCount; i++) {
    const k = keys[i];
    const aCol = i % ATLAS_COLS;
    const aRow = Math.floor(i / ATLAS_COLS);
    const u0 = aCol / ATLAS_COLS;
    const u1 = (aCol + 1) / ATLAS_COLS;
    const v1 = 1 - aRow / ATLAS_ROWS;
    const v0 = 1 - (aRow + 1) / ATLAS_ROWS;

    const vBase = i * 4;
    // Top-left, top-right, bottom-right, bottom-left on XZ plane
    positions.set(
      [
        k.x - half, k.currentHeight + 0.012, k.z - half,
        k.x + half, k.currentHeight + 0.012, k.z - half,
        k.x + half, k.currentHeight + 0.012, k.z + half,
        k.x - half, k.currentHeight + 0.012, k.z + half,
      ],
      vBase * 3,
    );
    for (let n = 0; n < 4; n++) {
      normals.set([0, 1, 0], (vBase + n) * 3);
    }
    uvs.set([u0, v1, u1, v1, u1, v0, u0, v0], vBase * 2);

    const iBase = i * 6;
    indices.set(
      [vBase, vBase + 2, vBase + 1, vBase, vBase + 3, vBase + 2],
      iBase,
    );
  }

  const faceGeo = new THREE.BufferGeometry();
  const facePosAttr = new THREE.BufferAttribute(positions, 3);
  facePosAttr.setUsage(THREE.DynamicDrawUsage);
  faceGeo.setAttribute('position', facePosAttr);
  faceGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  faceGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  faceGeo.setIndex(new THREE.BufferAttribute(indices, 1));

  const faceMat = new THREE.MeshBasicMaterial({
    map: atlasTexture,
    transparent: true,
  });
  const facesMesh = new THREE.Mesh(faceGeo, faceMat);
  scene.add(facesMesh);

  let currentState: Heatmap3DState = {
    keyMetrics: {},
    metricView: 'speed',
    selectedKeys: [],
    hoveredKey: null,
  };

  const computeWeaknessAndTone = (
    k: string,
    state: Heatmap3DState,
  ): {height: number; hex: number; labelSub: string; badgeHex: string} => {
    const stat = state.keyMetrics[k];
    if (!stat || stat.hits + stat.errors === 0) {
      return {
        height: 0.22,
        hex: palette.isDark ? 0x1e293b : 0xcbd5e1,
        labelSub: '--',
        badgeHex: palette.isDark ? '#94A3B8' : '#334155',
      };
    }

    const total = stat.hits + stat.errors;
    const acc = (stat.hits / total) * 100;
    const errRate = stat.errors / total;
    const avgMs = stat.hits > 0 ? Math.round(stat.totalLatencyMs / stat.hits) : 450;

    // Height = weakness (slower latency or higher error rate means taller pillar!)
    const latencyScore = Math.min(1, Math.max(0, (avgMs - 110) / 340));
    const errorScore = Math.min(1, errRate * 4.5);
    const weakness =
      state.metricView === 'speed'
        ? Math.max(latencyScore, errorScore * 0.75)
        : Math.max(errorScore, latencyScore * 0.35);

    const h = 0.28 + weakness * 1.95;

    if (state.metricView === 'speed') {
      if (avgMs <= 165) return {height: h, hex: 0x10b981, labelSub: `${avgMs}ms`, badgeHex: '#A7F3D0'};
      if (avgMs <= 260) return {height: h, hex: 0x06b6d4, labelSub: `${avgMs}ms`, badgeHex: '#A5F3FC'};
      if (avgMs <= 360) return {height: h, hex: 0xf59e0b, labelSub: `${avgMs}ms`, badgeHex: '#FDE68A'};
      return {height: h, hex: 0xf43f5e, labelSub: `${avgMs}ms`, badgeHex: '#FECDD3'};
    }

    if (acc >= 97) return {height: h, hex: 0x10b981, labelSub: `${Math.round(acc)}%`, badgeHex: '#A7F3D0'};
    if (acc >= 92) return {height: h, hex: 0xf59e0b, labelSub: `${Math.round(acc)}%`, badgeHex: '#FDE68A'};
    return {height: h, hex: 0xf43f5e, labelSub: `${Math.round(acc)}%`, badgeHex: '#FECDD3'};
  };

  const redrawAtlasAndTargets = (state: Heatmap3DState) => {
    atlasCtx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);

    for (let i = 0; i < keys.length; i++) {
      const entry = keys[i];
      const info = computeWeaknessAndTone(entry.key, state);
      const isSelected = state.selectedKeys.includes(entry.key);
      const isHovered = state.hoveredKey === entry.key;

      entry.targetHeight = info.height + (isSelected ? 0.14 : 0) + (isHovered ? 0.08 : 0);

      SCRATCH_COLOR.setHex(info.hex);
      if (isSelected || isHovered) {
        SCRATCH_COLOR.offsetHSL(0, 0.05, 0.14);
      }
      columns.setColorAt(i, SCRATCH_COLOR);

      // Draw cell in atlas
      const aCol = i % ATLAS_COLS;
      const aRow = Math.floor(i / ATLAS_COLS);
      const cx = aCol * CELL_PX;
      const cy = aRow * CELL_PX;

      if (isSelected || isHovered) {
        atlasCtx.strokeStyle = isSelected ? '#FFFFFF' : '#22D3EE';
        atlasCtx.lineWidth = 8;
        atlasCtx.strokeRect(cx + 8, cy + 8, CELL_PX - 16, CELL_PX - 16);
      }

      atlasCtx.textAlign = 'center';
      atlasCtx.textBaseline = 'middle';
      atlasCtx.font = '700 44px ui-monospace, Menlo, Consolas, monospace';
      atlasCtx.fillStyle = palette.isDark || info.hex !== 0xcbd5e1 ? '#F8FAFC' : '#0F172A';
      atlasCtx.fillText(entry.key.toUpperCase(), cx + CELL_PX / 2, cy + 48);

      atlasCtx.font = '600 24px ui-monospace, Menlo, Consolas, monospace';
      atlasCtx.fillStyle = info.badgeHex;
      atlasCtx.fillText(info.labelSub, cx + CELL_PX / 2, cy + 92);
    }

    if (columns.instanceColor) columns.instanceColor.needsUpdate = true;
    atlasTexture.needsUpdate = true;
  };

  const syncGeometryHeights = (instant: boolean) => {
    let moving = false;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (instant) {
        k.currentHeight = k.targetHeight;
      } else {
        const diff = k.targetHeight - k.currentHeight;
        if (Math.abs(diff) > 0.004) {
          k.currentHeight += diff * 0.18;
          moving = true;
        } else {
          k.currentHeight = k.targetHeight;
        }
      }

      SCRATCH_VEC3_A.set(k.x, 0, k.z);
      SCRATCH_QUAT.identity();
      SCRATCH_VEC3_B.set(1, k.currentHeight, 1);
      SCRATCH_MAT4.compose(SCRATCH_VEC3_A, SCRATCH_QUAT, SCRATCH_VEC3_B);
      columns.setMatrixAt(i, SCRATCH_MAT4);

      const yTop = k.currentHeight + 0.012;
      const vBase = i * 4;
      positions[vBase * 3 + 1] = yTop;
      positions[(vBase + 1) * 3 + 1] = yTop;
      positions[(vBase + 2) * 3 + 1] = yTop;
      positions[(vBase + 3) * 3 + 1] = yTop;
    }
    columns.instanceMatrix.needsUpdate = true;
    facePosAttr.needsUpdate = true;
    return moving;
  };

  // Raycasting for pointer hover + click-to-toggle key
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let camAngleX = 0;
  let camAngleTarget = 0;

  const pickKeyAtEvent = (e: PointerEvent): string | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(columns, false);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      return keys[hits[0].instanceId]?.key ?? null;
    }
    return null;
  };

  const onPointerMove = (e: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!ctx.calmMode && rect.width > 0) {
      camAngleTarget = ((e.clientX - rect.left) / rect.width - 0.5) * 0.32;
    }
    const picked = pickKeyAtEvent(e);
    if (picked !== currentState.hoveredKey) {
      currentState.hoveredKey = picked;
      renderer.domElement.style.cursor = picked && currentState.onToggleKey ? 'pointer' : 'default';
      currentState.onHoverKey?.(picked);
      redrawAtlasAndTargets(currentState);
    }
  };

  const onPointerLeave = () => {
    camAngleTarget = 0;
    if (currentState.hoveredKey !== null) {
      currentState.hoveredKey = null;
      renderer.domElement.style.cursor = 'default';
      currentState.onHoverKey?.(null);
      redrawAtlasAndTargets(currentState);
    }
  };

  const onClick = (e: MouseEvent) => {
    const picked = pickKeyAtEvent(e as unknown as PointerEvent);
    if (picked) {
      currentState.onToggleKey?.(picked);
    }
  };

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('click', onClick);

  redrawAtlasAndTargets(currentState);
  syncGeometryHeights(true);
  renderer.render(scene, camera);

  const loop = createCappedLoop({
    targetFps: ctx.preset.sceneFrameCap || 40,
    isSoftwareGl: ctx.probe.isSoftwareGl,
    onSampleDtMs: ctx.onFrameDtMs,
    onFrame() {
      syncGeometryHeights(ctx.calmMode);
      camAngleX += (camAngleTarget - camAngleX) * 0.08;
      camera.position.x = Math.sin(camAngleX) * 8.2;
      camera.position.z = Math.cos(camAngleX) * 8.2;
      camera.lookAt(0, 0.55, 0.25);
      renderer.render(scene, camera);
    },
  });
  loop.start();

  return {
    updateState(nextState: unknown) {
      if (!nextState || typeof nextState !== 'object') return;
      currentState = nextState as Heatmap3DState;
      redrawAtlasAndTargets(currentState);
    },
    resize(w: number, h: number) {
      managed.resize(w, h, camera, 40);
      renderer.render(scene, camera);
    },
    dispose() {
      loop.stop();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('click', onClick);
      atlasTexture.dispose();
      managed.dispose();
    },
  };
}
