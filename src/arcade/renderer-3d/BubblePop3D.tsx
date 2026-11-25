import React, {useRef} from 'react';
import {usePlayfieldSafeInsets} from '@/src/arcade/usePlayfieldSize';
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
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const safe = usePlayfieldSafeInsets(wrapperRef);

  return (
    <div ref={wrapperRef} className="relative w-full h-full min-h-[200px] bg-[#0B132B]">
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
        className="pointer-events-none absolute z-10 rounded-lg border px-3 py-1.5 font-typing text-xs font-bold tracking-wide tabular-nums max-w-[calc(100%-24px)] truncate"
        style={{
          top: `${safe.topPx}px`,
          left: `${safe.leftPx}px`,
          backgroundColor: 'rgba(11, 19, 43, 0.88)',
          borderColor: 'var(--tv-border)',
          color: '#E2E8F0',
        }}
      >
        LIVES {'●'.repeat(Math.max(0, hud.lives))} · POPPED {hud.popped}/{goal} · SCORE {hud.score}
      </div>
    </div>
  );
};
