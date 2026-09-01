export function substrateUsageCost(grams: number, costPerKg: number): number {
  if (!Number.isFinite(grams) || grams <= 0) throw new Error("INVALID_GRAMS");
  if (!Number.isFinite(costPerKg) || costPerKg < 0) throw new Error("INVALID_COST");
  return Math.round(((grams * costPerKg) / 1000) * 10_000) / 10_000;
}

export function weightedCostPerKg(
  currentGrams: number,
  currentCostPerKg: number,
  incomingGrams: number,
  incomingTotalCost: number,
): number {
  if (currentGrams < 0 || currentCostPerKg < 0 || incomingGrams <= 0 || incomingTotalCost < 0) {
    throw new Error("INVALID_INVENTORY_VALUES");
  }
  const newStock = currentGrams + incomingGrams;
  const totalValue = (currentGrams * currentCostPerKg) / 1000 + incomingTotalCost;
  return Math.round((totalValue / newStock) * 1000 * 10_000) / 10_000;
}

export function recommendedSubstrateGrams(
  eventType: "setup" | "replacement",
  rule?: { setup_grams: number; replacement_grams: number } | null,
): number | null {
  if (!rule) return null;
  const value = eventType === "setup" ? rule.setup_grams : rule.replacement_grams;
  return value > 0 ? value : null;
}
