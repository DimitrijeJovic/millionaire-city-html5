import { Mode, itemIncomeTimeMs } from "./economy.js";
import { MAP_COLS, MAP_ROWS, areaIndex, isInsideMap, relativeToTile, tileToRelative } from "./geometry.js";
import { levelForExp } from "./progression.js";
import { PlotType, buyPlot, expansionPrice, plotsFromAreas } from "./expansions.js";
export function parseLevels(root) {
    return (root._children ?? [])
        .map((r) => ({ id: Number(r.id), xpNeed: Number(r.xpneed), terrainPrice: Number(r.terrainPrice), timePrice: Number(r.timePrice ?? 0) }))
        .filter((r) => Number.isFinite(r.id))
        .sort((a, b) => a.id - b.id)
        .map(({ xpNeed, terrainPrice, timePrice }) => ({ xpNeed, terrainPrice, timePrice }));
}
const key = (x, y) => `${x}:${y}`;
const int = (v) => Math.trunc(Number(v ?? 0)) | 0;
export class Builder {
    constructor(game, levels, settings, solidTiles = [], expansions = { rules: [], prices: [] }) {
        this.game = game;
        this.levels = levels;
        this.settings = settings;
        this.expansions = expansions;
        this.solid = new Set(solidTiles.map(([rx, ry]) => {
            const t = relativeToTile(rx, ry);
            return key(t.x, t.y);
        }));
    }
    get data() {
        return this.game.data;
    }
    level() {
        return levelForExp(this.levels.map((l) => l.xpNeed), this.data.profile.exp).level;
    }
    // Profile.getTerrainPrice: XPTable row of the current level.
    terrainPrice() {
        return this.levels[this.level() - 1]?.terrainPrice ?? 0;
    }
    // ItemDefinition.isLocked for the level and fan unlock conditions; cross-promotion items stay locked.
    isLocked(def) {
        const cond = def.attributes.unlockCondition ?? "level";
        if (cond === "level")
            return this.level() < int(def.attributes.level);
        if (cond === "fan")
            return !this.data.profile.isFan;
        return true;
    }
    occupied() {
        const out = new Map();
        for (const f of this.game.footprints()) {
            for (let dx = 0; dx < f.def.baseCols; dx++)
                for (let dy = 0; dy < f.def.baseRows; dy++)
                    out.set(key(f.tileX + dx, f.tileY + dy), f.sid);
        }
        return out;
    }
    tileSet(list) {
        return new Set(list.map(([rx, ry]) => {
            const t = relativeToTile(rx, ry);
            return key(t.x, t.y);
        }));
    }
    isAreaOwned(tx, ty) {
        return isInsideMap(tx, ty) && this.data.areas.includes(areaIndex(tx, ty));
    }
    isSolid(tx, ty) {
        return this.solid.has(key(tx, ty));
    }
    // TileData.getIsBuildable: no item base, no road and no solid logic tile.
    tileFree(tx, ty, occ, roads) {
        return !occ.has(key(tx, ty)) && !roads.has(key(tx, ty)) && !this.solid.has(key(tx, ty));
    }
    // Map.isBuildable: base inside the map and in owned areas, every tile free, and on owned terrain
    // plots unless the item is a decoration (ItemDefinition.requiresTerrainMine).
    canPlace(sku, tx, ty) {
        const def = this.game.defs.get(sku);
        if (!def)
            return "unknown";
        if (this.isLocked(def))
            return "locked";
        if (tx < 0 || ty < 0 || tx + def.baseCols > MAP_COLS || ty + def.baseRows > MAP_ROWS)
            return "outside";
        const occ = this.occupied();
        const roads = this.tileSet(this.data.roads);
        const terrain = this.tileSet(this.data.terrain);
        const needsPlot = def.kind !== "decoration";
        for (let dx = 0; dx < def.baseCols; dx++) {
            for (let dy = 0; dy < def.baseRows; dy++) {
                const x = tx + dx, y = ty + dy;
                if (!this.isAreaOwned(x, y))
                    return "not_owned";
                if (!this.tileFree(x, y, occ, roads))
                    return "occupied";
                if (needsPlot && !terrain.has(key(x, y)))
                    return "needs_terrain";
            }
        }
        if (this.data.profile.coins < int(def.attributes.constructionCoins))
            return "coins";
        if (this.data.profile.cash < int(def.attributes.constructionCash))
            return "cash";
        return null;
    }
    // ItemObject.isMoveable: no pending notification (a finished construction waiting for its click), and
    // StateOnRent.doIsMoveable only while waiting for a contract, renting or abandoned; built items and items under
    // construction can move. ToolMove.isMouseOverEnabled leaves out the headquarters.
    isMovable(sid) {
        const it = this.game.item(sid);
        const def = it && this.game.defs.get(it.sku);
        if (!it || !def || def.kind === "headquarters")
            return false;
        if (it.construction)
            return it.construction.timeMs > 0;
        const mode = it.state?.mode;
        if (def.kind === "house" || def.kind === "commerce") {
            return mode === Mode.WaitingForContract || mode === Mode.Renting || mode === Mode.Abandoned;
        }
        return true;
    }
    // ToolMove.getPlaceItemCoins: movePriceCoins + getInstantBuildPrice(constructionTime, getMoveFactor), i.e. the
    // level's timePrice x construction minutes x min(instantBuildFactor, 1); getPlaceItemCash: movePriceCash.
    movePrice(sid) {
        const it = this.game.item(sid);
        const def = it && this.game.defs.get(it.sku);
        if (!def)
            return null;
        const factor = Math.min(Number(def.attributes.instantBuildFactor ?? 0) || 0, 1);
        const timePrice = this.levels[this.level() - 1]?.timePrice ?? 0;
        const minutes = Number(def.attributes.constructionTime ?? 0) || 0;
        return { coins: int(def.attributes.movePriceCoins) + Math.floor(timePrice * minutes * factor), cash: int(def.attributes.movePriceCash) };
    }
    // Map.isBuildable for the item attached to the cursor: the same rules as building, its own tiles count as free,
    // and no price or unlock check (ToolMove.isItemAttachedAbleToBePlaced; the same position is no move).
    canMove(sid, tx, ty) {
        const it = this.game.item(sid);
        const def = it && this.game.defs.get(it.sku);
        if (!it || !def)
            return "unknown";
        if (!this.isMovable(sid))
            return "not_movable";
        const at = relativeToTile(it.x, it.y);
        if (at.x === tx && at.y === ty)
            return "same";
        if (tx < 0 || ty < 0 || tx + def.baseCols > MAP_COLS || ty + def.baseRows > MAP_ROWS)
            return "outside";
        const occ = this.occupied();
        const roads = this.tileSet(this.data.roads);
        const terrain = this.tileSet(this.data.terrain);
        const needsPlot = def.kind !== "decoration";
        for (let dx = 0; dx < def.baseCols; dx++) {
            for (let dy = 0; dy < def.baseRows; dy++) {
                const x = tx + dx, y = ty + dy;
                if (!this.isAreaOwned(x, y))
                    return "not_owned";
                const other = occ.get(key(x, y));
                if ((other !== undefined && other !== sid) || roads.has(key(x, y)) || this.solid.has(key(x, y)))
                    return "occupied";
                if (needsPlot && !terrain.has(key(x, y)))
                    return "needs_terrain";
            }
        }
        return null;
    }
    // ToolMove.doMove: the item keeps its sid, state, timers and level; only the position changes. With
    // free moves (the "move" service) nothing is paid, otherwise the move price.
    move(sid, tx, ty, free) {
        const err = this.canMove(sid, tx, ty);
        if (err)
            return err;
        const price = free ? { coins: 0, cash: 0 } : this.movePrice(sid);
        if (this.data.profile.coins < price.coins)
            return "coins";
        if (this.data.profile.cash < price.cash)
            return "cash";
        this.data.profile.coins -= price.coins;
        this.data.profile.cash -= price.cash;
        const it = this.game.item(sid);
        const rel = tileToRelative(tx, ty);
        it.x = rel.x;
        it.y = rel.y;
        return null;
    }
    // ToolBuild.reportMouseUp skips the price check for items taken from storage; StorageManager.removeItem
    // then takes one unit off the stack. The item is placed already built (inferred, see engine_facts.md).
    canPlaceFromStorage(sku, tx, ty) {
        if (!this.data.storage.includes(sku))
            return "unknown";
        const err = this.canPlace(sku, tx, ty);
        return err === "coins" || err === "cash" || err === "locked" ? null : err;
    }
    placeFromStorage(sku, tx, ty, now) {
        if (this.canPlaceFromStorage(sku, tx, ty))
            return null;
        const def = this.game.defs.get(sku);
        this.data.storage.splice(this.data.storage.indexOf(sku), 1);
        const sid = this.data.nextSid++;
        const rel = tileToRelative(tx, ty);
        const item = { sid, sku, x: rel.x, y: rel.y };
        this.completeState(item, def, now);
        this.data.items.push(item);
        this.data.profile.companyValue += int(def.attributes.companyValue);
        return sid;
    }
    place(sku, tx, ty, now) {
        if (this.canPlace(sku, tx, ty))
            return null;
        const def = this.game.defs.get(sku);
        this.data.profile.coins -= int(def.attributes.constructionCoins);
        this.data.profile.cash -= int(def.attributes.constructionCash);
        const sid = this.data.nextSid++;
        const rel = tileToRelative(tx, ty);
        const minutes = Number(def.attributes.constructionTime ?? 0);
        const item = { sid, sku, x: rel.x, y: rel.y };
        if (minutes > 0)
            item.construction = { timeMs: minutes * 60000, savedAt: now };
        else
            this.completeState(item, def, now);
        this.data.items.push(item);
        return sid;
    }
    completeState(item, def, now) {
        if (def.kind === "house")
            item.state = { mode: Mode.WaitingForContract, timeMs: 0, savedAt: now };
        else if (def.kind === "commerce") {
            item.state = { mode: Mode.Renting, timeMs: itemIncomeTimeMs(def), savedAt: now, cycle: `${item.sid}:shop:${now}` };
        }
    }
    // StateOnConstruction counts down; NotificationConstructionEnd then waits for the player's click.
    advance(now) {
        const changed = [];
        for (const it of this.data.items) {
            const c = it.construction;
            if (!c || c.timeMs <= 0)
                continue;
            const left = Math.max(0, c.timeMs - Math.max(0, now - c.savedAt));
            if (left === 0)
                changed.push(it.sid);
            it.construction = { timeMs: left, savedAt: now };
        }
        return changed;
    }
    constructionLeftMs(sid) {
        const it = this.game.item(sid);
        return it?.construction ? it.construction.timeMs : null;
    }
    finishConstruction(sid, now) {
        this.advance(now);
        const it = this.game.item(sid);
        const def = it && this.game.defs.get(it.sku);
        if (!it || !def || !it.construction || it.construction.timeMs > 0)
            return false;
        delete it.construction;
        this.completeState(it, def, now);
        this.data.profile.exp += int(def.attributes.exp);
        this.data.profile.companyValue += int(def.attributes.companyValue);
        return true;
    }
    // Map.buyTerrain: a free tile in an owned area that is not yet a plot, paid at the level's price.
    canBuyTerrain(tx, ty) {
        if (!this.isAreaOwned(tx, ty))
            return "not_owned";
        if (this.tileSet(this.data.terrain).has(key(tx, ty)))
            return "occupied";
        if (!this.tileFree(tx, ty, this.occupied(), this.tileSet(this.data.roads)))
            return "occupied";
        if (this.data.profile.coins < this.terrainPrice())
            return "coins";
        return null;
    }
    buyTerrain(tx, ty) {
        if (this.canBuyTerrain(tx, ty))
            return false;
        const price = this.terrainPrice();
        this.data.profile.coins -= price;
        this.data.profile.companyValue += price;
        const r = tileToRelative(tx, ty);
        this.data.terrain.push([r.x, r.y]);
        return true;
    }
    // Map.destroyTileApplyEconomy: the plot is refunded at destroyTerrainProfitPercentage of the price.
    removeTerrain(tx, ty) {
        const r = tileToRelative(tx, ty);
        const i = this.data.terrain.findIndex(([x, y]) => x === r.x && y === r.y);
        if (i < 0 || this.occupied().has(key(tx, ty)))
            return null;
        this.data.terrain.splice(i, 1);
        const price = this.terrainPrice();
        const refund = Math.trunc((price * this.settings.terrainProfitPercentage) / 100);
        this.data.profile.coins += refund;
        this.data.profile.companyValue -= price;
        return refund;
    }
    // Map.roadTileBuild: roads are free and replace a plot on the same tile (refunded as a plot removal).
    canBuildRoad(tx, ty) {
        return this.isAreaOwned(tx, ty) && !this.occupied().has(key(tx, ty)) && !this.tileSet(this.data.roads).has(key(tx, ty)) &&
            !this.solid.has(key(tx, ty));
    }
    buildRoad(tx, ty) {
        if (!this.canBuildRoad(tx, ty))
            return false;
        if (this.tileSet(this.data.terrain).has(key(tx, ty)))
            this.removeTerrain(tx, ty);
        const r = tileToRelative(tx, ty);
        this.data.roads.push([r.x, r.y]);
        return true;
    }
    removeRoad(tx, ty) {
        const r = tileToRelative(tx, ty);
        const i = this.data.roads.findIndex(([x, y]) => x === r.x && y === r.y);
        if (i < 0)
            return false;
        this.data.roads.splice(i, 1);
        return true;
    }
    // RulesFacade.settingsGetDestroyItemProfit: value x destroyItemProfitPercentage / 100, truncated.
    // RulesFacade.settingsGetDestroyItemProfit: the item's value times destroyItemProfitPercentage / 100.
    demolishRefund(sid) {
        const it = this.data.items.find((x) => x.sid === sid);
        const def = it ? this.game.defs.get(it.sku) : undefined;
        if (!def || def.kind === "headquarters")
            return null;
        return Math.trunc((int(def.attributes.companyValue) * this.settings.itemProfitPercentage) / 100);
    }
    demolish(sid) {
        const refund = this.demolishRefund(sid);
        if (refund === null)
            return null;
        const i = this.data.items.findIndex((it) => it.sid === sid);
        const value = int(this.game.defs.get(this.data.items[i].sku).attributes.companyValue);
        this.data.items.splice(i, 1);
        this.data.profile.coins += refund;
        this.data.profile.companyValue -= value;
        return refund;
    }
    get expansionRules() {
        return this.expansions.rules;
    }
    plots() {
        return plotsFromAreas(this.expansions.rules, this.data.areas);
    }
    get expansionPriceList() {
        return this.expansions.prices;
    }
    // Profile.mExpansionsMineCount: full plots, without the free starting plot.
    expansionsBought(areas = this.data.areas) {
        return Math.max(0, plotsFromAreas(this.expansions.rules, areas).filter((p) => p === PlotType.Full).length - 1);
    }
    expansionPrice() {
        return expansionPrice(this.expansions.prices, this.plots());
    }
    // PopupConfirmExpansion: coins (DCCoins) or gold (DCCash); the investors option needs friends.
    canBuyExpansion(index, currency) {
        const price = this.expansionPrice();
        if (!price || this.plots()[index] !== PlotType.Normal)
            return false;
        return currency === "coins" ? this.data.profile.coins >= price.coins : price.cash > 0 && this.data.profile.cash >= price.cash;
    }
    buyExpansion(index, currency) {
        if (!this.canBuyExpansion(index, currency))
            return false;
        const price = this.expansionPrice();
        if (currency === "coins")
            this.data.profile.coins -= price.coins;
        else
            this.data.profile.cash -= price.cash;
        const plots = buyPlot(this.expansions.rules, this.plots(), index);
        this.data.areas = [...new Set(this.expansions.rules.filter((r) => plots[r.index] === PlotType.Full).flatMap((r) => r.areas))].sort((a, b) => a - b);
        return true;
    }
}
//# sourceMappingURL=construction.js.map