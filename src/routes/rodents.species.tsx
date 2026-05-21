import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";
export const Route = createFileRoute("/rodents/species")({
  component: () => <ModuleStub title="Especies de Roedores" description="Catálogo de especies con reglas de tallas por días (Pinky 0-6d, Fuzzy 7-14d, Jumper 15-21d)." />,
});
