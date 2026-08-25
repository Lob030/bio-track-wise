import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260803000001_box_types_and_substrates.sql",
  "utf8",
);

describe("box type and substrate migration contract", () => {
  it("defines organization-scoped catalogs and immutable event ledgers", () => {
    for (const table of [
      "box_types",
      "substrates",
      "box_substrate_rules",
      "substrate_inventory_events",
      "box_service_events",
      "lot_cost_allocations",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("prevent_substrate_event_mutation_trg");
    expect(migration).toContain("prevent_box_service_mutation_trg");
    expect(migration).toContain("prevent_lot_cost_mutation_trg");
  });

  it("provides idempotent transactional operations and protects direct balances", () => {
    expect(migration).toContain("public.begin_transaction_request(_request_id, 'box_type:create')");
    expect(migration).toContain(
      "public.begin_transaction_request(_request_id, 'box:create_from_type')",
    );
    expect(migration).toContain(
      "public.begin_transaction_request(_request_id, 'substrate:stock_in')",
    );
    expect(migration).toContain(
      "public.begin_transaction_request(_request_id, 'substrate:consume')",
    );
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("protect_substrate_balance_trg");
    expect(migration).toContain("app.substrate_inventory_write");
  });

  it("keeps cross-organization references composite and exports the new records", () => {
    expect(migration).toContain("FOREIGN KEY (organization_id, box_type_id, kind)");
    expect(migration).toContain("FOREIGN KEY (organization_id, substrate_event_id)");
    expect(migration).toContain("'substrate_inventory_events'");
    expect(migration).toContain("'lot_cost_allocations'");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.lot_production_costs");
  });
});
