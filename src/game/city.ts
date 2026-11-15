import { GroundType, Neighbours, applyCrosswalks, tileValue, valueToTilesetIndex } from "./autotile.js";
import { ItemDefinition } from "./definitions.js";
import { MAP_COLS, MAP_ROWS, isInsideMap, relativeToTile } from "./geometry.js";

export interface CityFile {
  format: string;
  profile: Record<string, string>;
  hqLevel: number;
  items: Array<{ sid: number; sku: string; x: number; y: number; state: Record<string, string> }>;
  roads: Array<[number, number]>;
  terrain: Array<[number, number]>;
  areas?: number[];
  missions?: { up: number[]; reached: number[]; given: number[] };
  pollCounts?: Record<string, number>;
}

export interface PlacedItem {
  sid: number;
  sku: string;
  tileX: number;
  tileY: number;
  def: ItemDefinition;
  state: Record<string, string>;
}

const NONE = -1;

export class CityModel {
  readonly ground = new Int8Array(MAP_COLS * MAP_ROWS).fill(NONE);
  readonly items: PlacedItem[] = [];
  readonly missingDefinitions: string[] = [];

  constructor(file: CityFile, defs: Map<string, ItemDefinition>) {
    if (file.format !== "mcity-html5-city/1") throw new Error(`unsupported city format ${file.format}`);
    for (const [rx, ry] of file.terrain) this.setGround(rx, ry, GroundType.Terrain);
    for (const [rx, ry] of file.roads) this.setGround(rx, ry, GroundType.Road);
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

  private setGround(rx: number, ry: number, type: GroundType): void {
    const t = relativeToTile(rx, ry);
    if (isInsideMap(t.x, t.y)) this.ground[t.y * MAP_COLS + t.x] = type;
  }

  groundAt(tx: number, ty: number): number {
    return isInsideMap(tx, ty) ? this.ground[ty * MAP_COLS + tx] : NONE;
  }

  // Map data values per cell (row-major); 0 marks cells without terrain or road.
  tileValues(): Int16Array {
    const out = new Int16Array(MAP_COLS * MAP_ROWS);
    for (let y = 0; y < MAP_ROWS; y++) {
      for (let x = 0; x < MAP_COLS; x++) {
        const type = this.groundAt(x, y);
        if (type === NONE) continue;
        const same = (dx: number, dy: number) => this.groundAt(x + dx, y + dy) === type;
        const nb: Neighbours = {
          n: same(0, -1), s: same(0, 1), e: same(1, 0), w: same(-1, 0),
          ne: same(1, -1), nw: same(-1, -1), se: same(1, 1), sw: same(-1, 1),
        };
        out[y * MAP_COLS + x] = tileValue(type as GroundType, nb);
      }
    }
    applyCrosswalks(out, MAP_COLS, MAP_ROWS);
    return out;
  }

  // Tileset index per cell (row-major), -1 for cells that show the background.
  tileIndices(): Int16Array {
    return this.tileValues().map(valueToTilesetIndex);
  }
}

// URL parameter `city` -> data file. The converted original NPC cities keep their own names (npc_boss, npc_advisor);
// anything else is data/city_<name>.json, and no or an invalid name is the player's city.
export function cityDataFile(name: string | null): string {
  if (!name || !/^[a-z0-9_]+$/i.test(name)) return "data/city.json";
  return name.startsWith("npc_") ? `data/${name}.json` : `data/city_${name}.json`;
}
