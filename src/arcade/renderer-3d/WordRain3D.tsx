import React, {useRef} from 'react';
import {usePlayfieldSafeInsets} from '@/src/arcade/usePlayfieldSize';
import {ThreeCanvasHost} from '@/src/three/ThreeCanvasHost';
import type {WordRain3DState} from '@/src/three/scenes/wordRain3DScene';
import type {GraphicsGameId, ResolvedGraphicsMode} from '@/src/types/app';

const loadWordRain3DScene = () => import('@/src/three/scenes/wordRain3DScene');

interface WordRain3DProps {
  gameId: GraphicsGameId;
  forcedMode: ResolvedGraphicsMode;
  retryNonce?: number;
  onContextLostPermanent?: () => void;
  sceneState: WordRain3DState;
  goal: number;
  hud: {
    lives: number;
    clears: number;
    score: number;
  };
}

export const WordRain3D: React.FC<WordRain3DProps> = ({
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
    <div ref={wrapperRef} className="relative w-full h-full min-h-[200px] bg-[#071226]">
      <ThreeCanvasHost
        loadScene={loadWordRain3DScene}
        sceneKey="word-rain-3d"
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
          backgroundColor: 'rgba(7, 18, 38, 0.88)',
          borderColor: 'var(--tv-border)',
          color: '#E2E8F0',
        }}
      >
        LIVES {'♦'.repeat(Math.max(0, hud.lives))} · DROPS {hud.clears}/{goal} · SCORE {hud.score}
      </div>
    </div>
  );
};
