import { describe, expect, it } from "vitest";
import {
  allocateFifo,
  compareAlert,
  hasPermission,
  isInventoryConsistent,
  populationOf,
  summarizeBalances,
  validateSplit,
} from "../../src/lib/domain-rules";

describe("domain rules", () => {
  it("calculates rodent population and validates compatible sublots", () => {
    expect(populationOf({ males: 2, females: 3, unsexed: 4 })).toBe(9);
    expect(
      validateSplit("rodent", { males: 2, females: 2, unsexed: 4, mass_grams: 0 }, [
        { males: 1, females: 1, unsexed: 2, mass_grams: 0 },
      ]),
    ).toEqual({ ok: true, remaining: { males: 1, females: 1, unsexed: 2, mass_grams: 0 } });
  });

  it("rejects invalid, incompatible and overdrawn splits", () => {
    expect(validateSplit("rodent", { unsexed: 2 }, [])).toMatchObject({ reason: "EMPTY_SUBLOTS" });
    expect(validateSplit("rodent", { unsexed: 2 }, [{ unsexed: 1, mass_grams: 1 }])).toMatchObject({
      reason: "INCOMPATIBLE_RODENT_SPLIT",
    });
    expect(validateSplit("insect", { mass_grams: 5 }, [{ mass_grams: 6 }])).toMatchObject({
      reason: "INSUFFICIENT_SOURCE_BALANCE",
    });
    expect(validateSplit("insect", { mass_grams: 5 }, [{ mass_grams: -1 }])).toMatchObject({
      reason: "INVALID_QUANTITY",
    });
  });

  it("allocates FIFO oldest first without mutating the input", () => {
    const lots = [
      { id: "new", available: 4, started_at: "2026-01-02" },
      { id: "old", available: 3, started_at: "2026-01-01" },
      { id: "closed", available: 9, started_at: "2025-12-01", active: false },
    ];
    expect(allocateFifo(lots, 5)).toEqual([
      { lot_id: "old", quantity: 3 },
      { lot_id: "new", quantity: 2 },
    ]);
    expect(lots[0].available).toBe(4);
    expect(() => allocateFifo(lots, 8)).toThrow("INSUFFICIENT_STOCK");
    expect(() => allocateFifo(lots, 0)).toThrow("INVALID_REQUESTED_QUANTITY");
  });

  it("evaluates every supported alert comparison and rejects invalid values", () => {
    expect(compareAlert(5, ">", 4)).toBe(true);
    expect(compareAlert(5, ">=", 5)).toBe(true);
    expect(compareAlert(5, "<", 5)).toBe(false);
    expect(compareAlert(5, "<=", 5)).toBe(true);
    expect(compareAlert(5, "==", 5)).toBe(true);
    expect(compareAlert(Number.NaN, ">", 0)).toBe(false);
    expect(compareAlert(1, "unexpected", 1)).toBe(false);
  });

  it("keeps inventory reconciliation exact and summarizes active balances for reports", () => {
    expect(
      isInventoryConsistent(
        { males: 1, females: 2, unsexed: 3, mass_grams: 0 },
        { males: 1, females: 2, unsexed: 3, mass_grams: 0 },
      ),
    ).toBe(true);
    expect(isInventoryConsistent({ unsexed: 3 }, { unsexed: 2 })).toBe(false);
    expect(
      summarizeBalances([
        { kind: "rodent", status: "active", males: 1, females: 2 },
        { kind: "insect", status: "active", mass_grams: 42.5 },
        { kind: "rodent", status: "finalizado", unsexed: 99 },
      ]),
    ).toEqual({ rodent_population: 3, insect_biomass_grams: 42.5 });
  });

  it("enforces the same high-level role boundaries expected by the interface", () => {
    expect(hasPermission("admin", "manage_team")).toBe(true);
    expect(hasPermission("operator", "operate")).toBe(true);
    expect(hasPermission("operator", "configure")).toBe(false);
    expect(hasPermission(null, "read")).toBe(false);
  });
});
