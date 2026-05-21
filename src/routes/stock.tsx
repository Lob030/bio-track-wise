import { createFileRoute } from "@tanstack/react-router";
import { TierGate } from "@/components/tier-gate";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/stock")({
  component: () => <TierGate min="gold" module="Stock"><ModuleStub title="Stock" description="Toggle Roedores/Insectos con grids por especie y tabla de masa por semana." /></TierGate>,
});
