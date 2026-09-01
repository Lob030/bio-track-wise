import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

function supabaseForUser(ctx: ToolContext) {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "monthly_revenue",
  title: "Revenue for the current month",
  description:
    "Sum the total_mxn of delivered orders (status = historial) with delivered_at inside the current calendar month.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const { data, error } = await supabaseForUser(ctx)
      .from("orders")
      .select("total_mxn, delivered_at")
      .eq("owner_id", ctx.getUserId()!)
      .eq("status", "historial")
      .gte("delivered_at", start)
      .lt("delivered_at", end);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const total = (data ?? []).reduce((s, r) => s + Number(r.total_mxn ?? 0), 0);
    const summary = { month: start.slice(0, 7), orders: data?.length ?? 0, total_mxn: total };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
