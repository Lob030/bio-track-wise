import { createFileRoute } from "@tanstack/react-router";
import { BoxesView } from "@/components/boxes-view";
export const Route = createFileRoute("/rodents/boxes")({
  component: () => <BoxesView kind="rodent" />,
});
