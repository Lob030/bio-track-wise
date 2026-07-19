import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

function supabaseForUser(ctx: ToolContext) {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_critical_stock",
  title: "List warehouse items at or below minimum stock",
  description:
    "Return warehouse food items whose current quantity is at or below the configured minimum stock threshold.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("warehouse_food")
      .select("id, name, quantity_grams, min_stock_grams")
      .eq("owner_id", ctx.getUserId());
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const critical = (data ?? []).filter(
      (r) => (r.min_stock_grams ?? 0) > 0 && (r.quantity_grams ?? 0) <= (r.min_stock_grams ?? 0),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(critical) }],
      structuredContent: { items: critical, count: critical.length },
    };
  },
});
