// Map layout of the original client (MapDefinition + Map.setTileData): 6x6 expansion areas of 15x10 tiles.
export const TILE = 32;
export const AREA_COLS = 15;
export const AREA_ROWS = 10;
export const AREAS_PER_SIDE = 6;
export const MAP_COLS = AREA_COLS * AREAS_PER_SIDE;
export const MAP_ROWS = AREA_ROWS * AREAS_PER_SIDE;
// Saves store positions relative to the map centre (Map.getTileRelativeXToTile / ...YToTile).
export function relativeToTile(rx, ry) {
    return { x: rx + (MAP_COLS >> 1), y: ry + (MAP_ROWS >> 1) };
}
export function tileToRelative(tx, ty) {
    return { x: tx - (MAP_COLS >> 1), y: ty - (MAP_ROWS >> 1) };
}
export function isInsideMap(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < MAP_COLS && ty < MAP_ROWS;
}
export function worldToTile(wx, wy) {
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
}
export function areaIndex(tx, ty) {
    return Math.floor(ty / AREA_ROWS) * AREAS_PER_SIDE + Math.floor(tx / AREA_COLS);
}
//# sourceMappingURL=geometry.js.map