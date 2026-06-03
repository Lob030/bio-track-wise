import { createFileRoute } from "@tanstack/react-router";
import { BoxesView } from "@/components/boxes-view";

export const Route = createFileRoute("/insects/boxes")({
  validateSearch: (search: Record<string, unknown>) => ({
    box: typeof search.box === "string" ? search.box : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { box } = Route.useSearch();
  return <BoxesView kind="insect" highlightBoxId={box} />;
}
