import type { AssetBundle } from '../assets/AssetBundle.ts';

/** Plays extracted sound effects by cache ID. Silent until enabled (browsers need a user gesture first). */
export class SoundPlayer {
  enabled = false;
  volume = 0.5;
  private readonly cache = new Map<number, HTMLAudioElement>();

  constructor(private readonly bundle: AssetBundle | null) {}

  play(soundId: number): void {
    if (!this.enabled || !this.bundle) return;
    let audio = this.cache.get(soundId);
    if (!audio) {
      const url = this.bundle.sound(soundId);
      if (!url) return;
      audio = new Audio(url);
      this.cache.set(soundId, audio);
    }
    const voice = audio.cloneNode() as HTMLAudioElement;
    voice.volume = this.volume;
    void voice.play().catch(() => {});
  }
}
