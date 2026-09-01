import { describe, expect, it } from "vitest";
import {
  allocateCostByWeight,
  monthlyStraightLineDepreciation,
} from "../../src/lib/cost-allocation";

describe("complete costing rules", () => {
  it("allocates all cost without losing rounding differences", () => {
    const allocations = allocateCostByWeight(100, [
      { lot_id: "a", weight: 1 },
      { lot_id: "b", weight: 2 },
      { lot_id: "c", weight: 3 },
    ]);
    expect(allocations.reduce((sum, item) => sum + item.amount, 0)).toBe(100);
    expect(allocations[2].amount).toBe(50);
  });

  it("calculates straight-line monthly depreciation", () => {
    expect(monthlyStraightLineDepreciation(1200, 0, 24)).toBe(50);
    expect(monthlyStraightLineDepreciation(1300, 100, 24)).toBe(50);
  });

  it("rejects invalid costs, weights and assets", () => {
    expect(() => allocateCostByWeight(0, [{ lot_id: "a", weight: 1 }])).toThrow("INVALID_TOTAL");
    expect(() => allocateCostByWeight(10, [{ lot_id: "a", weight: 0 }])).toThrow("INVALID_WEIGHTS");
    expect(() => monthlyStraightLineDepreciation(100, 100, 12)).toThrow("INVALID_ASSET");
  });
});
