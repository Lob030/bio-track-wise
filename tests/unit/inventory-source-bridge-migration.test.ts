import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808000004_inventory_source_bridge.sql",
  "utf8",
);

describe("inventory source bridge migration contract", () => {
  it("maps every historical source to exactly one canonical supply item", () => {
    expect(migration).toContain("CREATE TABLE public.inventory_source_links");
    expect(migration).toContain("UNIQUE(organization_id,supply_item_id)");
    expect(migration).toContain("'LEGACY-FOOD-'||left(w.id::text,12)");
    expect(migration).toContain("'LEGACY-SUB-'||left(s.id::text,12)");
  });

  it("synchronizes historical balances and blocks conflicting canonical writes", () => {
    expect(migration).toContain("sync_warehouse_food_to_supply");
    expect(migration).toContain("sync_substrate_to_supply");
    expect(migration).toContain("protect_linked_supply_item");
    expect(migration).toContain("se administra desde su modulo historico");
  });

  it("uses all event ledgers for forecasting without duplicating inventory rows", () => {
    expect(migration).toContain("FROM public.feed_inventory_events");
    expect(migration).toContain("FROM public.substrate_inventory_events");
    expect(migration).toContain("LEFT JOIN public.inventory_source_links");
    expect(migration).toContain("'schema_version','20260808000004'");
  });
});
