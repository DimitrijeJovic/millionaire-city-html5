import { convertNumberToString, convertTimeToString, localeTimeUnits } from "../game/textFormat.js";
import { SwfPanel } from "./SwfPanel.js";
// ContractBox fields: NUM_ITEMS_PAGE = 6, XINIT = -60, YINIT = -12, XOFFSET = 114, YOFFSET = 147. getItems moves the
// scrolling sprite to (XINIT - 112, YINIT - 142) with scrollRect origin (XINIT - 58, YINIT - 74), so slot n of a page
// sits at (-114 + 114 * (n % 3), -80 + 147 * floor(n / 3)) in popup_background_contract coordinates.
export const ITEMS_PER_PAGE = 6;
const SLOT_X0 = -114;
const SLOT_Y0 = -80;
const XOFFSET = 114;
const YOFFSET = 147;
// popup_box_contract places its "contract" clip here; contract_NN icons are added inside it.
const ICON_AT = [-51, -48.8];
const TOOLTIP_DELAY_MS = 200;
export function slotPosition(index) {
    const n = index % ITEMS_PER_PAGE;
    return [SLOT_X0 + XOFFSET * (n % 3), SLOT_Y0 + YOFFSET * Math.floor(n / 3)];
}
export function pageCount(items) {
    return Math.max(1, Math.ceil(items / ITEMS_PER_PAGE));
}
export class ContractBox {
    constructor(host, layouts, ui, text, onSign, onClose) {
        this.host = host;
        this.layouts = layouts;
        this.ui = ui;
        this.text = text;
        this.onSign = onSign;
        this.onClose = onClose;
        this.panel = null;
        this.items = [];
        this.info = null;
        this.infoTimer = 0;
        this.page = 0;
    }
    get open() {
        return this.panel !== null;
    }
    // ContractBoxSingle: every contract of the house's contract type, in rules order; contracts above the player's
    // level use popup_box_contract_locked and cannot be clicked.
    show(options, playerLevel, tenants) {
        const p = new SwfPanel(this.layouts.popup_background_contract, this.ui);
        this.panel = p;
        this.page = 0;
        p.setText("Caption", this.text("TID_CONTRACT_POPUP_TITLE", "Select Contract"), true);
        p.makeButton("mClose", () => this.onClose());
        p.makeButton("mArrowLeft", () => this.turn(-1, options.length));
        p.makeButton("mArrowRight", () => this.turn(1, options.length));
        this.items = options.map((o, i) => this.box(p, o, i, playerLevel, tenants));
        for (const el of this.items)
            p.root.append(el);
        p.root.classList.add("contract-box");
        p.root.style.left = `${p.minX}px`;
        p.root.style.top = `${p.minY}px`;
        this.host.replaceChildren(p.root);
        this.host.hidden = false;
        this.turn(0, options.length);
    }
    turn(step, count) {
        const pages = pageCount(count);
        this.page = Math.min(pages - 1, Math.max(0, this.page + step));
        this.items.forEach((el, i) => (el.style.display = Math.floor(i / ITEMS_PER_PAGE) === this.page ? "" : "none"));
        this.panel.setDisabled("mArrowLeft", this.page === 0);
        this.panel.setDisabled("mArrowRight", this.page >= pages - 1);
        this.hideInfo();
    }
    box(p, o, index, playerLevel, tenants) {
        const unlocked = o.level <= playerLevel;
        const b = new SwfPanel(this.layouts[unlocked ? "popup_box_contract" : "popup_box_contract_locked"], this.ui);
        const at = slotPosition(index);
        p.placeChild(b, at);
        b.root.dataset.sku = o.sku;
        b.root.classList.add("contract-item");
        // ContractItem tweens between scale 1 and TWEEN_MAX_SCALE = 1.05 around its registration point.
        b.root.style.transformOrigin = `${-b.minX}px ${-b.minY}px`;
        if (o.icon !== "contract_01" && this.layouts[o.icon]) {
            const icon = new SwfPanel(this.layouts[o.icon], this.ui);
            b.placeChild(icon, ICON_AT);
            b.layer("contract")?.after(icon.root);
        }
        b.setText("Caption", o.name, true);
        b.setText("ContractPrize", this.text("TID_COIN_SYMBOL", "$") + convertNumberToString(o.costCoins, "thousand", 6));
        b.setText("Time_Number", convertTimeToString(o.incomeTimeMs, localeTimeUnits(this.text)));
        if (!unlocked) {
            b.setText("LevelNeeded", this.text("TID_DEFINITION_LEVEL", "Level %U needed").replace("%U", String(o.level)), true);
            b.setText("locked/LockedText", this.text("TID_GEN_LOCKED", "Locked"), true);
            b.root.classList.add("locked");
            return b.root;
        }
        b.root.classList.add("swf-button");
        b.root.addEventListener("pointerup", (e) => {
            e.stopPropagation();
            this.onSign(o.sku);
        });
        b.root.addEventListener("pointerdown", (e) => e.stopPropagation());
        b.root.addEventListener("pointerenter", () => {
            window.clearTimeout(this.infoTimer);
            this.infoTimer = window.setTimeout(() => this.showInfo(p, b, o, at, tenants), TOOLTIP_DELAY_MS);
        });
        b.root.addEventListener("pointerleave", () => this.hideInfo());
        return b.root;
    }
    // InfoBoxContract (contracts.swf popup_info_box_right, or _left when the right one would leave the stage):
    // anchored at the box's right edge minus 10 and its top (ContractBox.onItemMouseOver, ContractItem.showInfoBox).
    showInfo(p, b, o, at, tenants) {
        this.hideInfo();
        const layers = Object.values(b.layout.layers);
        const width = Math.max(...layers.map((l) => l.x + l.w)) - b.minX;
        const height = Math.max(...layers.map((l) => l.y + l.h)) - b.minY;
        const x = at[0] + width / 2 - 10;
        const y = at[1] - height / 2;
        const right = this.layouts.contract_info_right;
        const rightWidth = Math.max(...Object.values(right.layers).map((l) => l.x + l.w));
        const hostRect = this.host.getBoundingClientRect();
        const useLeft = hostRect.left + x + rightWidth > window.innerWidth;
        const box = new SwfPanel(useLeft ? this.layouts.contract_info_left : right, this.ui);
        box.setText("Caption", o.name, true);
        box.setText("Income", this.text("TID_SHOP_RENT", "Rent:"), true);
        box.setText("XP", this.text("TID_SHOP_RENT_XP", "XP:"), true);
        box.setText("Income_Number", this.text("TID_COIN_SYMBOL", "$") + convertNumberToString(o.incomeCoins, "millions", 6), true);
        box.setText("DailyXP", String(o.incomeXp), true);
        box.setText("attendance", this.text("TID_CURRENT_STATUS", ""), true);
        box.setText("attendance_number", String(tenants), true);
        p.placeChild(box, [useLeft ? x - width : x, y]);
        box.root.classList.add("contract-info");
        p.root.append(box.root);
        this.info = box.root;
    }
    hideInfo() {
        window.clearTimeout(this.infoTimer);
        this.info?.remove();
        this.info = null;
    }
    hide() {
        this.hideInfo();
        this.panel = null;
        this.items = [];
        this.host.hidden = true;
        this.host.replaceChildren();
    }
}
//# sourceMappingURL=ContractBox.js.map