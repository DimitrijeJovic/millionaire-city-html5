// Time-based frame selection: the frame shown depends only on elapsed time, never on render rate.
export interface AnimationClip {
  frames: number;
  fps: number;
  loop: boolean;
}

export function frameAt(clip: AnimationClip, elapsedMs: number): number {
  if (clip.frames <= 1 || elapsedMs <= 0) return 0;
  const index = Math.floor((elapsedMs * clip.fps) / 1000);
  return clip.loop ? index % clip.frames : Math.min(index, clip.frames - 1);
}

export function clipDurationMs(clip: AnimationClip): number {
  return (clip.frames * 1000) / clip.fps;
}
