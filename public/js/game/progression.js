export function parseXpTable(root) {
    const rows = (root._children ?? [])
        .map((r) => ({ id: Number(r.id), need: Number(r.xpneed) }))
        .filter((r) => Number.isFinite(r.id) && Number.isFinite(r.need))
        .sort((a, b) => a.id - b.id);
    return rows.map((r) => r.need);
}
export function levelForExp(thresholds, exp) {
    let level = 1;
    for (let i = 0; i < thresholds.length; i++)
        if (exp >= thresholds[i])
            level = i + 1;
    const start = thresholds[level - 1] ?? 0;
    const next = level < thresholds.length ? thresholds[level] : null;
    return { level, levelStartExp: start, nextLevelExp: next, progress: next === null ? 1 : (exp - start) / (next - start) };
}
export function formatNumber(n) {
    return Math.trunc(n).toLocaleString("en-US");
}
//# sourceMappingURL=progression.js.map