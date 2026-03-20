import type { WeaponId } from "../core/types";

export class SoundManager {
  private context: AudioContext | null = null;

  touch(): void {
    const context = this.getContext();

    void context.resume().catch(() => {
      // Ignore resume failures from autoplay restrictions until the next interaction.
    });
  }

  playUiClick(): void {
    this.playTone(680, 0.045, "triangle", 0.018);
  }

  playPurchase(): void {
    this.playTone(440, 0.08, "triangle", 0.03);
    this.playTone(660, 0.08, "triangle", 0.022, 0.06);
  }

  playFire(weaponId: WeaponId): void {
    const pitch = {
      basicShell: 120,
      heavyShell: 90,
      multiShot: 160,
      airStrike: 74
    }[weaponId];
    const gain = weaponId === "heavyShell" ? 0.06 : 0.045;

    this.playTone(pitch, 0.12, "sawtooth", gain);
  }

  playExplosion(): void {
    this.playTone(84, 0.16, "square", 0.055);
    this.playTone(48, 0.2, "triangle", 0.028, 0.03);
  }

  private playTone(
    frequency: number,
    durationSeconds: number,
    type: OscillatorType,
    gainValue: number,
    startOffsetSeconds = 0
  ): void {
    const context = this.getContext();
    const startTime = context.currentTime + startOffsetSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + durationSeconds + 0.02);
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }

    return this.context;
  }
}
