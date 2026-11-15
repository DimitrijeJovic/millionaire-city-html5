import { PlacedItem } from "../game/city.js";
import { tileToRelative } from "../game/geometry.js";

const KIND_LABEL: Record<string, string> = {
  house: "House", commerce: "Business", decoration: "Decoration", headquarters: "Headquarters", wonder: "Wonder", other: "Building",
};

export class InfoPanel {
  constructor(private readonly root: HTMLElement, private readonly texts: Record<string, string>, onClose: () => void) {
    root.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).dataset.action === "close") onClose();
    });
  }

  show(item: PlacedItem): void {
    const a = item.def.attributes;
    const rel = tileToRelative(item.tileX, item.tileY);
    const rows: Array<[string, string | undefined]> = [
      ["Type", KIND_LABEL[item.def.kind]],
      ["Size", `${item.def.baseCols} × ${item.def.baseRows}`],
      ["Position", `${rel.x}, ${rel.y}`],
      ["Level", a.level],
      ["Tenants", a.tenants],
      ["Income", a.incomeValue ?? a.incomeCoins],
      ["Company value", a.companyValue],
    ];
    this.root.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = (this.texts[item.def.tid] ?? item.def.name).trim();
    const close = document.createElement("button");
    close.dataset.action = "close";
    close.textContent = "×";
    close.title = "Close";
    const dl = document.createElement("dl");
    for (const [k, v] of rows) {
      if (v === undefined || v === "") continue;
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    }
    this.root.append(close, title, dl);
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
