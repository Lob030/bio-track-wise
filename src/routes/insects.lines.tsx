import { createFileRoute } from "@tanstack/react-router";
import { GeneticLinesView } from "@/components/genetic-lines-view";
export const Route = createFileRoute("/insects/lines")({
  component: () => <GeneticLinesView kind="insect" />,
});
