import { Mode } from "./economy.js";
import { convertNumberToString, convertTimeToString, localeTimeUnits } from "./textFormat.js";
export function mapInfoKind(kind, mode) {
    if (mode === undefined)
        return null;
    if (kind === "commerce")
        return "commerce";
    if (kind === "house" && mode !== Mode.WaitingForContract)
        return "house";
    return null;
}
const RED = "#ff0000";
const GREEN = "#00ff00";
export function mapInfoView(d, t) {
    const u = localeTimeUnits(t);
    const left = Math.max(0, Math.min(d.leftMs, d.periodMs));
    const fill = d.periodMs > 0 ? (d.periodMs - left) / d.periodMs : 0;
    const money = t("TID_COIN_SYMBOL", "$") + convertNumberToString(d.income, "thousand", 6);
    const colors = {};
    if (d.kind === "house") {
        // InfoBoxHouse: setTimer(convertTimeToString(t, false, true)); zero XP is red, zero income and tenants green.
        if (d.xp === 0)
            colors.DailyXP = RED;
        if (d.income === 0)
            colors.DailyIncomeMoney = GREEN;
        if (d.attendance === 0)
            colors.attendance_number = GREEN;
        return {
            texts: {
                TopText: d.title, Status: t("TID_CURRENT_STATUS", "Tenants:"), IncomeIn: convertTimeToString(left, u, true, false),
                DailyXP: t("TID_POINTS_XP", "%U XP").replace("%U", String(d.xp)), DailyIncomeMoney: money, attendance_number: String(d.attendance),
            },
            colors, fill,
        };
    }
    // InfoBoxCommerce: setTimer(convertTimeToString(t, false)); zero income and zero customers are red.
    if (d.income === 0)
        colors.DailyIncomeMoney = RED;
    if (d.attendance === 0)
        colors.attendance_number = RED;
    return {
        texts: {
            TopText: d.title, Income_Bonus: t("TID_SHOP_RENT", "Income"), attendance: t("TID_ATTENDANCE", "Customers:"),
            IncomeIn: convertTimeToString(left, u, false, false), DailyIncomeMoney: money, attendance_number: String(d.attendance),
        },
        colors, fill,
    };
}
// InfoBox.show: the box opens at the item's right edge (vertical centre) unless the right box would leave the
// stage; then the left box opens at the item's left edge.
export function mapInfoAnchor(item, rightBoxWidth, stageWidth) {
    const y = (item.top + item.bottom) / 2;
    if (item.right + rightBoxWidth > stageWidth)
        return { side: "left", x: item.left, y };
    return { side: "right", x: item.right, y };
}
// StateItemObject.mInfoBoxTimer.
export const INFO_BOX_DELAY_MS = 400;
//# sourceMappingURL=mapInfo.js.map