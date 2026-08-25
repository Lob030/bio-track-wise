import { createClient } from "npm:@supabase/supabase-js@2.106.1";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const cronSecret = Deno.env.get("ALERT_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-cron-secret");
  if (!cronSecret || suppliedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "SERVER_CONFIGURATION_ERROR" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const invocationId = request.headers.get("x-invocation-id") ?? crypto.randomUUID();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: organizations, error: organizationsError } = await admin
    .from("organizations")
    .select("id");
  if (organizationsError) {
    console.error("Organization lookup failed", {
      invocationId,
      code: organizationsError.code,
    });
    return new Response(JSON.stringify({ error: "ORGANIZATION_LOOKUP_FAILED", invocationId }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const results: unknown[] = [];
  let failures = 0;
  for (const organization of organizations ?? []) {
    const { data, error } = await admin.rpc("evaluate_alert_rules", {
      _organization_id: organization.id,
      _invocation_id: `${invocationId}:${organization.id}`,
    });
    if (error) {
      failures += 1;
      console.error("Alert evaluation failed", {
        invocationId,
        organizationId: organization.id,
        code: error.code,
      });
      results.push({ organization_id: organization.id, status: "failed" });
      continue;
    }
    if (typeof data === "object" && data !== null && data.status === "failed") failures += 1;
    results.push({ organization_id: organization.id, result: data });
  }

  return new Response(
    JSON.stringify({ invocationId, organizations: results.length, failures, results }),
    {
      status: failures > 0 ? 500 : 200,
      headers: jsonHeaders,
    },
  );
});
