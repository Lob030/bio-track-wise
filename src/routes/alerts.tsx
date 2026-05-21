import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/alerts")({
  component: () => <ModuleStub title="Alertas" description="Motor IF/THEN con builder tipo 'completa la oración' y vista previa en vivo." />,
});
