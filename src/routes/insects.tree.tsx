import { createFileRoute } from "@tanstack/react-router";
import { LotTree } from "@/components/lot-tree";

export const Route = createFileRoute("/insects/tree")({
  head: () => ({
    meta: [
      { title: "Árbol genealógico de insectos — BioTrack" },
      {
        name: "description",
        content: "Explora la genealogía y descendencia de tus insectos en BioTrack.",
      },
      { property: "og:title", content: "Árbol genealógico de insectos — BioTrack" },
      {
        property: "og:description",
        content: "Explora la genealogía y descendencia de tus insectos en BioTrack.",
      },
      { property: "og:url", content: "https://biostrack.lovable.app/insects/tree" },
    ],
    links: [{ rel: "canonical", href: "https://biostrack.lovable.app/insects/tree" }],
  }),
  component: () => <LotTree kind="insect" />,
});
