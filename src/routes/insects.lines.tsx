import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/insects/lines")({
  component: () => <ModuleStub title="Líneas Genéticas — Insectos" description="Líneas genéticas de insectos." />,
});
