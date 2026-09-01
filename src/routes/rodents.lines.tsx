import { createFileRoute } from "@tanstack/react-router";
import { GeneticLinesView } from "@/components/genetic-lines-view";
export const Route = createFileRoute("/rodents/lines")({
  head: () => ({
    meta: [
      { title: "Líneas genéticas de roedores — BioTrack" },
      {
        name: "description",
        content: "Administra las líneas genéticas de roedores de tu bioterio.",
      },
      { property: "og:title", content: "Líneas genéticas de roedores — BioTrack" },
      {
        property: "og:description",
        content: "Administra las líneas genéticas de roedores de tu bioterio.",
      },
      { property: "og:url", content: "https://biostrack.lovable.app/rodents/lines" },
    ],
    links: [{ rel: "canonical", href: "https://biostrack.lovable.app/rodents/lines" }],
  }),
  component: () => <GeneticLinesView kind="rodent" />,
});
