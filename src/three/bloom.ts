import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import type {RenderSpec3D} from '@/src/graphics/decision';

export interface SceneRenderPipeline {
  render: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * Lightweight half-res bloom pipeline used ONLY in 3D Full mode.
 * Software WebGL and 3D Light render directly with zero composer overhead.
 */
export function createSceneRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  preset: RenderSpec3D,
  probe: {isSoftwareGl: boolean},
  options?: {
    strength?: number;
    radius?: number;
    threshold?: number;
  },
): SceneRenderPipeline {
  if (!preset.bloom || probe.isSoftwareGl) {
    return {
      render: () => renderer.render(scene, camera),
      resize: () => {},
      dispose: () => {},
    };
  }

  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(Math.max(1, size.x), Math.max(1, size.y));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Half-resolution bloom pass keeps fillrate low on 1366x768 & HiDPI displays
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(
      Math.max(64, Math.floor(size.x * 0.5)),
      Math.max(64, Math.floor(size.y * 0.5)),
    ),
    options?.strength ?? 0.36,
    options?.radius ?? 0.35,
    options?.threshold ?? 0.84,
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return {
    render: () => composer.render(),
    resize: (width: number, height: number) => {
      const safeW = Math.max(1, width);
      const safeH = Math.max(1, height);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(safeW, safeH);
      bloomPass.resolution.set(
        Math.max(64, Math.floor(safeW * 0.5)),
        Math.max(64, Math.floor(safeH * 0.5)),
      );
    },
    dispose: () => {
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
    },
  };
}
