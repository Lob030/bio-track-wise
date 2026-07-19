import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
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
  name: "list_active_lots",
  title: "List active lots",
  description:
    "List the signed-in user's active lots. For rodents shows males/females/unsexed; for insects shows mass in grams.",
  inputSchema: {
    kind: z.enum(["rodent", "insect"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("lots")
      .select("lot_code, kind, species_id, box_id, males, females, unsexed, mass_grams, started_at, status")
      .eq("owner_id", ctx.getUserId()!)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(limit ?? 100);
    if (kind) q = q.eq("kind", kind);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { lots: data ?? [] },
    };
  },
});
