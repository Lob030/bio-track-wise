import { createFileRoute } from "@tanstack/react-router";
import { BoxesView } from "@/components/boxes-view";

export const Route = createFileRoute("/insects/boxes")({
  head: () => ({
    meta: [
      { title: 'Cajas de insectos — BioTrack' },
      { name: "description", content: 'Administra las cajas de insectos de tu bioterio en BioTrack.' },
      { property: "og:title", content: 'Cajas de insectos — BioTrack' },
      { property: "og:description", content: 'Administra las cajas de insectos de tu bioterio en BioTrack.' },
      { property: "og:url", content: 'https://biostrack.lovable.app/insects/boxes' },
    ],
    links: [{ rel: "canonical", href: 'https://biostrack.lovable.app/insects/boxes' }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    box: typeof search.box === "string" ? search.box : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { box } = Route.useSearch();
  return <BoxesView kind="insect" highlightBoxId={box} />;
}
