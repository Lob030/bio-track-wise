import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/insects/boxes")({
  component: () => <ModuleStub title="Cajas — Insectos" description="Cajas de insectos." />,
});
