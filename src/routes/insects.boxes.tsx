import { createFileRoute } from "@tanstack/react-router";
import { BoxesView } from "@/components/boxes-view";
export const Route = createFileRoute("/insects/boxes")({
  component: () => <BoxesView kind="insect" />,
});
