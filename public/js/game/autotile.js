// Port of Map.getTileTerrainForm and Background.build tile selection.
export const GroundType = { Terrain: 0, Road: 1, Grass: 2 };
// Map.mTileOffsets, indexed by ground type.
const TILE_OFFSETS = { 0: 14, 1: 62, 2: 1 };
export function terrainForm(nb) {
    const { n, s, e, w, ne, nw, se, sw } = nb;
    if (e) {
        if (w) {
            if (n) {
                if (s) {
                    if (nw) {
                        if (ne)
                            return se ? (sw ? 4 : 29) : sw ? 32 : 28;
                        return se ? (sw ? 30 : 45) : sw ? 26 : 41;
                    }
                    if (ne)
                        return se ? (sw ? 31 : 25) : sw ? 46 : 44;
                    return se ? (sw ? 27 : 43) : sw ? 42 : 16;
                }
                if (nw)
                    return ne ? 7 : 35;
                return ne ? 39 : 19;
            }
            if (s) {
                if (sw)
                    return se ? 1 : 40;
                return se ? 36 : 20;
            }
            return 10;
        }
        if (n) {
            if (s) {
                if (ne)
                    return se ? 3 : 34;
                return se ? 38 : 18;
            }
            return ne ? 6 : 23;
        }
        if (s)
            return se ? 0 : 21;
        return 12;
    }
    if (w) {
        if (n) {
            if (s) {
                if (nw)
                    return sw ? 5 : 33;
                return sw ? 37 : 17;
            }
            return nw ? 8 : 24;
        }
        if (s)
            return sw ? 2 : 22;
        return 11;
    }
    if (n)
        return s ? 9 : 14;
    return s ? 13 : 15;
}
// Map data value of a cell (Map.buildTerrain): form plus the ground type's offset.
export function tileValue(type, nb) {
    return terrainForm(nb) + TILE_OFFSETS[type];
}
// Background.build draws value - 1 from tileset.png (16 columns of 32 px); index 0 clears the cell.
export function valueToTilesetIndex(value) {
    return value <= 1 ? -1 : value - 1;
}
const CROSSWALK_ACROSS_ROW = 2;
const CROSSWALK_ACROSS_COLUMN = 3;
const FORM_STRAIGHT_VERTICAL = 9;
const FORM_STRAIGHT_HORIZONTAL = 10;
// Map.checkCrossWalk: straight road cells next to a junction get zebra crossings. The original handles
// the 4-way form (16) and the T forms 17, 19 and 20; form 18 (open to the west only) gets none.
export function applyCrosswalks(values, cols, rows) {
    const road = TILE_OFFSETS[GroundType.Road];
    const form = (i) => values[i] - road;
    const mark = (i, expected, value) => {
        if (i >= 0 && i < values.length && form(i) === expected)
            values[i] = value;
    };
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const f = form(i);
            const west = () => mark(i - 1, FORM_STRAIGHT_HORIZONTAL, CROSSWALK_ACROSS_ROW);
            const east = () => mark(i + 1, FORM_STRAIGHT_HORIZONTAL, CROSSWALK_ACROSS_ROW);
            const north = () => mark(i - cols, FORM_STRAIGHT_VERTICAL, CROSSWALK_ACROSS_COLUMN);
            const south = () => mark(i + cols, FORM_STRAIGHT_VERTICAL, CROSSWALK_ACROSS_COLUMN);
            if (f === 16) {
                west();
                east();
                north();
                south();
            }
            else if (f === 17) {
                west();
                north();
                south();
            }
            else if (f === 19) {
                east();
                west();
                north();
            }
            else if (f === 20) {
                west();
                east();
                south();
            }
        }
    }
}
//# sourceMappingURL=autotile.js.map