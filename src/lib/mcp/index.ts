import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listBoxes from "./tools/list-boxes";
import listActiveLots from "./tools/list-active-lots";
import criticalStock from "./tools/critical-stock";
import monthlyRevenue from "./tools/monthly-revenue";
import pendingOrders from "./tools/pending-orders";

// The OAuth issuer must be the direct Supabase host, not the .lovable.cloud proxy.
// VITE_SUPABASE_PROJECT_ID is inlined at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "biotrack-mcp",
  title: "BioTrack",
  version: "0.1.0",
  instructions:
    "Read-only tools for a BioTrack bioterium account. Use `list_boxes` and `list_active_lots` to inspect housing and populations, `list_critical_stock` to find warehouse food at or below the minimum threshold, `list_pending_orders` for open sales, and `monthly_revenue` for this month's delivered revenue.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listBoxes, listActiveLots, criticalStock, monthlyRevenue, pendingOrders],
});
