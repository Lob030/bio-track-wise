import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/insects/species")({
  component: () => <ModuleStub title="Especies de Insectos" description="Catálogo con métrica de individuos por gramo por semana." />,
});
