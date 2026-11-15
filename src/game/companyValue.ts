// Company.getCompanyValue and its parts, as PopupValue (houses_info.swf popup_value) shows them.
export interface CompanyValueInput {
  coins: number;
  cash: number;
  // settings.xml cashToCoins (RulesFacade.getDCCashToDCCoins).
  cashToCoins: number;
  // ItemObject.getCompanyValue: the definition's value plus the cost of the running contract. Items still under
  // construction cannot be sold (StateOnConstruction.canBeSold) and are left out.
  items: Array<{ companyValue: number; contractCost: number; underConstruction: boolean }>;
  terrainTiles: number;
  // Profile.getTerrainPrice: the terrain price of the current level.
  terrainPrice: number;
  // expansionsPrices.xml DCCash of each expansion and the number bought (Profile.mExpansionsMineCount).
  expansionCash: number[];
  expansionsBought: number;
}

export interface CompanyValueParts {
  coins: number;
  gold: number;
  buildings: number;
  terrain: number;
  total: number;
}

export function companyValueParts(v: CompanyValueInput): CompanyValueParts {
  const gold = v.cash * v.cashToCoins;
  let buildings = 0;
  for (const it of v.items) if (!it.underConstruction) buildings += it.companyValue + it.contractCost;
  // Profile.getCompanyValuePerExpansions: min(expansionsGetDCCoinsWithFriends(i), expansionsGetDCCash(i) x rate);
  // both are DCCash x rate, so each bought expansion counts at its gold price in dollars.
  let expansions = 0;
  for (let i = 0; i < v.expansionsBought; i++) expansions += (v.expansionCash[i] ?? 0) * v.cashToCoins;
  const terrain = v.terrainTiles * v.terrainPrice + expansions;
  return { coins: v.coins, gold, buildings, terrain, total: v.coins + gold + buildings + terrain };
}
