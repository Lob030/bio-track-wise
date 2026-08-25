import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808000005_professional_control_center.sql",
  "utf8",
);

describe("professional control center migration contract", () => {
  it("enforces four-eyes inventory adjustments", () => {
    expect(migration).toContain("adjustment_approval_requests");
    expect(migration).toContain("a.requested_by=auth.uid()");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.adjust_supply_tx(uuid,uuid,numeric,text,text)",
    );
  });

  it("provides reconciliation, exceptions, profitability and purchasing forecasts", () => {
    expect(migration).toContain("public.operational_reconciliation");
    expect(migration).toContain("public.operational_exceptions");
    expect(migration).toContain("'client'");
    expect(migration).toContain("public.professional_procurement_forecast");
  });

  it("protects maintenance, labels and atomic imports by organization", () => {
    expect(migration).toContain("public.complete_maintenance_tx");
    expect(migration).toContain("valid_count<>cardinality(_entity_ids)");
    expect(migration).toContain("public.validate_import_job_tx");
    expect(migration).toContain("public.apply_import_job_tx");
    expect(migration).toContain("FOR UPDATE");
  });

  it("adds scoped facility access and exports the complete schema", () => {
    expect(migration).toContain("public.can_access_location");
    expect(migration).toContain("public.enforce_facility_write_scope");
    expect(migration).toContain("public.facility_user_access");
    expect(migration).toContain("'schema_version','20260808000005'");
  });
});
