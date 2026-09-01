import { createFileRoute } from "@tanstack/react-router";
import { LotTree } from "@/components/lot-tree";

export const Route = createFileRoute("/rodents/tree")({
  head: () => ({
    meta: [
      { title: 'Árbol genealógico de roedores — BioTrack' },
      { name: "description", content: 'Explora la genealogía y descendencia de tus roedores en BioTrack.' },
      { property: "og:title", content: 'Árbol genealógico de roedores — BioTrack' },
      { property: "og:description", content: 'Explora la genealogía y descendencia de tus roedores en BioTrack.' },
      { property: "og:url", content: 'https://biostrack.lovable.app/rodents/tree' },
    ],
    links: [{ rel: "canonical", href: 'https://biostrack.lovable.app/rodents/tree' }],
  }),
  component: () => <LotTree kind="rodent" />,
});
