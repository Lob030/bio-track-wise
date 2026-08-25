import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260809000001_professional_integration_hardening.sql",
  "utf8",
);
const professional = readFileSync("src/routes/professional.tsx", "utf8");
const operate = readFileSync("src/routes/operate.tsx", "utf8");
const geneticLines = readFileSync("src/components/genetic-lines-view.tsx", "utf8");
const lotScreens = [
  "src/routes/rodents.lots.tsx",
  "src/routes/insects.lots.tsx",
  "src/components/boxes-view.tsx",
].map((path) => readFileSync(path, "utf8"));

describe("professional feature integration", () => {
  it("checks both ends of site-scoped writes", () => {
    expect(migration).toContain("old_location");
    expect(migration).toContain("new_location");
    expect(migration).toContain("NOT public.can_access_location(old_location)");
    expect(migration).toContain("NOT public.can_access_location(new_location)");
  });

  it("scopes maintenance and labels and validates assignees", () => {
    expect(migration).toContain("validate_maintenance_plan_scope");
    expect(migration).toContain("El responsable no es miembro activo");
    expect(migration).toContain("maintenance_assets_member_select");
    expect(migration).toContain("Una o mas etiquetas no pertenecen al alcance autorizado");
  });

  it("finalizes lots without deleting their history", () => {
    expect(migration).toContain("public.finalize_lot_tx");
    expect(migration).toContain("REVOKE DELETE ON public.lots FROM authenticated,anon");
    for (const screen of lotScreens) {
      expect(screen).toContain('rpc("finalize_lot_tx"');
      expect(screen).not.toContain('from("lots").delete()');
    }
  });

  it("connects printed lot and location QR parameters to the operate route", () => {
    expect(professional).toContain("/operate?${entity}=${row.id}");
    expect(operate).toContain('lot: typeof search.lot === "string"');
    expect(operate).toContain('location: typeof search.location === "string"');
    expect(operate).toContain('["operate", "target-lot", search.lot]');
  });

  it("allows operators to use maintenance while retaining admin-only tabs", () => {
    expect(professional).toContain('defaultValue={isAdmin ? "control" : "maintenance"}');
    expect(professional).toContain("<MaintenancePanel isAdmin={isAdmin} />");
    expect(professional).toContain('{isAdmin && <TabsTrigger value="finance">');
  });

  it("imports genetic lines atomically instead of inserting row by row", () => {
    expect(migration).toContain("public.import_genetic_lines_tx");
    expect(migration).toContain("import:genetic_lines");
    expect(geneticLines).toContain('rpc("import_genetic_lines_tx"');
    expect(geneticLines).not.toContain("for (const r of rows)");
  });
});
