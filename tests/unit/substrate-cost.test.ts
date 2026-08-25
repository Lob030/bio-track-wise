import { describe, expect, it } from "vitest";
import {
  recommendedSubstrateGrams,
  substrateUsageCost,
  weightedCostPerKg,
} from "../../src/lib/substrate-cost";

describe("substrate costs", () => {
  it("calculates a historical usage cost from grams and cost per kilogram", () => {
    expect(substrateUsageCost(250, 32)).toBe(8);
    expect(substrateUsageCost(333, 12.5)).toBe(4.1625);
  });

  it("calculates weighted average cost when stock is replenished", () => {
    expect(weightedCostPerKg(1000, 20, 1000, 40)).toBe(30);
    expect(weightedCostPerKg(0, 0, 500, 25)).toBe(50);
  });

  it("uses the configured amount for setup and replacement", () => {
    const rule = { setup_grams: 500, replacement_grams: 300 };
    expect(recommendedSubstrateGrams("setup", rule)).toBe(500);
    expect(recommendedSubstrateGrams("replacement", rule)).toBe(300);
    expect(recommendedSubstrateGrams("setup", null)).toBeNull();
  });

  it("rejects impossible inventory values", () => {
    expect(() => substrateUsageCost(-1, 20)).toThrow("INVALID_GRAMS");
    expect(() => weightedCostPerKg(10, 2, 0, 1)).toThrow("INVALID_INVENTORY_VALUES");
  });
});
