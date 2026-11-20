class SoundEngine {
  private ctx: AudioContext | null = null;
  private volume = 0.65;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setVolume(volumePercent: number): void {
    this.volume = Math.max(0, Math.min(1, volumePercent / 100));
  }

  public playKeyClick(pitchShift = 0): void {
    if (this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 520 + pitchShift * 18;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.032);

    gain.gain.setValueAtTime(0.08 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.038);
  }

  public playError(): void {
    if (this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.linearRampToValueAtTime(115, now + 0.09);

    gain.gain.setValueAtTime(0.09 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.105);
  }

  public playUiTap(): void {
    if (this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.03);

    gain.gain.setValueAtTime(0.05 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playMilestone(): void {
    if (this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    const now = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.08 * this.volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    });
  }

  public playLaser(): void {
    if (this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.09);

    gain.gain.setValueAtTime(0.06 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playBubblePop(pitchIndex = 0): void {
    if (this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const startFreq = 340 + (pitchIndex % 8) * 45;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 2.1, now + 0.055);

    gain.gain.setValueAtTime(0.08 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playBeatTick(accent: boolean): void {
    if (this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = accent ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(accent ? 150 : 420, now);
    osc.frequency.exponentialRampToValueAtTime(accent ? 52 : 240, now + 0.045);

    gain.gain.setValueAtTime((accent ? 0.12 : 0.045) * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playHitChime(quality: 'perfect' | 'good' | 'miss'): void {
    if (this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = quality === 'miss' ? 'sawtooth' : 'triangle';
    const freq = quality === 'perfect' ? 987.77 : quality === 'good' ? 740 : 160;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(
      quality === 'miss' ? 95 : freq * 1.18,
      now + 0.075,
    );

    gain.gain.setValueAtTime(0.07 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }
}

export const soundEngine = new SoundEngine();
