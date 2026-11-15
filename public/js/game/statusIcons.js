// TopLayer.logicUpdate: every status icon strip (75 x 75 frames) shares one clock that steps through
// TopLayer.mAnimation, frames 0-1-2-3-2-1 shown for 150/130/130/150/130/130 ms.
export const ICON_FRAME_SIZE = 75;
const SEQUENCE = [[0, 150], [1, 130], [2, 130], [3, 150], [2, 130], [1, 130]];
const CYCLE_MS = SEQUENCE.reduce((t, [, ms]) => t + ms, 0);
export function iconFrameAt(elapsedMs) {
    let t = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
    for (const [frame, ms] of SEQUENCE) {
        if (t < ms)
            return frame;
        t -= ms;
    }
    return 0;
}
// StateOnRent.setAnimationPosition: the 75 x 75 icon is centred on the item's base.
export function iconTopLeft(worldX, worldY, baseWidth, baseHeight) {
    return [worldX + (baseWidth - ICON_FRAME_SIZE) / 2, worldY + (baseHeight - ICON_FRAME_SIZE) / 2];
}
//# sourceMappingURL=statusIcons.js.map