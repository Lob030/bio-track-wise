import { createFileRoute } from "@tanstack/react-router";
import { LotTree } from "@/components/lot-tree";

export const Route = createFileRoute("/insects/tree")({
  component: () => <LotTree kind="insect" />,
});
