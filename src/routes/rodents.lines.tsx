import { createFileRoute } from "@tanstack/react-router";
import { GeneticLinesView } from "@/components/genetic-lines-view";
export const Route = createFileRoute("/rodents/lines")({
  component: () => <GeneticLinesView kind="rodent" />,
});
