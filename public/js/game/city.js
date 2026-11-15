import { GroundType, applyCrosswalks, tileValue, valueToTilesetIndex } from "./autotile.js";
import { MAP_COLS, MAP_ROWS, isInsideMap, relativeToTile } from "./geometry.js";
const NONE = -1;
export class CityModel {
    constructor(file, defs) {
        this.ground = new Int8Array(MAP_COLS * MAP_ROWS).fill(NONE);
        this.items = [];
        this.missingDefinitions = [];
        if (file.format !== "mcity-html5-city/1")
            throw new Error(`unsupported city format ${file.format}`);
        for (const [rx, ry] of file.terrain)
            this.setGround(rx, ry, GroundType.Terrain);
        for (const [rx, ry] of file.roads)
            this.setGround(rx, ry, GroundType.Road);
        for (const it of file.items) {
            const def = defs.get(it.sku);
            if (!def) {
                this.missingDefinitions.push(it.sku);
                continue;
            }
            const t = relativeToTile(it.x, it.y);
            this.items.push({ sid: it.sid, sku: it.sku, tileX: t.x, tileY: t.y, def, state: it.state });
        }
    }
    setGround(rx, ry, type) {
        const t = relativeToTile(rx, ry);
        if (isInsideMap(t.x, t.y))
            this.ground[t.y * MAP_COLS + t.x] = type;
    }
    groundAt(tx, ty) {
        return isInsideMap(tx, ty) ? this.ground[ty * MAP_COLS + tx] : NONE;
    }
    // Map data values per cell (row-major); 0 marks cells without terrain or road.
    tileValues() {
        const out = new Int16Array(MAP_COLS * MAP_ROWS);
        for (let y = 0; y < MAP_ROWS; y++) {
            for (let x = 0; x < MAP_COLS; x++) {
                const type = this.groundAt(x, y);
                if (type === NONE)
                    continue;
                const same = (dx, dy) => this.groundAt(x + dx, y + dy) === type;
                const nb = {
                    n: same(0, -1), s: same(0, 1), e: same(1, 0), w: same(-1, 0),
                    ne: same(1, -1), nw: same(-1, -1), se: same(1, 1), sw: same(-1, 1),
                };
                out[y * MAP_COLS + x] = tileValue(type, nb);
            }
        }
        applyCrosswalks(out, MAP_COLS, MAP_ROWS);
        return out;
    }
    // Tileset index per cell (row-major), -1 for cells that show the background.
    tileIndices() {
        return this.tileValues().map(valueToTilesetIndex);
    }
}
// URL parameter `city` -> data file. The converted original NPC cities keep their own names (npc_boss, npc_advisor);
// anything else is data/city_<name>.json, and no or an invalid name is the player's city.
export function cityDataFile(name) {
    if (!name || !/^[a-z0-9_]+$/i.test(name))
        return "data/city.json";
    return name.startsWith("npc_") ? `data/${name}.json` : `data/city_${name}.json`;
}
//# sourceMappingURL=city.js.map