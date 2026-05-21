import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/insects/lots")({
  component: () => <ModuleStub title="Lotes de Insectos" description="Gestión por masa total en gramos, sin tracking de sexo." />,
});
