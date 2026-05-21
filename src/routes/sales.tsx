import { createFileRoute } from "@tanstack/react-router";
import { TierGate } from "@/components/tier-gate";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/sales")({
  component: () => <TierGate min="gold" module="Ventas"><ModuleStub title="Ventas" description="Pipeline Preparando → Historial con algoritmo FIFO de vaciado de lotes." /></TierGate>,
});
