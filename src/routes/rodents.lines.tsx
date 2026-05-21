import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/rodents/lines")({
  component: () => <ModuleStub title="Líneas Genéticas — Roedores" description="Gestión de líneas genéticas por especie." />,
});
