import { ITEMS_PER_PAGE, SHOP_TABS, boxPosition, shopPriceLabel } from "../game/shop.js";
import { SwfPanel } from "./SwfPanel.js";
import { shopInfoSymbol, shopInfoTexts } from "./shopInfo.js";
// ItemContent.TOOLTIP_DELAY.
const TOOLTIP_DELAY_MS = 200;
// Shop items render inside the visible window of the shop symbol (BuyBox.mScrollRect).
const HIDDEN_SHOP_LAYERS = new Set(["counter_fbc", "offer_day"]);
const HIDDEN_STORAGE_LAYERS = new Set(["area_new_items", "area_featured", "counter_fbc", "offer_day"]);
export class ShopPanel {
    constructor(host, layouts, ui, source, onBuy, onClose) {
        this.host = host;
        this.layouts = layouts;
        this.ui = ui;
        this.source = source;
        this.onBuy = onBuy;
        this.onClose = onClose;
        this.tab = 0;
        this.page = 0;
        this.list = [];
        this.info = null;
        this.infoTimer = 0;
        this.shop = new SwfPanel(layouts.shop, ui, source.specials ? HIDDEN_SHOP_LAYERS : HIDDEN_STORAGE_LAYERS);
        this.grid = document.createElement("div");
        this.grid.className = "shop-grid";
        this.shop.root.append(this.grid);
        SHOP_TABS.forEach((t, i) => {
            this.shop.makeButton(t.sku, () => this.showTab(i));
            for (const f of layouts.shop.text_fields)
                if (f.layer === t.sku)
                    this.shop.setText(f.path, source.text(t.tid, t.sku), true);
        });
        this.shop.makeButton("mClose", () => this.onClose());
        this.shop.makeButton("mArrowLeft", () => this.turn(-1));
        this.shop.makeButton("mArrowRight", () => this.turn(1));
        this.shop.setText("Caption", source.text("TID_HINT_MENU_BUTTON_HOUSES", "Shop"), true);
        if (source.specials)
            this.setupSpecialAreas(layouts.shop);
        // The shop symbol's origin is the popup centre; the host element sits at the screen centre.
        this.shop.root.style.left = `${this.shop.minX}px`;
        this.shop.root.style.top = `${this.shop.minY}px`;
        host.append(this.shop.root);
        host.hidden = true;
    }
    get open() {
        return !this.host.hidden;
    }
    show() {
        this.host.hidden = false;
        this.showTab(this.tab);
    }
    hide() {
        this.host.hidden = true;
    }
    turn(dir) {
        const pages = Math.max(1, Math.ceil(this.list.length / ITEMS_PER_PAGE));
        this.page = Math.min(pages - 1, Math.max(0, this.page + dir));
        this.render();
    }
    showTab(i) {
        this.tab = i;
        this.page = 0;
        SHOP_TABS.forEach((t, k) => this.shop.setSelected(t.sku, k === i));
        this.list = this.source.entries(SHOP_TABS[i].kind);
        this.render();
    }
    showSpecial(tab) {
        this.page = 0;
        SHOP_TABS.forEach((t) => this.shop.setSelected(t.sku, false));
        this.list = this.source.specials(tab);
        this.render();
    }
    // shop symbol: area_featured holds the "Specials" button and a featured item, area_new_items the
    // "Skyscraper Week" button and the tab picture (shopTabDefinitions feedImg newitemimage.png).
    setupSpecialAreas(layout) {
        const caption = (area, button, tid, fb) => this.shop.setText(`${area}/${button}/ButtonText/Caption`, this.source.text(tid, fb), true);
        caption("area_featured", "featured", "TID_SHOP_TAB_FEATURED_ITEM", "Specials");
        caption("area_new_items", "new_items", "TID_SHOP_TAB_NEW_ITEM", "Skyscraper Week");
        this.shop.makeButton("area_featured", () => this.showSpecial("featured"));
        this.shop.makeButton("area_new_items", () => this.showSpecial("new_items"));
        // The visible area is the exported layer; the symbol's bounds also include a masked-out picture holder.
        const place = (area, el, top) => {
            const b = layout.layers[area];
            if (!b)
                return;
            Object.assign(el.style, { left: `${b.x - this.shop.minX + 8}px`, top: `${b.y - this.shop.minY + top}px`, width: `${b.w - 16}px`,
                height: `${b.h - top - 8}px` });
            el.classList.add("shop-special-image");
            this.shop.root.append(el);
        };
        const featured = this.source.specials("featured").find((e) => !e.locked) ?? this.source.specials("featured")[0];
        const icon = featured ? this.source.iconStyle(featured.def.sku) : null;
        if (featured && icon) {
            const holder = document.createElement("div");
            const inner = document.createElement("div");
            Object.assign(inner.style, icon);
            inner.className = "shop-special-icon";
            holder.append(inner);
            const title = document.createElement("div");
            title.className = "shop-special-title";
            title.textContent = this.source.text(featured.def.tid, featured.def.name);
            holder.append(title);
            place("area_featured", holder, 44);
        }
        if (this.source.imageUrl) {
            const img = document.createElement("div");
            img.style.backgroundImage = `url("${this.source.imageUrl("newitemimage.png")}")`;
            place("area_new_items", img, 44);
        }
    }
    render() {
        this.hideInfo();
        this.grid.replaceChildren();
        const start = this.page * ITEMS_PER_PAGE;
        this.list.slice(start, start + ITEMS_PER_PAGE).forEach((e, k) => this.grid.append(this.box(e, start + k)));
        const pages = Math.ceil(this.list.length / ITEMS_PER_PAGE);
        this.shop.setVisible("mArrowLeft", this.page > 0);
        this.shop.setVisible("mArrowRight", this.page < pages - 1);
    }
    // ItemContentUnlocked / ItemContentLocked boxes from popups/shop/shop.swf.
    box(e, index) {
        const layoutName = this.layouts[shopBoxLayout(e.def.kind, e.locked)] ? shopBoxLayout(e.def.kind, e.locked) : e.locked ? "shop_box_locked" : "shop_box";
        const layout = this.layouts[layoutName];
        const box = new SwfPanel(layout, this.ui, new Set(["loading", "counter", "timeLeft", "bundle", "sold_out_box", e.locked ? "unlock_FC" : ""]));
        const [x, y] = boxPosition(index);
        this.shop.placeChild(box, [x, y]);
        box.root.classList.add("shop-box");
        box.root.dataset.layout = layoutName;
        box.setText("mTitle", this.source.text(e.def.tid, e.def.name), true);
        // ItemContent.setupIcon centres the item icon in the box's "image" placeholder.
        const area = layout.bounds.image;
        const icon = this.source.iconStyle(e.def.sku);
        if (area && icon) {
            const holder = document.createElement("div");
            holder.className = "shop-icon";
            Object.assign(holder.style, icon);
            const w = parseFloat(String(icon.width)), h = parseFloat(String(icon.height));
            const scale = Math.min(1, area[2] / w, area[3] / h);
            holder.style.left = `${area[0] - box.minX + (area[2] - w * scale) / 2}px`;
            holder.style.top = `${area[1] - box.minY + (area[3] - h * scale) / 2}px`;
            holder.style.transform = `scale(${scale})`;
            // ItemContentLocked.setupIcon: mImage.alpha = 0.5.
            if (e.locked)
                holder.style.opacity = "0.5";
            holder.style.transformOrigin = "0 0";
            // Above the card background and the image frame, below the labels and the button.
            (box.layer("image") ?? box.root.firstElementChild)?.after(holder);
        }
        if (e.locked) {
            box.setVisible("fan", e.lockReason === "fan");
            const label = e.lockReason === "level"
                ? this.source.text("TID_POPUP_LEVEL_TEXT", "Level %U").replace("%U", e.def.attributes.level ?? "")
                : e.lockReason === "expired" ? this.source.text("TID_LIMITED_TIME", "Limited time!") : this.source.text("TID_GEN_LOCKED", "Locked");
            box.setText("locked/Locked", label, true);
        }
        else {
            box.setText("Xp", "+" + (e.def.attributes.exp ?? "0"), true);
            const coins = Number(e.def.attributes.constructionCoins ?? 0);
            const cash = Number(e.def.attributes.constructionCash ?? 0);
            const price = e.label ?? (cash > 0 ? String(cash) : coins === 0 ? this.source.text("TID_GEN_FREE", "Free") : shopPriceLabel(coins));
            box.setText("unlock_FC/ButtonText/Caption", price, true);
            // No discounts offline: the offer star and the struck-out old price stay hidden.
            for (const path of ["unlock_FC/ButtonText/offer/text", "unlock_FC/ButtonText/old_prize/text"]) {
                const t = box.textElement(path);
                if (t)
                    t.style.display = "none";
            }
            const btn = box.layer("unlock_FC");
            if (btn) {
                // The currency icon takes the place of the button's "icon" placeholder.
                const currency = document.createElement("div");
                currency.className = "shop-currency " + (cash > 0 ? "gold" : "cash");
                const slot = layout.layers["unlock_FC/ButtonText/icon"], base = layout.layers.unlock_FC;
                if (slot && base) {
                    Object.assign(currency.style, { left: `${slot.x - base.x}px`, top: `${slot.y - base.y}px`, width: `${slot.w}px`,
                        height: `${slot.h}px` });
                }
                btn.append(currency);
                if (!e.affordable)
                    btn.classList.add("unaffordable");
            }
            box.makeButton("unlock_FC", () => this.onBuy(e.def.sku));
            box.root.addEventListener("pointerenter", () => {
                window.clearTimeout(this.infoTimer);
                this.infoTimer = window.setTimeout(() => this.showInfo(e.def, box.root), TOOLTIP_DELAY_MS);
            });
            box.root.addEventListener("pointerleave", () => this.hideInfo());
        }
        return box.root;
    }
    // ItemContentUnlocked.showInfoBox: anchored 15 px inside the box's right edge at its vertical centre; InfoBox.show
    // uses the _right box unless it would leave the stage, then the _left box shifted back by the box width - 20.
    showInfo(def, boxEl) {
        this.hideInfo();
        const symbol = shopInfoSymbol(def);
        const right = symbol ? this.layouts[symbol + "right"] : undefined;
        if (!symbol || !right)
            return;
        const base = this.shop.root.getBoundingClientRect();
        const r = Array.from(boxEl.children).reduce((acc, c) => {
            const b = c.getBoundingClientRect();
            return { l: Math.min(acc.l, b.left), t: Math.min(acc.t, b.top), r: Math.max(acc.r, b.right), b: Math.max(acc.b, b.bottom) };
        }, { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
        const x = r.r - 15;
        const y = (r.t + r.b) / 2;
        const rightWidth = Math.max(...Object.values(right.layers).map((l) => l.x + l.w));
        const useLeft = x + rightWidth > window.innerWidth;
        const layout = useLeft ? this.layouts[symbol + "left"] : right;
        const p = new SwfPanel(layout, this.ui);
        for (const [path, value] of Object.entries(shopInfoTexts(def, (tid, fb) => this.source.text(tid, fb))))
            p.setText(path, value, true);
        const ax = useLeft ? x - (r.r - r.l - 20) : x;
        p.root.style.left = `${ax - base.left + p.minX}px`;
        p.root.style.top = `${y - base.top + p.minY}px`;
        p.root.classList.add("shop-info");
        this.shop.root.append(p.root);
        this.info = p.root;
    }
    hideInfo() {
        window.clearTimeout(this.infoTimer);
        this.info?.remove();
        this.info = null;
    }
}
// ItemContentUnlocked.getBox: shop_box_wonder for wonders (shop_box_crew for crew clubs, which the shop does not
// list), shop_box otherwise; every locked variant (ItemContentLocked and its subclasses) uses shop_box_locked.
export function shopBoxLayout(kind, locked) {
    if (locked)
        return "shop_box_locked";
    return kind === "wonder" ? "shop_box_wonder" : "shop_box";
}
//# sourceMappingURL=ShopPanel.js.map