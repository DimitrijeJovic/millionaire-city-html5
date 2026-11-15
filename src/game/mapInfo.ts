import { Mode } from "./economy.js";
import { TextLookup, convertNumberToString, convertTimeToString, localeTimeUnits } from "./textFormat.js";

// Map info boxes of rented items (StateOnRent.doInfoBoxGetBox): houses use InfoBoxHouse (popup_info_house_*),
// shops InfoBoxCommerce (popup_info_commerce_*). A house waiting for a contract uses InfoBoxWonder and a
// disconnected one InfoBoxAbandoned; those two boxes are not reconstructed, so no box is shown for them.
export type MapInfoKind = "house" | "commerce";

export function mapInfoKind(kind: string, mode: number | undefined): MapInfoKind | null {
  if (mode === undefined) return null;
  if (kind === "commerce") return "commerce";
  if (kind === "house" && mode !== Mode.WaitingForContract) return "house";
  return null;
}

export interface MapInfoData {
  kind: MapInfoKind;
  title: string;
  // The running period (contract income time for houses, the shop's income time) and what is left of it.
  periodMs: number;
  leftMs: number;
  income: number;
  xp: number;
  // ItemObject.getPopulation: a rented house's tenants; for a shop the tenants of its customer houses.
  attendance: number;
}

export interface MapInfoView {
  texts: Record<string, string>;
  colors: Record<string, string>;
  // DCFillBar value / max value: the elapsed part of the period.
  fill: number;
}

const RED = "#ff0000";
const GREEN = "#00ff00";

export function mapInfoView(d: MapInfoData, t: TextLookup): MapInfoView {
  const u = localeTimeUnits(t);
  const left = Math.max(0, Math.min(d.leftMs, d.periodMs));
  const fill = d.periodMs > 0 ? (d.periodMs - left) / d.periodMs : 0;
  const money = t("TID_COIN_SYMBOL", "$") + convertNumberToString(d.income, "thousand", 6);
  const colors: Record<string, string> = {};
  if (d.kind === "house") {
    // InfoBoxHouse: setTimer(convertTimeToString(t, false, true)); zero XP is red, zero income and tenants green.
    if (d.xp === 0) colors.DailyXP = RED;
    if (d.income === 0) colors.DailyIncomeMoney = GREEN;
    if (d.attendance === 0) colors.attendance_number = GREEN;
    return {
      texts: {
        TopText: d.title, Status: t("TID_CURRENT_STATUS", "Tenants:"), IncomeIn: convertTimeToString(left, u, true, false),
        DailyXP: t("TID_POINTS_XP", "%U XP").replace("%U", String(d.xp)), DailyIncomeMoney: money, attendance_number: String(d.attendance),
      },
      colors, fill,
    };
  }
  // InfoBoxCommerce: setTimer(convertTimeToString(t, false)); zero income and zero customers are red.
  if (d.income === 0) colors.DailyIncomeMoney = RED;
  if (d.attendance === 0) colors.attendance_number = RED;
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
export function mapInfoAnchor(item: { left: number; right: number; top: number; bottom: number }, rightBoxWidth: number,
  stageWidth: number): { side: "left" | "right"; x: number; y: number } {
  const y = (item.top + item.bottom) / 2;
  if (item.right + rightBoxWidth > stageWidth) return { side: "left", x: item.left, y };
  return { side: "right", x: item.right, y };
}

// StateItemObject.mInfoBoxTimer.
export const INFO_BOX_DELAY_MS = 400;
