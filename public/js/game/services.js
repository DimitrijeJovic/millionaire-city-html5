export const SERVICE_SKUS = ["moneyCollector", "contractSignator", "move"];
const HOUR = 3600000;
export function parseServices(root) {
    const out = new Map();
    for (const n of root._children ?? []) {
        const sku = String(n.sku);
        if (!SERVICE_SKUS.includes(sku))
            continue;
        const list = out.get(sku) ?? [];
        list.push({
            sku: sku, contractId: list.length, tid: String(n.tid ?? ""), hours: Number(n.timeDuration) || 0,
            priceCash: Math.trunc(Number(n.priceCash) || 0), priceCoins: Math.trunc(Number(n.priceCoins) || 0),
            waitHours: Math.trunc(Number(n.timeExpired) || 0),
        });
        out.set(sku, list);
    }
    return out;
}
export function emptyServices() {
    return { moneyCollector: { until: 0, waitUntil: {} }, contractSignator: { until: 0, waitUntil: {} }, move: { until: 0, waitUntil: {} } };
}
export function parseServicesData(raw) {
    const out = emptyServices();
    try {
        const v = JSON.parse(raw ?? "{}");
        for (const sku of SERVICE_SKUS) {
            const s = v?.[sku];
            if (!s)
                continue;
            if (typeof s.until === "number" && Number.isFinite(s.until))
                out[sku].until = s.until;
            for (const [k, t] of Object.entries(s.waitUntil ?? {}))
                if (typeof t === "number" && Number.isFinite(t))
                    out[sku].waitUntil[k] = t;
        }
    }
    catch {
        // A damaged entry means no service time.
    }
    return out;
}
export function serviceActive(data, sku, now) {
    return data[sku].until > now;
}
export function serviceTimeLeft(data, sku, now) {
    return Math.max(0, data[sku].until - now);
}
export function offerAvailable(data, offer, now) {
    return (data[offer.sku].waitUntil[String(offer.contractId)] ?? 0) <= now;
}
export function canBuy(data, offer, now, cash, coins) {
    if (!offerAvailable(data, offer, now))
        return "waiting";
    if (cash < offer.priceCash)
        return "no_gold";
    if (coins < offer.priceCoins)
        return "no_coins";
    return null;
}
// Profile.servicesContract: the service runs from now for the offer's hours; the wait of a trial starts now.
export function buyService(data, offer, now, wallet) {
    if (canBuy(data, offer, now, wallet.cash, wallet.coins) !== null)
        return false;
    wallet.cash -= offer.priceCash;
    wallet.coins -= offer.priceCoins;
    const s = data[offer.sku];
    s.until = now + offer.hours * HOUR;
    if (offer.waitHours > 0)
        s.waitUntil[String(offer.contractId)] = now + offer.waitHours * HOUR;
    return true;
}
// Tool.areaSetSize / areaMove: start = -(w >> 1), one tile further for an odd size, end = -start, and the tiles
// start <= t < end around the tile under the cursor (11 -> -6..5). Returns the inclusive tile range.
export function serviceArea(tileX, tileY, w, h) {
    const sx = -(w >> 1) - (w % 2 !== 0 ? 1 : 0);
    const sy = -(h >> 1) - (h % 2 !== 0 ? 1 : 0);
    return { x0: tileX + sx, y0: tileY + sy, x1: tileX - sx - 1, y1: tileY - sy - 1 };
}
// Tool.areaMove: an item is in the area when any tile of its base is.
export function inArea(area, f) {
    return f.x <= area.x1 && f.x + f.w - 1 >= area.x0 && f.y <= area.y1 && f.y + f.h - 1 >= area.y0;
}
//# sourceMappingURL=services.js.map