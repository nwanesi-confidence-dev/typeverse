import React from 'react';
import {ThreeCanvasHost} from '@/src/three/ThreeCanvasHost';
import type {TurboRacer3DState} from '@/src/three/scenes/turboRacer3DScene';
import type {GraphicsGameId, ResolvedGraphicsMode} from '@/src/types/app';

const loadTurboRacer3DScene = () =>
  import('@/src/three/scenes/turboRacer3DScene');

interface TurboRacer3DProps {
  gameId: GraphicsGameId;
  forcedMode: ResolvedGraphicsMode;
  retryNonce?: number;
  onContextLostPermanent?: () => void;
  sceneState: TurboRacer3DState;
  hud: {
    rank: number;
    currentWordNumber: number;
    totalWords: number;
    score: number;
  };
}

export const TurboRacer3D: React.FC<TurboRacer3DProps> = ({
  gameId,
  forcedMode,
  retryNonce,
  onContextLostPermanent,
  sceneState,
  hud,
}) => (
  <div className="relative w-full h-64 sm:h-72 bg-[#070B18]">
    <ThreeCanvasHost
      loadScene={loadTurboRacer3DScene}
      sceneKey="turbo-racer-3d"
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
        backgroundColor: 'rgba(7, 11, 24, 0.88)',
        borderColor: 'var(--tv-border)',
        color: '#E2E8F0',
      }}
    >
      POS {hud.rank}/4 · WORD {hud.currentWordNumber}/{hud.totalWords} · SCORE {hud.score}
    </div>
  </div>
);
