// Contractor services (servicesDefinitions.xml): Rent Collector (moneyCollector) and Contract Renewal
// (contractSignator). The client itself charges them: ItemService.onContract takes the gold (delayedPaymentSetGold)
// and Profile.servicesContract sets the service time to now + timeDuration hours (TimerUtil.hourToMs); buying again
// replaces the remaining time. A service with timeExpired > 0 (the free trial) can be taken again only after that
// many hours (ServiceDefinition.contract / isAvailable). Move (ToolMove) is not reconstructed.
// Profile.SERVICES_MOVE_SKU "move" is the crane operator of ToolMove (free moves for its time).
export type ServiceSku = "moneyCollector" | "contractSignator" | "move";
export const SERVICE_SKUS: readonly ServiceSku[] = ["moneyCollector", "contractSignator", "move"];

export interface ServiceOffer {
  sku: ServiceSku;
  // ServiceDefinition.getContractId: position among the definitions of the same service.
  contractId: number;
  tid: string;
  hours: number;
  priceCash: number;
  priceCoins: number;
  waitHours: number;
}

const HOUR = 3_600_000;

export function parseServices(root: { _children?: Array<Record<string, unknown>> }): Map<ServiceSku, ServiceOffer[]> {
  const out = new Map<ServiceSku, ServiceOffer[]>();
  for (const n of root._children ?? []) {
    const sku = String(n.sku);
    if (!(SERVICE_SKUS as readonly string[]).includes(sku)) continue;
    const list = out.get(sku as ServiceSku) ?? [];
    list.push({
      sku: sku as ServiceSku, contractId: list.length, tid: String(n.tid ?? ""), hours: Number(n.timeDuration) || 0,
      priceCash: Math.trunc(Number(n.priceCash) || 0), priceCoins: Math.trunc(Number(n.priceCoins) || 0),
      waitHours: Math.trunc(Number(n.timeExpired) || 0),
    });
    out.set(sku as ServiceSku, list);
  }
  return out;
}

export interface ServiceState {
  // End of the bought time (ms since epoch); 0 when never bought.
  until: number;
  // Offers that may not be taken again before this time (the free trial's timeExpired).
  waitUntil: Record<string, number>;
}

export type ServicesData = Record<ServiceSku, ServiceState>;

export function emptyServices(): ServicesData {
  return { moneyCollector: { until: 0, waitUntil: {} }, contractSignator: { until: 0, waitUntil: {} }, move: { until: 0, waitUntil: {} } };
}

export function parseServicesData(raw: string | null): ServicesData {
  const out = emptyServices();
  try {
    const v = JSON.parse(raw ?? "{}") as Partial<Record<ServiceSku, Partial<ServiceState>>>;
    for (const sku of SERVICE_SKUS) {
      const s = v?.[sku];
      if (!s) continue;
      if (typeof s.until === "number" && Number.isFinite(s.until)) out[sku].until = s.until;
      for (const [k, t] of Object.entries(s.waitUntil ?? {})) if (typeof t === "number" && Number.isFinite(t)) out[sku].waitUntil[k] = t;
    }
  } catch {
    // A damaged entry means no service time.
  }
  return out;
}

export function serviceActive(data: ServicesData, sku: ServiceSku, now: number): boolean {
  return data[sku].until > now;
}

export function serviceTimeLeft(data: ServicesData, sku: ServiceSku, now: number): number {
  return Math.max(0, data[sku].until - now);
}

export function offerAvailable(data: ServicesData, offer: ServiceOffer, now: number): boolean {
  return (data[offer.sku].waitUntil[String(offer.contractId)] ?? 0) <= now;
}

export type BuyRefusal = "waiting" | "no_gold" | "no_coins";

export function canBuy(data: ServicesData, offer: ServiceOffer, now: number, cash: number, coins: number): BuyRefusal | null {
  if (!offerAvailable(data, offer, now)) return "waiting";
  if (cash < offer.priceCash) return "no_gold";
  if (coins < offer.priceCoins) return "no_coins";
  return null;
}

// Profile.servicesContract: the service runs from now for the offer's hours; the wait of a trial starts now.
export function buyService(data: ServicesData, offer: ServiceOffer, now: number, wallet: { cash: number; coins: number }): boolean {
  if (canBuy(data, offer, now, wallet.cash, wallet.coins) !== null) return false;
  wallet.cash -= offer.priceCash;
  wallet.coins -= offer.priceCoins;
  const s = data[offer.sku];
  s.until = now + offer.hours * HOUR;
  if (offer.waitHours > 0) s.waitUntil[String(offer.contractId)] = now + offer.waitHours * HOUR;
  return true;
}

// Tool.areaSetSize / areaMove: start = -(w >> 1), one tile further for an odd size, end = -start, and the tiles
// start <= t < end around the tile under the cursor (11 -> -6..5). Returns the inclusive tile range.
export function serviceArea(tileX: number, tileY: number, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  const sx = -(w >> 1) - (w % 2 !== 0 ? 1 : 0);
  const sy = -(h >> 1) - (h % 2 !== 0 ? 1 : 0);
  return { x0: tileX + sx, y0: tileY + sy, x1: tileX - sx - 1, y1: tileY - sy - 1 };
}

// Tool.areaMove: an item is in the area when any tile of its base is.
export function inArea(area: { x0: number; y0: number; x1: number; y1: number }, f: { x: number; y: number; w: number; h: number }): boolean {
  return f.x <= area.x1 && f.x + f.w - 1 >= area.x0 && f.y <= area.y1 && f.y + f.h - 1 >= area.y0;
}
