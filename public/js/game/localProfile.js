// "Local Profile Settings" of the original desktop launcher (apps/server launcherHtml.ts and serverApp.ts
// adjustLocalResources): player name, city name, profile picture and money / gold / XP adjustments.
export const PROFILE_NAME_MAX = 32;
export const RESOURCE_ADJUSTMENT_MAX = 999999999;
export const DEFAULT_PLAYER_NAME = "Mayor";
export function cleanProfileName(name, fallback) {
    const t = name.replace(/\s+/g, " ").trim().slice(0, PROFILE_NAME_MAX);
    return t || fallback;
}
// parseResourceDelta: a non-zero whole number within the adjustment limit, otherwise null.
export function parseResourceDelta(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0 || Math.abs(n) > RESOURCE_ADJUSTMENT_MAX)
        return null;
    return n;
}
const clamp = (n) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
// adjustLocalResources: totals never go below zero; the company value follows the money and the gold
// (gold at the cashToCoins rate), XP does not change it.
export function adjustResource(p, resource, delta, cashToCoins) {
    if (resource === "money") {
        const before = p.coins;
        p.coins = clamp(before + delta);
        p.companyValue = clamp(p.companyValue + p.coins - before);
    }
    else if (resource === "gold") {
        const before = p.cash;
        p.cash = clamp(before + delta);
        p.companyValue = clamp(p.companyValue + (p.cash - before) * cashToCoins);
    }
    else {
        p.exp = clamp(p.exp + delta);
    }
}
export function parseLocalProfile(raw) {
    try {
        const v = JSON.parse(raw ?? "null");
        const picture = typeof v?.picture === "string" && /^data:image\/(png|jpeg|gif|webp);base64,/.test(v.picture) ? v.picture : null;
        return { userName: cleanProfileName(String(v?.userName ?? ""), DEFAULT_PLAYER_NAME), picture };
    }
    catch {
        return { userName: DEFAULT_PLAYER_NAME, picture: null };
    }
}
export const PROFILE_LIST_KEY = "mcity.profiles.v1";
export function profileId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
}
export function parseProfileList(raw) {
    try {
        const v = JSON.parse(raw ?? "null");
        const ids = [...new Set((Array.isArray(v?.ids) ? v.ids : []).filter((x) => typeof x === "string" && x === profileId(x)))];
        const active = typeof v?.active === "string" && (v.active === "" || ids.includes(v.active)) ? v.active : "";
        return { active, ids: ids.filter((x) => x !== "") };
    }
    catch {
        return { active: "", ids: [] };
    }
}
export function profileSuffix(id) {
    return id ? ".p_" + id : "";
}
// Adds a profile (or finds it) and makes it active; returns null for a name without usable characters.
export function addProfile(list, name) {
    const id = profileId(name);
    if (!id)
        return null;
    return { active: id, ids: list.ids.includes(id) ? list.ids : [...list.ids, id] };
}
//# sourceMappingURL=localProfile.js.map