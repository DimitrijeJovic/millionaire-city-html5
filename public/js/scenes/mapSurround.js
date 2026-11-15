// Fills the space around the background when the map is smaller than the view (the zoom levels added in phase 8,
// or a wide window): every row and column of the map's outer band is averaged, smoothed and stretched outwards,
// so the grass and the sea continue past the edges instead of the white stage. Not in the original, whose lowest
// zoom on its 760 x 600 stage never showed the stage around the map.
export const SURROUND_BAND_PX = 48;
export const SURROUND_SMOOTH_PX = 40;
// Far enough for a 4K window at the lowest zoom with the map dragged to one side.
export const SURROUND_EXTENT_PX = 16000;
// Average colour of each line across a band of an RGBA image (rows: one value per row over the first or last
// `band` columns; cols: one value per column over the first or last `band` rows), then a moving average.
export function edgeProfile(px, w, h, side, band = SURROUND_BAND_PX, smooth = SURROUND_SMOOTH_PX) {
    const rows = side === "left" || side === "right";
    const n = rows ? h : w;
    const depth = Math.max(1, Math.min(band, rows ? w : h));
    const raw = [];
    for (let i = 0; i < n; i++) {
        let r = 0, g = 0, b = 0;
        for (let d = 0; d < depth; d++) {
            const x = rows ? (side === "left" ? d : w - 1 - d) : i;
            const y = rows ? i : side === "top" ? d : h - 1 - d;
            const o = (y * w + x) * 4;
            r += px[o];
            g += px[o + 1];
            b += px[o + 2];
        }
        raw.push([r / depth, g / depth, b / depth]);
    }
    const out = [];
    for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - smooth), hi = Math.min(n - 1, i + smooth);
        const acc = [0, 0, 0];
        for (let j = lo; j <= hi; j++)
            for (let k = 0; k < 3; k++)
                acc[k] += raw[j][k];
        out.push(acc.map((v) => Math.round(v / (hi - lo + 1))));
    }
    return out;
}
// Draws the four stretched strips and the four corners below the background (depth -3).
export function addMapSurround(scene, tiles, size) {
    const [bw, bh] = size;
    const band = document.createElement("canvas");
    band.width = bw;
    band.height = bh;
    const ctx = band.getContext("2d", { willReadFrequently: true });
    if (!ctx)
        return;
    for (const t of tiles) {
        const img = scene.textures.get(t.key).getSourceImage();
        ctx.drawImage(img, Math.round(t.x), Math.round(t.y));
    }
    let data;
    try {
        data = ctx.getImageData(0, 0, bw, bh);
    }
    catch {
        return;
    }
    const E = SURROUND_EXTENT_PX;
    const strip = (side) => {
        const prof = edgeProfile(data.data, bw, bh, side);
        const rows = side === "left" || side === "right";
        const key = "surround:" + side;
        if (scene.textures.exists(key))
            scene.textures.remove(key);
        const tex = scene.textures.createCanvas(key, rows ? 1 : prof.length, rows ? prof.length : 1);
        if (!tex)
            return prof;
        const c = tex.getContext();
        prof.forEach(([r, g, b], i) => {
            c.fillStyle = `rgb(${r},${g},${b})`;
            c.fillRect(rows ? 0 : i, rows ? i : 0, 1, 1);
        });
        tex.refresh();
        const x = side === "left" ? -E : side === "right" ? bw : 0;
        const y = side === "top" ? -E : side === "bottom" ? bh : 0;
        scene.add.image(x, y, key).setOrigin(0, 0).setDisplaySize(rows ? E : bw, rows ? bh : E).setDepth(-3);
        return prof;
    };
    const left = strip("left"), right = strip("right");
    strip("top");
    strip("bottom");
    const corner = (x, y, [r, g, b]) => scene.add.rectangle(x, y, E, E, (r << 16) | (g << 8) | b).setOrigin(0, 0).setDepth(-3);
    corner(-E, -E, left[0]);
    corner(bw, -E, right[0]);
    corner(-E, bh, left[left.length - 1]);
    corner(bw, bh, right[right.length - 1]);
}
//# sourceMappingURL=mapSurround.js.map