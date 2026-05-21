import { createFileRoute } from "@tanstack/react-router";
import { TierGate } from "@/components/tier-gate";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/reports")({
  component: () => <TierGate min="gold" module="Reportes"><ModuleStub title="Reportes" description="Tabs estándar (día/semana/mes/año) + analíticas especializadas de desempeño reproductor." /></TierGate>,
});
