import { createFileRoute } from "@tanstack/react-router";
import { GeneticLinesView } from "@/components/genetic-lines-view";
export const Route = createFileRoute("/insects/lines")({
  head: () => ({
    meta: [
      { title: 'Líneas genéticas de insectos — BioTrack' },
      { name: "description", content: 'Administra las líneas genéticas de insectos de tu bioterio.' },
      { property: "og:title", content: 'Líneas genéticas de insectos — BioTrack' },
      { property: "og:description", content: 'Administra las líneas genéticas de insectos de tu bioterio.' },
      { property: "og:url", content: 'https://biostrack.lovable.app/insects/lines' },
    ],
    links: [{ rel: "canonical", href: 'https://biostrack.lovable.app/insects/lines' }],
  }),
  component: () => <GeneticLinesView kind="insect" />,
});
