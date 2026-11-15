import { mapInfoAnchor, mapInfoView } from "../game/mapInfo.js";
import { SwfPanel } from "./SwfPanel.js";
// DCFillBar.MIN_WIDTH, in the bar clip's own units.
const BAR_MIN_WIDTH = 1;
// InfoBoxHouse / InfoBoxCommerce on the map. InfoBox.show tweens the box from scale 0.2 and alpha 0 in 0.35 s
// (Back.easeOut); close tweens back in 0.25 s. The tween lengths live in game.css (.map-info).
export class MapInfoBox {
    constructor(host, layouts, ui, text) {
        this.host = host;
        this.layouts = layouts;
        this.ui = ui;
        this.text = text;
        this.panel = null;
        this.bar = null;
        this.key = "";
    }
    get visible() {
        return this.panel !== null;
    }
    show(d, item) {
        const right = this.layouts[`popup_info_${d.kind}_right`];
        const width = Math.max(...Object.values(right.layers).map((l) => l.x + l.w));
        const at = mapInfoAnchor(item, width, window.innerWidth);
        const key = `${d.kind}_${at.side}`;
        if (this.key !== key) {
            this.remove();
            this.build(key);
        }
        const p = this.panel;
        p.root.style.left = `${at.x + p.minX}px`;
        p.root.style.top = `${at.y + p.minY}px`;
        this.update(d);
        requestAnimationFrame(() => p.root.classList.add("open"));
    }
    update(d) {
        const p = this.panel;
        if (!p)
            return;
        const view = mapInfoView(d, this.text);
        for (const [path, value] of Object.entries(view.texts))
            p.setText(path, value, true);
        for (const f of p.layout.text_fields) {
            const el = p.textElement(f.path);
            if (el)
                el.style.color = view.colors[f.path] ?? f.color;
        }
        const bar = p.layout.layers["FillBar/bar"];
        const size = p.layout.bounds["FillBar/bar_size"];
        if (this.bar && bar && size) {
            // The bar clip is 1 unit wide at rest; its scale on the stage is bar.w / BAR_MIN_WIDTH units per pixel.
            const unit = bar.w / BAR_MIN_WIDTH;
            const full = size[2] / unit;
            const w = (BAR_MIN_WIDTH + view.fill * (full - BAR_MIN_WIDTH)) * unit;
            this.bar.style.transform = `scaleX(${w / bar.w})`;
        }
    }
    hide() {
        const el = this.panel?.root;
        if (!el)
            return;
        this.panel = null;
        this.bar = null;
        this.key = "";
        el.classList.remove("open");
        el.classList.add("closing");
        window.setTimeout(() => el.remove(), 250);
    }
    build(key) {
        const layout = this.layouts[`popup_info_${key}`];
        const p = new SwfPanel(layout, this.ui);
        p.root.classList.add("map-info");
        p.root.style.transformOrigin = `${-p.minX}px ${-p.minY}px`;
        const bar = layout.layers["FillBar/bar"];
        const frame = p.layer("FillBar");
        if (bar && frame) {
            const el = document.createElement("div");
            el.className = "swf-layer map-info-bar";
            this.ui.apply(el, bar.frame);
            el.style.left = `${bar.x - p.minX}px`;
            el.style.top = `${bar.y - p.minY}px`;
            frame.after(el);
            this.bar = el;
        }
        this.host.append(p.root);
        this.panel = p;
        this.key = key;
    }
    remove() {
        this.panel?.root.remove();
        this.panel = null;
        this.bar = null;
        this.key = "";
    }
}
//# sourceMappingURL=MapInfoBox.js.map