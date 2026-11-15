// Ports of TextManager.convertNumberToString and TextManager.convertTimeToString.

export type Truncate = "thousand" | "millions" | null;

// TRUNCATE_THOUSAND divides by 1000 ("K", then "M") once the integer part is longer than `digits`;
// TRUNCATE_MILLIONS divides by 1 000 000 ("M"). Values below 10 with a fraction keep two decimals.
export function convertNumberToString(value: number, truncate: Truncate, digits: number): string {
  let n = value;
  let suffix = "";
  const length = n.toFixed(0).length;
  if (truncate === "thousand" && length > digits) {
    n /= 1000;
    suffix = "K";
    if (n >= 1000) {
      n /= 1000;
      suffix = "M";
    }
  }
  if (truncate === "millions" && length > digits) {
    n /= 1_000_000;
    suffix = "M";
  }
  if (n === 0) return "0";
  const text = n < 10 && n !== Math.trunc(n) ? n.toFixed(2) : n.toFixed(0);
  const [int, frac] = text.split(".");
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : "") + suffix;
}

export type TextLookup = (tid: string, fallback: string) => string;

export interface TimeUnits {
  day: string;
  days: string;
  hour: string;
  hours: string;
  minutes: string;
  seconds: string;
}

export function localeTimeUnits(t: TextLookup): TimeUnits {
  return {
    day: t("TID_TIME_UNIT_DAY", "Day"), days: t("TID_TIME_UNIT_DAYS", "Days"), hour: t("TID_TIME_UNIT_HOUR", "Hour"),
    hours: t("TID_TIME_UNIT_HOURS", "Hours"), minutes: t("TID_TIME_UNIT_MINUTES", "Mins"), seconds: t("TID_TIME_UNIT_SECONDS", "Secs"),
  };
}

// convertTimeToString(ms, short[, daysWithHours]): days for a day or more (followed by whole hours when asked);
// otherwise hours and minutes, or minutes and seconds when there are no hours. Partial seconds round up.
// With short = true a zero minute or second part is left out; with short = false (the map info boxes) both are kept.
export function convertTimeToString(ms: number, u: TimeUnits, daysWithHours = false, short = true): string {
  let s = Math.trunc(ms / 1000);
  if (ms % 1000 > 0) s++;
  if (s >= 86400) {
    const d = Math.trunc(s / 86400);
    const days = `${d} ${d === 1 ? u.day : u.days}`;
    const h = Math.trunc((s - d * 86400) / 3600);
    if (!daysWithHours || h <= 0) return days;
    return `${days} ${h} ${h === 1 ? u.hour : u.hours}`;
  }
  let m = Math.trunc(s / 60);
  s %= 60;
  const h = Math.trunc(m / 60);
  m %= 60;
  if (h > 0) {
    const hours = `${h} ${h === 1 ? u.hour : u.hours}`;
    return m === 0 ? hours : `${hours} ${m} ${u.minutes}`;
  }
  if (short && s === 0) return `${m} ${u.minutes}`;
  if (short && m === 0) return `${s} ${u.seconds}`;
  return `${m} ${u.minutes} ${s} ${u.seconds}`;
}
