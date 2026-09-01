import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808000003_product_consolidation.sql",
  "utf8",
);

describe("product consolidation migration contract", () => {
  it("prevents duplicate active protocols and validates task definitions", () => {
    expect(migration).toContain("protocol_assignments_one_active_lot_uidx");
    expect(migration).toContain("protocol_assignments_one_active_box_uidx");
    expect(migration).toContain("validate_protocol_task_definitions");
    expect(migration).toContain("jsonb_array_elements(NEW.task_definitions)");
  });

  it("creates breeding programs through a guarded idempotent transaction", () => {
    expect(migration).toContain("create_breeding_program_tx");
    expect(migration).toContain("'breeding:create'");
    expect(migration).toContain("reproduction_restricted");
    expect(migration).toContain(
      "REVOKE INSERT,UPDATE,DELETE ON public.breeding_programs FROM authenticated,anon",
    );
  });

  it("connects FIFO consumption, waste and adjustments to costs and typed references", () => {
    expect(migration).toContain("_event_type NOT IN ('consumption','waste')");
    expect(migration).toContain("operation_request_id uuid");
    expect(migration).toContain("cost_entry_id uuid");
    expect(migration).toContain("public.allocate_cost_entry");
    expect(migration).toContain("La caja tiene varios lotes activos");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.adjust_supply_tx");
  });

  it("supports partial receipts, cancellation and stock forecasting", () => {
    expect(migration).toContain("quantity_received+_quantity>_line.quantity_ordered");
    expect(migration).toContain("cancel_supply_purchase_order_tx");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.unified_inventory");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.supply_forecast");
  });

  it("generates timezone-aware work and protects shift administration", () => {
    expect(migration).toContain("validate_organization_timezone");
    expect(migration).toContain("CREATE TABLE public.operational_shifts");
    expect(migration).toContain("generate_all_operational_tasks");
    expect(migration).toContain("auth.role()<>'service_role'");
    expect(migration).toContain(
      "REVOKE INSERT,UPDATE,DELETE ON public.operational_shifts,public.operational_shift_members",
    );
  });

  it("exports the new operational schema version", () => {
    expect(migration).toContain("'schema_version','20260808000003'");
    expect(migration).toContain("'operational_shift_members'");
  });
});
