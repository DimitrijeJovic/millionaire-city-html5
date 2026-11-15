export function frameAt(clip, elapsedMs) {
    if (clip.frames <= 1 || elapsedMs <= 0)
        return 0;
    const index = Math.floor((elapsedMs * clip.fps) / 1000);
    return clip.loop ? index % clip.frames : Math.min(index, clip.frames - 1);
}
export function clipDurationMs(clip) {
    return (clip.frames * 1000) / clip.fps;
}
//# sourceMappingURL=animation.js.map