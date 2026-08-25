import { createClient } from "npm:@supabase/supabase-js@2.106.1";

const headers = { "content-type": "application/json; charset=utf-8" };

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers });
  }
  const secret = Deno.env.get("OPERATIONS_CRON_SECRET");
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "SERVER_CONFIGURATION_ERROR" }), {
      status: 500,
      headers,
    });
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requestedDate = new URL(request.url).searchParams.get("date");
  const { data, error } = await admin.rpc("generate_all_operational_tasks", {
    _for_date: requestedDate || new Date().toISOString().slice(0, 10),
  });
  if (error) {
    console.error("Operational task generation failed", { code: error.code });
    return new Response(JSON.stringify({ error: "GENERATION_FAILED" }), { status: 500, headers });
  }
  return new Response(JSON.stringify(data), { status: 200, headers });
});
