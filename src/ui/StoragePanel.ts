import { PanelLayout, SwfPanel, UiFrames } from "./SwfPanel.js";

// PopupStorage (GUI/Storage.swf popup_storage): title TID_POPUP_STORAGE_TITLE, TID_STORAGE_EMPTY in text_info while
// nothing is stored, and one StorageItemContent (storage_box: item image in "instance", name in "title", the stack
// in "counter", button_use "Use") per stored item inside popup_area, ITEMS_PER_PAGE at a time with the arrows.
export const STORAGE_ITEMS_PER_PAGE = 4;

export interface StorageEntry {
  sku: string;
  name: string;
  count: number;
}

export interface StorageSource {
  entries(): StorageEntry[];
  iconStyle(sku: string): Partial<CSSStyleDeclaration> | null;
  text(tid: string, fallback: string): string;
}

// PopupStorage.setStorageItemPosition: the gap is ceil((area width - box width x n) / (n + 1)) with n the boxes on
// one page, each box at gap + i x (box width + gap), vertically centred in the area.
export function storageSlots(areaW: number, areaH: number, boxW: number, boxH: number, count: number): Array<[number, number]> {
  const n = Math.min(count, STORAGE_ITEMS_PER_PAGE);
  if (n === 0) return [];
  const gap = Math.ceil((areaW - boxW * n) / (n + 1));
  return Array.from({ length: n }, (_, i) => [(boxW + gap) * i + gap, (areaH - boxH) / 2] as [number, number]);
}

export class StoragePanel {
  private popup: SwfPanel;
  private area: HTMLDivElement;
  private first = 0;
  private list: StorageEntry[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly layouts: Record<string, PanelLayout>,
    private readonly ui: UiFrames,
    private readonly source: StorageSource,
    private readonly onUse: (sku: string) => void,
    private readonly onClose: () => void,
  ) {
    const L = layouts.popup_storage;
    this.popup = new SwfPanel(L, ui, new Set(["popup_area"]));
    this.popup.setText("Title", source.text("TID_POPUP_STORAGE_TITLE", "Storage"), true);
    this.popup.setText("text_info/text_info", source.text("TID_STORAGE_EMPTY", "").replace(/\\n/g, "\n"));
    const info = this.popup.textElement("text_info/text_info");
    if (info) info.style.whiteSpace = "pre-line";
    this.popup.makeButton("mClose", () => this.onClose());
    this.popup.makeButton("arrow_left", () => this.turn(-1));
    this.popup.makeButton("arrow_right", () => this.turn(1));
    const [ax, ay, aw, ah] = L.bounds.popup_area ?? [0, 0, 0, 0];
    this.area = document.createElement("div");
    this.area.className = "storage-area";
    Object.assign(this.area.style, { left: `${ax - this.popup.minX}px`, top: `${ay - this.popup.minY}px`, width: `${aw}px`, height: `${ah}px` });
    this.popup.root.append(this.area);
    this.popup.root.style.left = `${this.popup.minX}px`;
    this.popup.root.style.top = `${this.popup.minY}px`;
    host.append(this.popup.root);
    host.hidden = true;
  }

  get open(): boolean {
    return !this.host.hidden;
  }

  get items(): StorageEntry[] {
    return this.list;
  }

  show(): void {
    this.list = this.source.entries();
    this.first = Math.min(this.first, Math.max(0, this.list.length - STORAGE_ITEMS_PER_PAGE));
    this.host.hidden = false;
    this.render();
  }

  hide(): void {
    this.host.hidden = true;
  }

  private turn(dir: number): void {
    const max = Math.max(0, this.list.length - STORAGE_ITEMS_PER_PAGE);
    this.first = Math.min(max, Math.max(0, this.first + dir));
    this.render();
  }

  private render(): void {
    const L = this.layouts.popup_storage;
    const B = this.layouts.storage_box;
    const [, , aw, ah] = L.bounds.popup_area ?? [0, 0, 0, 0];
    const empty = this.list.length === 0;
    this.popup.setVisible("text_info", empty);
    // PopupStorage.disableArrows: an arrow is disabled at its end of the list.
    this.popup.setDisabled("arrow_left", this.first === 0);
    this.popup.setDisabled("arrow_right", this.first + STORAGE_ITEMS_PER_PAGE >= this.list.length);
    const page = this.list.slice(this.first, this.first + STORAGE_ITEMS_PER_PAGE);
    const probe = new SwfPanel(B, this.ui);
    const [x0, y0, x1, y1] = probe.extent;
    const slots = storageSlots(aw, ah, x1 - x0, y1 - y0, page.length);
    this.area.replaceChildren(...page.map((e, i) => this.box(e, [slots[i][0] - x0, slots[i][1] - y0])));
  }

  // `at` is where the box's registration point goes inside popup_area.
  private box(e: StorageEntry, at: [number, number]): HTMLElement {
    const B = this.layouts.storage_box;
    const b = new SwfPanel(B, this.ui);
    b.root.classList.add("storage-box");
    b.root.style.left = `${at[0] + b.minX}px`;
    b.root.style.top = `${at[1] + b.minY}px`;
    b.setText("title", e.name, true);
    b.setText("counter", "x" + e.count, true);
    b.setText("button_use/ButtonText/Caption", this.source.text("TID_STORAGE_USE_BUTTON", "Use"), true);
    b.makeButton("button_use", () => this.onUse(e.sku));
    const area = B.bounds.instance;
    const icon = this.source.iconStyle(e.sku);
    if (area && icon) {
      const holder = document.createElement("div");
      holder.className = "shop-icon";
      Object.assign(holder.style, icon);
      const w = parseFloat(String(icon.width)), h = parseFloat(String(icon.height));
      const scale = Math.min(1, area[2] / w, area[3] / h);
      holder.style.left = `${area[0] - b.minX + (area[2] - w * scale) / 2}px`;
      holder.style.top = `${area[1] - b.minY + (area[3] - h * scale) / 2}px`;
      holder.style.transform = `scale(${scale})`;
      holder.style.transformOrigin = "0 0";
      (b.layer("button_use") ?? b.root.lastElementChild)?.before(holder);
    }
    return b.root;
  }
}
