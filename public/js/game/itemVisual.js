export function itemVisual(item, art) {
    if (item.def.isAnimated && art.frames > 1)
        return { kind: "loop", clip: { frames: art.frames, fps: art.fps, loop: true } };
    return { kind: "static", frame: 0 };
}
// Draw order: items whose footprint ends lower on the map are drawn later.
export function itemDepth(item) {
    return (item.tileY + item.def.baseRows) * 1000 + item.tileX;
}
//# sourceMappingURL=itemVisual.js.map