import React from 'react';
import {ThreeCanvasHost} from '@/src/three/ThreeCanvasHost';
import type {BubblePop3DState} from '@/src/three/scenes/bubblePop3DScene';
import type {GraphicsGameId, ResolvedGraphicsMode} from '@/src/types/app';

const loadBubblePop3DScene = () =>
  import('@/src/three/scenes/bubblePop3DScene');

interface BubblePop3DProps {
  gameId: GraphicsGameId;
  forcedMode: ResolvedGraphicsMode;
  retryNonce?: number;
  onContextLostPermanent?: () => void;
  sceneState: BubblePop3DState;
  goal: number;
  hud: {
    lives: number;
    popped: number;
    score: number;
  };
}

export const BubblePop3D: React.FC<BubblePop3DProps> = ({
  gameId,
  forcedMode,
  retryNonce,
  onContextLostPermanent,
  sceneState,
  goal,
  hud,
}) => (
  <div className="relative w-full h-[360px] bg-[#0B132B]">
    <ThreeCanvasHost
      loadScene={loadBubblePop3DScene}
      sceneKey="bubble-pop-3d"
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
        backgroundColor: 'rgba(11, 19, 43, 0.88)',
        borderColor: 'var(--tv-border)',
        color: '#E2E8F0',
      }}
    >
      LIVES {'●'.repeat(Math.max(0, hud.lives))} · POPPED {hud.popped}/{goal} · SCORE {hud.score}
    </div>
  </div>
);
