// Zoom behaviour of the original (OptionsPanel): discrete levels, animated by ZOOM_STEP = 0.05 per
// 25 fps frame, i.e. 1.25 zoom units per second. The original levels end at 0.4; phase 8 adds two further steps
// down to ToolsBar.ZOOM_MIN = 0.25 (the original's lowest zoom constant). 0.3 is the step chosen between them.
export const ORIGINAL_ZOOM_LEVELS = [1, 0.75, 0.5, 0.4];
export const ZOOM_MIN = 0.25;
export const ZOOM_LEVELS = [...ORIGINAL_ZOOM_LEVELS, 0.3, ZOOM_MIN];
export const ZOOM_RATE_PER_SECOND = 0.05 * 25;
export class ZoomController {
    constructor() {
        this.index = 0;
        this.current = ZOOM_LEVELS[0];
    }
    get target() {
        return ZOOM_LEVELS[this.index];
    }
    zoomIn() {
        this.index = Math.max(0, this.index - 1);
    }
    zoomOut() {
        this.index = Math.min(ZOOM_LEVELS.length - 1, this.index + 1);
    }
    update(deltaMs) {
        if (this.current === this.target)
            return false;
        const step = (ZOOM_RATE_PER_SECOND * deltaMs) / 1000;
        const diff = this.target - this.current;
        this.current = Math.abs(diff) <= step ? this.target : this.current + Math.sign(diff) * step;
        return true;
    }
}
// Allowed range of the view's centre on one axis. A map larger than the view keeps the view inside it (Map.onZoom).
// When the whole map fits, the original centres it and nothing can be dragged; here the map can still be dragged
// as long as it stays entirely in the view (a desktop deviation, needed at the zoom levels added in phase 8).
export function centreRange(view, map) {
    if (view < map)
        return [view / 2, map - view / 2];
    return [map - view / 2, view / 2];
}
export function clampCentre(centre, view, map) {
    const [lo, hi] = centreRange(view, map);
    return Math.min(Math.max(centre, lo), hi);
}
//# sourceMappingURL=camera.js.map