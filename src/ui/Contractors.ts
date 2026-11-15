import { ServiceOffer, ServiceSku, ServicesData, canBuy, offerAvailable } from "../game/services.js";
import { TextLookup, convertTimeToString, localeTimeUnits } from "../game/textFormat.js";
import { colouredText } from "./CityPopups.js";
import { PanelLayout, SwfPanel, UiFrames } from "./SwfPanel.js";

export type ContractorTool = ServiceSku;

// MultifunctionBar (hud.swf button_multifuncion): Move, Collect (Rent Collector) and Contracts (Contract Renewal)
// above the Contractors button. Its coordinates share the tool panel's registration point.
export class MultifunctionBar {
  readonly panel: SwfPanel;

  constructor(layout: PanelLayout, ui: UiFrames, text: TextLookup, onTool: (t: ContractorTool) => void, moveAvailable: boolean) {
    this.panel = new SwfPanel(layout, ui);
    const p = this.panel;
    p.makeButton("collector", () => onTool("moneyCollector"));
    p.makeButton("contract", () => onTool("contractSignator"));
    p.makeButton("move", () => onTool("move"));
    p.setDisabled("move", !moveAvailable);
    const hint = (n: string, tid: string, fb: string) => p.layer(n)?.setAttribute("title", text(tid, fb));
    hint("collector", "TID_HINT_BUTTON_COLLECT", "Collect");
    hint("contract", "TID_HINT_BUTTON_MULTICONTRACT", "Contracts");
    hint("move", "TID_HINT_BUTTON_MOVE", "Move");
    p.root.classList.add("multifunction-bar");
    p.root.hidden = true;
  }

  get open(): boolean {
    return !this.panel.root.hidden;
  }

  setOpen(on: boolean): void {
    this.panel.root.hidden = !on;
  }

  setSelected(t: ContractorTool | null): void {
    this.panel.setSelected("collector", t === "moneyCollector");
    this.panel.setSelected("contract", t === "contractSignator");
    this.panel.setSelected("move", t === "move");
  }
}

function close(host: HTMLElement): void {
  host.hidden = true;
  host.replaceChildren();
}

// PopupRentMoneyCollector / PopupMultiContract: one ItemService box per offer in box_01..box_05. A box shows the
// duration, the gold price or "Free Trial", "Special Offer" on the first (longest) offer, and "Available in ..."
// while a trial is waiting (popup_*_box_cash_locked).
export function showServicePopup(host: HTMLElement, layouts: Record<string, PanelLayout>, ui: UiFrames, text: TextLookup,
  sku: ServiceSku, offers: ServiceOffer[], data: ServicesData, wallet: () => { cash: number; coins: number }, now: number,
  buy: (offer: ServiceOffer) => void, noGold: () => void): void {
  const collector = sku === "moneyCollector";
  const L = layouts[collector ? "PopupRentMoneyCollector" : "popup_contract"];
  const p = new SwfPanel(L, ui, new Set(["box_01", "box_02", "box_03", "box_04", "box_05"]));
  p.setText("Caption", collector ? text("TID_POPUP_RENT_COLLECTOR_TITLE", "Contract Rent Collector") : text("TID_POPUP_MULTI_CONTRACT_TITLE", "Select Contractor"), true);
  p.makeButton("mClose", () => close(host));
  const u = localeTimeUnits(text);
  offers.slice(0, 5).forEach((o, i) => {
    const at = L.origins?.[`box_0${i + 1}`];
    if (!at) return;
    const available = offerAvailable(data, o, now);
    const name = collector ? (available ? "popup_collect_box_cash" : "popup_collect_box_cash_locked")
      : available ? "popup_contract_box" : "popup_contract_box_cash_locked";
    const boxLayout = layouts[name];
    const b = new SwfPanel(boxLayout, ui, new Set(o.contractId > 0 ? ["best"] : []));
    p.placeChild(b, at);
    b.root.classList.add("service-box");
    b.setText("ContractButton/ButtonText/Caption", text("TID_BUTTON_CONTRACT", "Contract"), true);
    if (!available) {
      const wait = (data[o.sku].waitUntil[String(o.contractId)] ?? now) - now;
      b.setText("TopText", text("TID_AVAILABLE_IN", "Available in %U").replace("%U", convertTimeToString(wait, u, true)), true);
      b.setDisabled("ContractButton", true);
    } else {
      b.setText("days", convertTimeToString(o.hours * 3_600_000, u, true), true);
      // ItemService keeps the badge text's rotation and size (it only changes them for fonts that are replaced).
      b.setText("best/best", text("TID_GEN_SPECIALOFFER", "Special Offer"));
      const free = o.priceCash === 0 && o.priceCoins === 0;
      b.setText("mPrize", free ? "" : String(o.priceCash || o.priceCoins), true);
      b.setText("trial", free ? text("TID_FREE_TRIAL", "Free Trial") : "", true);
      b.setVisible("gold", !free);
      // gold@2 is the gold bar shown for prices in gold (ItemService: gold.gotoAndStop(2) when priceCash > 0).
      if (o.priceCash > 0) b.showFrame("gold", 2);
      b.makeButton("ContractButton", () => {
        const w = wallet();
        const refusal = canBuy(data, o, Date.now(), w.cash, w.coins);
        if (refusal === "no_gold" || refusal === "no_coins") {
          noGold();
          return;
        }
        if (refusal) return;
        close(host);
        buy(o);
      });
    }
    p.root.append(b.root);
  });
  p.root.style.left = `${p.minX}px`;
  p.root.style.top = `${p.minY}px`;
  p.setScale(popupScale(p.extent, window.innerWidth, window.innerHeight));
  host.replaceChildren(p.root);
  host.hidden = false;
}

// The contractor popups were drawn for the 760 x 600 Flash stage; on a larger window they are enlarged (the UI
// atlas is rasterised at 2x) up to 1.5x while SERVICE_POPUP_MARGIN stays free above and below for the HUD and
// the tool bars. Below the original size only when the window cannot hold it at all (SERVICE_POPUP_EDGE).
// Not original: the Flash stage kept its size.
export const SERVICE_POPUP_MAX_SCALE = 1.5;
export const SERVICE_POPUP_MARGIN = [40, 150] as const;
export const SERVICE_POPUP_EDGE = 8;

export function popupScale(extent: [number, number, number, number], viewW: number, viewH: number): number {
  const [x0, y0, x1, y1] = extent;
  // The popup is centred on its registration point, so the larger half on each axis decides.
  const halfW = Math.max(-x0, x1), halfH = Math.max(-y0, y1);
  const fit = (mx: number, my: number) => Math.min((viewW / 2 - mx) / halfW, (viewH / 2 - my) / halfH);
  const scale = Math.max(fit(SERVICE_POPUP_MARGIN[0], SERVICE_POPUP_MARGIN[1]), Math.min(1, fit(SERVICE_POPUP_EDGE, SERVICE_POPUP_EDGE)));
  return Math.max(0.5, Math.min(SERVICE_POPUP_MAX_SCALE, Math.floor(scale * 20) / 20));
}

// PopupConfirmMove (houses_info.swf popup_confirm_buy_crane_operator), shown while the move service runs:
// TID_MOVE_TEXT1 and "Free"; OkButton moves the item, mClose cancels.
export function showConfirmMove(host: HTMLElement, layout: PanelLayout, ui: UiFrames, text: TextLookup, accept: () => void,
  cancel: () => void): void {
  const p = new SwfPanel(layout, ui);
  p.setText("TextInfo", text("TID_MOVE_TEXT1", "Are you sure you want to move your property here?"));
  p.setText("freemove", text("TID_GEN_FREE", "Free"), true);
  p.makeButton("OkButton", () => {
    close(host);
    accept();
  });
  p.makeButton("mClose", () => {
    close(host);
    cancel();
  });
  show(host, p);
}

// PopupPayMove (popup_confirm_buy_rent_crane_operator): TID_MOVE_TITLE, TID_MOVE_TEXT1 with the price in mPrize,
// TID_MOVE_TEXT2 and the RentButton with the move service's gold price (DCCash). OkButton pays the move,
// RentButton hires the service (onRent: delayedPaymentSetGold) and the move is then free. unlock_fc is the
// Facebook Credits variant, hidden.
export function showPayMove(host: HTMLElement, layout: PanelLayout, ui: UiFrames, text: TextLookup, price: string, rentGold: number,
  pay: () => void, rent: () => void, cancel: () => void): void {
  const p = new SwfPanel(layout, ui, new Set(["unlock_fc"]));
  p.setText("Expand", text("TID_MOVE_TITLE", "Move Properties"), true);
  p.setText("TextInfo_01", text("TID_MOVE_TEXT1", "Are you sure you want to move your property here?"));
  const t2 = p.textElement("TextInfo_02");
  if (t2) colouredText(t2, text("TID_MOVE_TEXT2", "You can also get FREE MOVES for a FULL DAY."));
  p.setText("mPrize", price, true);
  p.setText("DCCash", String(rentGold), true);
  p.setText("RentButton/ButtonText/Caption", "Rent", true);
  p.makeButton("OkButton", () => {
    close(host);
    pay();
  });
  p.makeButton("RentButton", () => {
    close(host);
    rent();
  });
  p.makeButton("mClose", () => {
    close(host);
    cancel();
  });
  show(host, p);
}

function show(host: HTMLElement, p: SwfPanel): void {
  p.root.style.left = `${p.minX}px`;
  p.root.style.top = `${p.minY}px`;
  host.replaceChildren(p.root);
  host.hidden = false;
}
