import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/rodents/boxes")({
  component: () => <ModuleStub title="Cajas — Roedores" description="Inventario de cajas con cálculo automático de ocupación y consumo de alimento." />,
});
