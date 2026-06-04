import { createFileRoute } from "@tanstack/react-router";
import { BoxesView } from "@/components/boxes-view";

export const Route = createFileRoute("/rodents/boxes")({
  head: () => ({
    meta: [
      { title: 'Cajas de roedores — BioTrack' },
      { name: "description", content: 'Administra las cajas de roedores de tu bioterio en BioTrack.' },
      { property: "og:title", content: 'Cajas de roedores — BioTrack' },
      { property: "og:description", content: 'Administra las cajas de roedores de tu bioterio en BioTrack.' },
      { property: "og:url", content: 'https://biostrack.lovable.app/rodents/boxes' },
    ],
    links: [{ rel: "canonical", href: 'https://biostrack.lovable.app/rodents/boxes' }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    box: typeof search.box === "string" ? search.box : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { box } = Route.useSearch();
  return <BoxesView kind="rodent" highlightBoxId={box} />;
}
