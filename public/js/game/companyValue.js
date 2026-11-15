export function companyValueParts(v) {
    const gold = v.cash * v.cashToCoins;
    let buildings = 0;
    for (const it of v.items)
        if (!it.underConstruction)
            buildings += it.companyValue + it.contractCost;
    // Profile.getCompanyValuePerExpansions: min(expansionsGetDCCoinsWithFriends(i), expansionsGetDCCash(i) x rate);
    // both are DCCash x rate, so each bought expansion counts at its gold price in dollars.
    let expansions = 0;
    for (let i = 0; i < v.expansionsBought; i++)
        expansions += (v.expansionCash[i] ?? 0) * v.cashToCoins;
    const terrain = v.terrainTiles * v.terrainPrice + expansions;
    return { coins: v.coins, gold, buildings, terrain, total: v.coins + gold + buildings + terrain };
}
//# sourceMappingURL=companyValue.js.map