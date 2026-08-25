export type AnimalKind = "rodent" | "insect";

export type LotBalance = {
  males?: number | null;
  females?: number | null;
  unsexed?: number | null;
  mass_grams?: number | null;
};

type NormalizedLotBalance = {
  males: number;
  females: number;
  unsexed: number;
  mass_grams: number;
};

export type SplitResult =
  | { ok: true; remaining: NormalizedLotBalance }
  | { ok: false; reason: string };

export function populationOf(balance: LotBalance): number {
  return Number(balance.males ?? 0) + Number(balance.females ?? 0) + Number(balance.unsexed ?? 0);
}

export function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function validateSplit(
  kind: AnimalKind,
  source: LotBalance,
  sublots: LotBalance[],
): SplitResult {
  if (!sublots.length) return { ok: false, reason: "EMPTY_SUBLOTS" };

  const totals = sublots.reduce<NormalizedLotBalance>(
    (total, sublot) => ({
      males: total.males + Number(sublot.males ?? 0),
      females: total.females + Number(sublot.females ?? 0),
      unsexed: total.unsexed + Number(sublot.unsexed ?? 0),
      mass_grams: total.mass_grams + Number(sublot.mass_grams ?? 0),
    }),
    { males: 0, females: 0, unsexed: 0, mass_grams: 0 },
  );

  const values = [
    ...sublots.flatMap((s) => [s.males ?? 0, s.females ?? 0, s.unsexed ?? 0, s.mass_grams ?? 0]),
  ];
  if (values.some((value) => !isFiniteNonNegative(Number(value)))) {
    return { ok: false, reason: "INVALID_QUANTITY" };
  }
  if (kind === "rodent" && (totals.mass_grams !== 0 || sublots.some((s) => populationOf(s) <= 0))) {
    return { ok: false, reason: "INCOMPATIBLE_RODENT_SPLIT" };
  }
  if (
    kind === "insect" &&
    (totals.males !== 0 ||
      totals.females !== 0 ||
      totals.unsexed !== 0 ||
      sublots.some((s) => Number(s.mass_grams ?? 0) <= 0))
  ) {
    return { ok: false, reason: "INCOMPATIBLE_INSECT_SPLIT" };
  }

  const available: NormalizedLotBalance = {
    males: Number(source.males ?? 0),
    females: Number(source.females ?? 0),
    unsexed: Number(source.unsexed ?? 0),
    mass_grams: Number(source.mass_grams ?? 0),
  };
  if (
    totals.males > available.males ||
    totals.females > available.females ||
    totals.unsexed > available.unsexed ||
    totals.mass_grams > available.mass_grams
  ) {
    return { ok: false, reason: "INSUFFICIENT_SOURCE_BALANCE" };
  }

  return {
    ok: true,
    remaining: {
      males: available.males - totals.males,
      females: available.females - totals.females,
      unsexed: available.unsexed - totals.unsexed,
      mass_grams: available.mass_grams - totals.mass_grams,
    },
  };
}

export type FifoLot = { id: string; available: number; started_at: string; active?: boolean };
export type FifoAllocation = { lot_id: string; quantity: number };

export function allocateFifo(lots: FifoLot[], requested: number): FifoAllocation[] {
  if (!Number.isFinite(requested) || requested <= 0) throw new Error("INVALID_REQUESTED_QUANTITY");
  let remaining = requested;
  const allocations: FifoAllocation[] = [];
  for (const lot of [...lots]
    .filter(
      (lot) => lot.active !== false && isFiniteNonNegative(lot.available) && lot.available > 0,
    )
    .sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    const quantity = Math.min(lot.available, remaining);
    allocations.push({ lot_id: lot.id, quantity });
    remaining -= quantity;
    if (remaining === 0) return allocations;
  }
  throw new Error("INSUFFICIENT_STOCK");
}

export function compareAlert(value: number, operator: string, threshold: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(threshold)) return false;
  switch (operator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case "=":
    case "==":
      return value === threshold;
    default:
      return false;
  }
}

export function isInventoryConsistent(current: LotBalance, ledger: LotBalance): boolean {
  return (
    Number(current.males ?? 0) === Number(ledger.males ?? 0) &&
    Number(current.females ?? 0) === Number(ledger.females ?? 0) &&
    Number(current.unsexed ?? 0) === Number(ledger.unsexed ?? 0) &&
    Number(current.mass_grams ?? 0) === Number(ledger.mass_grams ?? 0)
  );
}

export function hasPermission(
  role: "admin" | "operator" | null,
  action: "manage_team" | "configure" | "operate" | "read",
): boolean {
  if (!role) return false;
  if (action === "read" || action === "operate") return true;
  return role === "admin";
}

export type ReportLot = LotBalance & { kind: AnimalKind; status: "active" | "finalizado" };

export function summarizeBalances(lots: ReportLot[]) {
  return lots
    .filter((lot) => lot.status === "active")
    .reduce(
      (summary, lot) => {
        if (lot.kind === "rodent") summary.rodent_population += populationOf(lot);
        else summary.insect_biomass_grams += Number(lot.mass_grams ?? 0);
        return summary;
      },
      { rodent_population: 0, insect_biomass_grams: 0 },
    );
}
