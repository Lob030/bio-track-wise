import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808000002_operational_management_suite.sql",
  "utf8",
);

describe("operational management migration contract", () => {
  it("models every requested operational domain except compliance", () => {
    for (const table of [
      "facility_locations",
      "operational_protocols",
      "operational_tasks",
      "health_cases",
      "health_treatments",
      "breeding_programs",
      "supply_items",
      "supply_batches",
      "purchase_orders",
      "supply_inventory_events",
    ]) {
      expect(migration).toContain(`CREATE TABLE public.${table}`);
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("keeps critical mutations transactional and idempotent", () => {
    for (const operation of [
      "location:assign",
      "task:complete",
      "health:open",
      "health:treatment",
      "health:close",
      "supply:order",
      "supply:receive",
      "supply:consume",
    ]) {
      expect(migration).toContain(`'${operation}'`);
    }
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("prevent_operational_event_mutation");
    expect(migration).toContain("public.allocate_cost_entry");
  });

  it("enforces physical, protocol and health restrictions in PostgreSQL", () => {
    expect(migration).toContain("validate_facility_location_tree");
    expect(migration).toContain("protect_box_location_trg");
    expect(migration).toContain("capacidad maxima de cajas");
    expect(migration).toContain("validate_protocol_assignment_target");
    expect(migration).toContain("enforce_sale_health_restriction_trg");
    expect(migration).toContain("enforce_reproduction_health_restriction_trg");
    expect(migration).toContain("REVOKE INSERT,UPDATE,DELETE ON public.purchase_orders");
  });

  it("provides atomic purchasing, FIFO consumption and labor costing", () => {
    expect(migration).toContain("create_supply_purchase_order_tx");
    expect(migration).toContain("consume_supply_tx");
    expect(migration).toContain("ORDER BY expiry_date ASC NULLS LAST,received_at,id FOR UPDATE");
    expect(migration).toContain("set_default_labor_cost_tx");
  });

  it("provides planning, reproduction and executive projections", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW public.operational_planning_summary");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.reproduction_performance");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.executive_dashboard");
    expect(migration).toContain("'schema_version','20260808000002'");
  });
});
