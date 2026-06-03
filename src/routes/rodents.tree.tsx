import { createFileRoute } from "@tanstack/react-router";
import { LotTree } from "@/components/lot-tree";

export const Route = createFileRoute("/rodents/tree")({
  component: () => <LotTree kind="rodent" />,
});
