import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260808000001_complete_costing.sql", "utf8");

describe("complete costing migration contract", () => {
  it("creates immutable organization-scoped cost and feed ledgers", () => {
    for (const table of [
      "cost_entries",
      "feed_inventory_events",
      "cost_assets",
      "asset_depreciation_postings",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain("prevent_cost_entry_mutation_trg");
    expect(migration).toContain("prevent_feed_event_mutation_trg");
    expect(migration).toContain("prevent_depreciation_mutation_trg");
  });

  it("uses idempotent transactional operations and locks mutable balances", () => {
    expect(migration).toContain("public.begin_transaction_request(_request_id, 'cost:register')");
    expect(migration).toContain("public.begin_transaction_request(_request_id, 'feed:consume')");
    expect(migration).toContain(
      "public.begin_transaction_request(_request_id, 'asset:depreciate')",
    );
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("protect_food_balance_trg");
    expect(migration).toContain("app.feed_inventory_write");
  });

  it("keeps financial data admin-only and exports all costing records", () => {
    expect(migration).toContain("cost_entries_select_admin");
    expect(migration).toContain("cost_assets_admin_all");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.lot_financial_summary");
    expect(migration).toContain("'cost_entries'");
    expect(migration).toContain("'feed_inventory_events'");
    expect(migration).toContain("'asset_depreciation_postings'");
    expect(migration).toContain("'schema_version', '20260808000001'");
  });
});
