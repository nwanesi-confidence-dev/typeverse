import React from 'react';
import {ThreeCanvasHost} from '@/src/three/ThreeCanvasHost';
import type {BeatTyper3DState} from '@/src/three/scenes/beatTyper3DScene';
import type {GraphicsGameId, ResolvedGraphicsMode} from '@/src/types/app';

const loadBeatTyper3DScene = () =>
  import('@/src/three/scenes/beatTyper3DScene');

interface BeatTyper3DProps {
  gameId: GraphicsGameId;
  forcedMode: ResolvedGraphicsMode;
  retryNonce?: number;
  onContextLostPermanent?: () => void;
  sceneState: BeatTyper3DState;
  bpm: number;
  totalNotes: number;
  hud: {
    resolvedCount: number;
    perfects: number;
    score: number;
    judgement: '' | 'PERFECT!' | 'GOOD' | 'MISS';
  };
}

export const BeatTyper3D: React.FC<BeatTyper3DProps> = ({
  gameId,
  forcedMode,
  retryNonce,
  onContextLostPermanent,
  sceneState,
  bpm,
  totalNotes,
  hud,
}) => (
  <div className="relative w-full h-[360px] bg-[#070A18]">
    <ThreeCanvasHost
      loadScene={loadBeatTyper3DScene}
      sceneKey="beat-typer-3d"
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
        backgroundColor: 'rgba(7, 10, 24, 0.88)',
        borderColor: 'var(--tv-border)',
        color: '#E2E8F0',
      }}
    >
      {bpm} BPM · NOTES {hud.resolvedCount}/{totalNotes} · PERFECT {hud.perfects} · SCORE {hud.score}
    </div>
    {hud.judgement && (
      <div
        className="pointer-events-none absolute top-3 right-3 z-10 rounded-lg border px-3 py-1 font-display text-xs font-extrabold tracking-wider"
        style={{
          backgroundColor: 'rgba(7, 10, 24, 0.88)',
          borderColor:
            hud.judgement === 'PERFECT!'
              ? '#22D3EE'
              : hud.judgement === 'GOOD'
                ? '#34D399'
                : '#FB7185',
          color:
            hud.judgement === 'PERFECT!'
              ? '#22D3EE'
              : hud.judgement === 'GOOD'
                ? '#34D399'
                : '#FB7185',
        }}
      >
        {hud.judgement}
      </div>
    )}
  </div>
);
