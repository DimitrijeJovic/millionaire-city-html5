import { shopPriceLabel } from "../game/shop.js";
import { convertNumberToString } from "../game/textFormat.js";
import { SwfPanel } from "./SwfPanel.js";
function centred(host, panel) {
    panel.root.style.left = `${panel.minX}px`;
    panel.root.style.top = `${panel.minY}px`;
    host.replaceChildren(panel.root);
    host.hidden = false;
}
function close(host) {
    host.hidden = true;
    host.replaceChildren();
}
// Places another exported symbol (box_cash, button_buy) where the popup has a placeholder clip.
function inset(panel, at, child) {
    panel.placeChild(child, at);
    panel.root.append(child.root);
}
// PopupConfirmExpansion: cash (coins), investments and gold columns; the investment option needs
// successful investments from friends, which the local game cannot provide, so it shows the requirement only.
export function showExpansionPopup(host, layouts, ui, text, offer, buy, invest) {
    const L = layouts.popup_confirm_expansion;
    const p = new SwfPanel(L, ui, new Set(["button_buy_1", "button_buy_2", "button_buy_3", "box_1", "box_2", "box_3"]));
    p.setText("Expand", text("TID_CONFIRM_EXP_TITLE", "Buy Expansion"), true);
    p.setText("TextInfo_03", text("TID_CONFIRM_EXP_PAY_COINS", "Buy with Cash?"));
    p.setText("TextInfo_01", text("TID_CONFIRM_EXP_PAY_INVEST", ""));
    p.setText("Friends", text("TID_NEED_FRIENDS", "You need %U successful investment(s)").replace("%U", String(offer.friendsNeeded)));
    p.setText("TextInfo_02", text("TID_CONFIRM_EXP_PAY_GOLD", "Buy with Gold?"));
    const pos = (name) => {
        const b = L.bounds[name];
        return [b[0] + b[2] / 2, b[1] + b[3] / 2];
    };
    const column = (box, boxAt, buttonAt, label, enabled, currency) => {
        inset(p, pos(boxAt), new SwfPanel(layouts[box], ui));
        const button = new SwfPanel(layouts.button_buy, ui);
        button.setText("ButtonText/Caption", label, true);
        if (enabled)
            button.makeButton("ButtonText", () => buy(currency));
        else
            button.root.classList.add("disabled");
        inset(p, pos(buttonAt), button);
    };
    column("box_cash", "box_1", "button_buy_1", "$" + shopPriceLabel(offer.coins), offer.canCoins, "coins");
    // showPopup: box_invest_pending ("Free") in box_2; without enough successful investments the centre button is
    // "Invest" (onInvest) and the Friends line is red (0xCC0000). Investments need the original server.
    if (layouts.box_invest_pending) {
        const box = new SwfPanel(layouts.box_invest_pending, ui);
        box.setText("Caption", text("TID_GEN_FREE", "Free"), true);
        inset(p, pos("box_2"), box);
        const button = new SwfPanel(layouts.button_buy, ui);
        button.setText("ButtonText/Caption", text("TID_INVEST_POPUP1_TITLE", "Invest"), true);
        button.makeButton("ButtonText", () => invest());
        inset(p, pos("button_buy_2"), button);
        const friends = p.textElement("Friends");
        if (friends)
            friends.style.color = "#cc0000";
    }
    if (offer.cash > 0)
        column("box_gold", "box_3", "button_buy_3", String(offer.cash), offer.canCash, "cash");
    p.makeButton("mClose", () => close(host));
    centred(host, p);
}
// TextManager.changColors: "{0xRRGGBB}text{/}" spans become coloured runs; a literal "\n" in the locale is a line break.
export function colouredText(el, text) {
    el.replaceChildren();
    const re = /\{0x([0-9a-fA-F]{6})\}(.*?)\{\/\}/g;
    let last = 0;
    const plain = (s) => el.append(s.replace(/\\n/g, "\n"));
    for (const m of text.matchAll(re)) {
        plain(text.slice(last, m.index));
        const span = document.createElement("span");
        span.style.color = "#" + m[1];
        span.textContent = m[2];
        el.append(span);
        last = m.index + m[0].length;
    }
    plain(text.slice(last));
    el.style.whiteSpace = "pre-line";
}
// PopupConfirmDestroy (the PopupDestroy clip embedded in the client): ItemObject.demolish shows TID_DESTROY_MSG with
// the refund in place of %U, or TID_DESTROY_BUILDING_NOREWARD when the refund is 0; OkButton "Yes", CancelButton "No".
export function showDestroyPopup(host, layout, ui, text, refund, accept) {
    const msg = refund > 0
        ? text("TID_DESTROY_MSG", "Are you sure you want to destroy this?\nYou will get: %U")
            .replace("%U", text("TID_COIN_SYMBOL", "$") + convertNumberToString(refund, "thousand", 7))
        : text("TID_DESTROY_BUILDING_NOREWARD", "Are you sure to destroy this building?");
    showConfirmDestroy(host, layout, ui, text, msg, accept);
}
// PopupConfirmDestroy with another message: StateOnRent.doDoClick asks TID_CANCEL_CONTRACT with it.
export function showConfirmDestroy(host, layout, ui, text, msg, accept) {
    const p = new SwfPanel(layout, ui);
    colouredText(p.textElement("TextInfo"), msg);
    p.setText("OkButton/ButtonText/Caption", text("TID_BUTTON_YES", "Yes"), true);
    p.setText("CancelButton/ButtonText/Caption", text("TID_BUTTON_NO", "No"), true);
    p.makeButton("OkButton", () => {
        close(host);
        accept();
    });
    p.makeButton("CancelButton", () => close(host));
    centred(host, p);
}
// PopupConfirm for a contract the player cannot pay. The original first offers to exchange Gold Bars
// (startExchangeGold) and otherwise Facebook Credits (startAskForHelpFBCredits); neither is available here, so this is
// the variant without a payment (startNoAction): TID_NO_CASH_TITLE, TID_NO_CASH_BODY_FAKE_FBC and the close button.
export function showNoCashPopup(host, layout, ui, text) {
    const p = new SwfPanel(layout, ui, new Set(["button_1", "button_2", "button_3"]));
    p.setText("title", text("TID_NO_CASH_TITLE", "Not Enough Cash"), true);
    p.setText("text", text("TID_NO_CASH_BODY_FAKE_FBC", "You don't have enough cash to buy this."));
    p.makeButton("button_close", () => close(host));
    centred(host, p);
}
export function closePopup(host) {
    close(host);
}
// PopupName (popup_mission_Name_01): the NameUser field becomes an input; Done saves the name.
export function showNamePopup(host, layout, ui, text, current, reward, save) {
    const p = new SwfPanel(layout, ui, new Set(["container"]));
    p.setText("Title", text("TID_MISSION_001", "Name It"), true);
    p.setText("TextInfo", text("TID_MISSION_001_DESC", ""));
    p.setText("Reward", reward, true);
    for (const f of layout.text_fields)
        if (f.layer === "Done")
            p.setText(f.path, text("TID_BUTTON_DONE", "Done"), true);
    const field = layout.text_fields.find((f) => f.path === "NameUser");
    const input = document.createElement("input");
    input.className = "swf-input";
    input.maxLength = 20;
    input.value = current;
    const [x, y, w, h] = field.box_px;
    Object.assign(input.style, {
        left: `${x - p.minX}px`, top: `${y - p.minY}px`, width: `${w}px`, height: `${h}px`, fontFamily: `"${field.font}"`,
        fontSize: `${field.size_px}px`, color: field.color,
    });
    p.root.append(input);
    const done = () => {
        const name = input.value.trim();
        close(host);
        if (name && name !== current)
            save(name);
    };
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
            done();
        if (e.key === "Escape")
            close(host);
        e.stopPropagation();
    });
    p.makeButton("Done", done);
    p.makeButton("mClose", () => close(host));
    centred(host, p);
    input.focus();
    input.select();
}
// PopupValue (houses_info.swf popup_value), opened by clicking the headquarters (StateOnHeadQuarter.doClick).
// popup_value_without_gold is only used when Facebook Credits replace gold, which does not apply here.
export function showCompanyValuePopup(host, layout, ui, text, v) {
    const p = new SwfPanel(layout, ui);
    const colon = text("TID_ESPACIO2PUNTOS", ":");
    p.setText("Caption", text("TID_HINT_VALUE", "Company Value"), true);
    p.setText("TextInfo_01", text("TID_GEN_DCCOINS", "Dollars") + colon, true);
    p.setText("TextInfo_02", text("TID_GEN_DCCASH", "Gold") + colon, true);
    p.setText("TextInfo_03", text("TID_CV_1", "Buildings and Decorations") + colon, true);
    p.setText("TextInfo_04", text("TID_CV_2", "Plots and Expansions") + colon, true);
    p.setText("TextInfo_05", text("TID_CV_TOTAL", "Total") + colon, true);
    const money = (n) => text("TID_COIN_SYMBOL", "$") + convertNumberToString(n, null, 0);
    p.setText("cash", money(v.coins), true);
    p.setText("gold", money(v.gold), true);
    p.setText("buildings", money(v.buildings), true);
    p.setText("terrain", money(v.terrain), true);
    p.setText("total", money(v.total), true);
    p.makeButton("OkButton", () => close(host));
    centred(host, p);
}
// A plain message in PopupConfirm, used where the original needed its online server (friends, visits,
// investments, contractor services). The body text is the desktop build's own, not an original locale line.
export function showNoticePopup(host, layout, ui, title, body) {
    const p = new SwfPanel(layout, ui, new Set(["button_1", "button_2", "button_3"]));
    p.setText("title", title, true);
    p.setText("text", body);
    p.makeButton("button_close", () => close(host));
    centred(host, p);
}
//# sourceMappingURL=CityPopups.js.map