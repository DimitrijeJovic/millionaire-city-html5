// Maps the original sound ids (DollarsGame.loadingInitSoundManager) to files and suppresses accidental
// double playback of the same effect inside a short window.
export const SoundId = {
  Build: "Build_Sound",
  Destroy: "Destroy_Sound",
  Contract: "Contract_Sound",
  Level: "Level_Sound",
  Income: "Income_Sound",
  MainMusic: "Main_Music",
  TutorialMusic: "Tutorail_Music",
  RonaldMusic: "Ronald_Music",
} as const;
export type SoundId = (typeof SoundId)[keyof typeof SoundId];

export const SOUND_FILES: Record<SoundId, string> = {
  Build_Sound: "build.mp3",
  Destroy_Sound: "bulldoze.mp3",
  Contract_Sound: "contract.mp3",
  Level_Sound: "levelup.mp3",
  Income_Sound: "money.mp3",
  Main_Music: "main.mp3",
  Tutorail_Music: "tutorial2.mp3",
  Ronald_Music: "tycoon.mp3",
};

export const MUSIC: ReadonlySet<SoundId> = new Set([SoundId.MainMusic, SoundId.TutorialMusic, SoundId.RonaldMusic]);

export interface SoundBackend {
  play(id: SoundId, loop: boolean): void;
  stop(id: SoundId): void;
}

export class AudioEvents {
  private lastPlayed = new Map<SoundId, number>();
  private currentMusic: SoundId | null = null;
  sfxEnabled = true;
  musicEnabled = true;

  constructor(private readonly backend: SoundBackend, private readonly now: () => number, private readonly dedupeMs = 80) {}

  sfx(id: SoundId): boolean {
    if (!this.sfxEnabled || MUSIC.has(id)) return false;
    const t = this.now();
    const last = this.lastPlayed.get(id);
    if (last !== undefined && t - last < this.dedupeMs) return false;
    this.lastPlayed.set(id, t);
    this.backend.play(id, false);
    return true;
  }

  music(id: SoundId | null): void {
    if (id === this.currentMusic) return;
    if (this.currentMusic) this.backend.stop(this.currentMusic);
    this.currentMusic = id;
    if (id && this.musicEnabled) this.backend.play(id, true);
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    const id = this.currentMusic;
    if (!id) return;
    if (on) this.backend.play(id, true);
    else this.backend.stop(id);
  }
}
