import React from 'react';
import {ThreeCanvasHost} from '@/src/three/ThreeCanvasHost';
import type {StarDefender3DState} from '@/src/three/scenes/starDefender3DScene';
import type {GraphicsGameId, ResolvedGraphicsMode} from '@/src/types/app';

const loadStarDefender3DScene = () =>
  import('@/src/three/scenes/starDefender3DScene');

interface StarDefender3DProps {
  gameId: GraphicsGameId;
  forcedMode: ResolvedGraphicsMode;
  retryNonce?: number;
  onContextLostPermanent?: () => void;
  sceneState: StarDefender3DState;
  targetClears: number;
  hud: {
    shields: number;
    wave: number;
    clears: number;
    score: number;
  };
}

export const StarDefender3D: React.FC<StarDefender3DProps> = ({
  gameId,
  forcedMode,
  retryNonce,
  onContextLostPermanent,
  sceneState,
  targetClears,
  hud,
}) => (
  <div className="relative w-full h-[360px] bg-[#040714]">
    <ThreeCanvasHost
      loadScene={loadStarDefender3DScene}
      sceneKey="star-defender-3d"
      gameId={gameId}
      forcedMode={forcedMode}
      retryNonce={retryNonce}
      onContextLostPermanent={onContextLostPermanent}
      sceneState={sceneState}
      isTypingActive={true}
      className="w-full h-full pointer-events-none"
    />
    <div
      className="pointer-events-none absolute top-3 left-3 z-10 rounded-lg border px-3 py-1.5 font-typing text-xs font-bold tracking-wide tabular-nums"
      style={{
        backgroundColor: 'rgba(4, 7, 20, 0.88)',
        borderColor: 'var(--tv-border)',
        color: '#E2E8F0',
      }}
    >
      SHIELDS {'♥'.repeat(Math.max(0, hud.shields))} · WAVE {hud.wave} · CLEARED {hud.clears}/{targetClears} · SCORE {hud.score}
    </div>
  </div>
);
