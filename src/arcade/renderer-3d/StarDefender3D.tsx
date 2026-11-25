import React, {useRef} from 'react';
import {usePlayfieldSafeInsets} from '@/src/arcade/usePlayfieldSize';
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
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const safe = usePlayfieldSafeInsets(wrapperRef);

  return (
    <div ref={wrapperRef} className="relative w-full h-full min-h-[200px] bg-[#040714]">
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
        className="pointer-events-none absolute z-10 rounded-lg border px-3 py-1.5 font-typing text-xs font-bold tracking-wide tabular-nums max-w-[calc(100%-24px)] truncate"
        style={{
          top: `${safe.topPx}px`,
          left: `${safe.leftPx}px`,
          backgroundColor: 'rgba(4, 7, 20, 0.88)',
          borderColor: 'var(--tv-border)',
          color: '#E2E8F0',
        }}
      >
        SHIELDS {'♥'.repeat(Math.max(0, hud.shields))} · WAVE {hud.wave} · CLEARED {hud.clears}/{targetClears} · SCORE {hud.score}
      </div>
    </div>
  );
};
