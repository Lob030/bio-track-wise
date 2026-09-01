export type WeightedLot = { lot_id: string; weight: number };

export function allocateCostByWeight(total: number, lots: WeightedLot[]) {
  if (!Number.isFinite(total) || total <= 0) throw new Error("INVALID_TOTAL");
  if (!lots.length || lots.some((lot) => !Number.isFinite(lot.weight) || lot.weight <= 0)) {
    throw new Error("INVALID_WEIGHTS");
  }

  const weightTotal = lots.reduce((sum, lot) => sum + lot.weight, 0);
  let allocated = 0;
  return lots.map((lot, index) => {
    const amount =
      index === lots.length - 1
        ? Math.round((total - allocated) * 10_000) / 10_000
        : Math.round(((total * lot.weight) / weightTotal) * 10_000) / 10_000;
    allocated += amount;
    return { lot_id: lot.lot_id, amount, weight: lot.weight };
  });
}

export function monthlyStraightLineDepreciation(
  acquisitionCost: number,
  residualValue: number,
  usefulLifeMonths: number,
) {
  if (
    !Number.isFinite(acquisitionCost) ||
    !Number.isFinite(residualValue) ||
    acquisitionCost <= 0 ||
    residualValue < 0 ||
    residualValue >= acquisitionCost ||
    !Number.isInteger(usefulLifeMonths) ||
    usefulLifeMonths <= 0
  ) {
    throw new Error("INVALID_ASSET");
  }
  return Math.round(((acquisitionCost - residualValue) / usefulLifeMonths) * 10_000) / 10_000;
}
