/**
 * BioTrack v4.8 - Real RLS Policy Integration Tests
 *
 * Requirements enforced:
 *   - Genuine client-side RLS enforcement checks.
 *   - Out-of-band DB state verification using service_role client.
 *   - Multi-tenant isolation testing (expect(orgIds).not.toContain(user2OrgId)).
 *   - Fixture creation using authenticated user client.
 *   - Robust tearDown in afterAll tracking all organization IDs and verifying cleanup.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function requireEnv(): void {
  if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required. " +
        "Run `npx supabase status` and export the keys. " +
        "These tests require a real Supabase instance (npx supabase start).",
    );
  }
}

type SupabaseOperationResult = {
  error: { message: string } | null;
};

async function requireSuccess<T extends SupabaseOperationResult>(
  label: string,
  operation: PromiseLike<T>,
): Promise<T> {
  const result = await operation;
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result;
}

async function collectCleanupResult(
  label: string,
  operation: PromiseLike<SupabaseOperationResult>,
  errors: Error[],
): Promise<void> {
  try {
    const result = await operation;
    if (result.error) {
      errors.push(new Error(`${label}: ${result.error.message}`));
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(new Error(`${label}: ${message}`));
  }
}

async function createAuthUser(
  serviceClient: SupabaseClient,
  email: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const password = "TestPassword123!";
  const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    throw new Error(`Failed to create test user ${email}: ${authErr?.message}`);
  }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.session) {
    throw new Error(`Failed to sign in test user ${email}: ${signInErr?.message}`);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  });

  return { client, userId: authData.user.id };
}

describe("BioTrack v4.8 - Real RLS Policy Integration Suite", () => {
  let serviceClient: SupabaseClient;
  let user1Client: SupabaseClient;
  let user1Id: string;
  let user1OrgId: string;

  let user2Client: SupabaseClient;
  let user2Id: string;
  let user2OrgId: string;
  let user1RodentSpeciesId: string;

  const createdUserIds: string[] = [];
  const createdOrgIds: Set<string> = new Set();

  beforeAll(async () => {
    requireEnv();

    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: healthErr } = await serviceClient.from("organizations").select("id").limit(1);
    if (healthErr) {
      throw new Error(`Cannot connect to Supabase: ${healthErr.message}`);
    }

    const ts = Date.now();

    // User 1 & Org 1
    const res1 = await createAuthUser(serviceClient, `rls-user1-${ts}@biotrack.test`);
    user1Client = res1.client;
    user1Id = res1.userId;
    createdUserIds.push(user1Id);

    const prof1Result = await requireSuccess(
      "Read User 1 profile",
      user1Client.from("profiles").select("organization_id").eq("id", user1Id).single(),
    );
    const prof1 = prof1Result.data;
    if (!prof1?.organization_id) throw new Error("Org 1 not created for User 1");
    user1OrgId = prof1.organization_id;
    createdOrgIds.add(user1OrgId);

    // User 2 & Org 2
    const res2 = await createAuthUser(serviceClient, `rls-user2-${ts}@biotrack.test`);
    user2Client = res2.client;
    user2Id = res2.userId;
    createdUserIds.push(user2Id);

    const prof2Result = await requireSuccess(
      "Read User 2 profile",
      user2Client.from("profiles").select("organization_id").eq("id", user2Id).single(),
    );
    const prof2 = prof2Result.data;
    if (!prof2?.organization_id) throw new Error("Org 2 not created for User 2");
    user2OrgId = prof2.organization_id;
    createdOrgIds.add(user2OrgId);

    const species = await requireSuccess(
      "Create RLS rodent species fixture",
      user1Client
        .from("species")
        .insert({ kind: "rodent", name: `RLS rodent ${ts}`, size_rules: [] })
        .select("id")
        .single(),
    );
    user1RodentSpeciesId = species.data!.id;
  });

  afterAll(async () => {
    if (!serviceClient) return;

    const orgIdsArray = Array.from(createdOrgIds);
    const cleanupErrors: Error[] = [];

    if (createdUserIds.length > 0 && orgIdsArray.length > 0) {
      const cleanupFilter =
        `actor_user_id.in.(${createdUserIds.join(",")}),` +
        `organization_id.in.(${orgIdsArray.join(",")})`;
      await collectCleanupResult(
        "Delete audit_log fixtures",
        serviceClient.from("audit_log").delete().or(cleanupFilter),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete lot_events fixtures",
        serviceClient.from("lot_events").delete().or(cleanupFilter),
        cleanupErrors,
      );
    }

    if (orgIdsArray.length > 0) {
      await collectCleanupResult(
        "Delete reproduction event fixtures",
        serviceClient.from("reproduction_events").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete inventory event fixtures",
        serviceClient.from("inventory_events").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete lots fixtures",
        serviceClient.from("lots").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete boxes fixtures",
        serviceClient.from("boxes").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete species fixtures",
        serviceClient.from("species").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete organization_invites fixtures",
        serviceClient.from("organization_invites").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
    }

    if (createdUserIds.length > 0) {
      await collectCleanupResult(
        "Delete user_roles fixtures",
        serviceClient.from("user_roles").delete().in("user_id", createdUserIds),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete profiles fixtures",
        serviceClient.from("profiles").delete().in("id", createdUserIds),
        cleanupErrors,
      );
    }

    if (orgIdsArray.length > 0) {
      await collectCleanupResult(
        "Delete final audit fixtures created by teardown triggers",
        serviceClient.from("audit_log").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
    }

    if (orgIdsArray.length > 0) {
      await collectCleanupResult(
        "Delete organizations fixtures",
        serviceClient.from("organizations").delete().in("id", orgIdsArray),
        cleanupErrors,
      );
    }

    for (const uid of createdUserIds) {
      await collectCleanupResult(
        `Delete auth user ${uid}`,
        serviceClient.auth.admin.deleteUser(uid),
        cleanupErrors,
      );
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "RLS integration cleanup failed");
    }
  });

  it("user can read their own organization", async () => {
    const { data, error } = await user1Client
      .from("organizations")
      .select("id, name")
      .eq("id", user1OrgId)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(user1OrgId);
  });

  it("multi-tenant isolation: user 1 cannot read organization 2", async () => {
    const { data: orgs } = await user1Client.from("organizations").select("id");
    const orgIds = (orgs ?? []).map((o: { id: string }) => o.id);

    expect(orgIds).toContain(user1OrgId);
    expect(orgIds).not.toContain(user2OrgId);
  });

  it("audit_log: client cannot DELETE audit records (verified via DB state)", async () => {
    // Insert audit log via service role to test client deletion prohibition
    const { data: auditEntry } = await serviceClient
      .from("audit_log")
      .insert({
        organization_id: user1OrgId,
        actor_user_id: user1Id,
        action: "invite_sent",
        target_table: "organization_invites",
        payload: { test: "delete_prevention" },
      })
      .select("id")
      .single();

    expect(auditEntry?.id).toBeDefined();

    // Client attempts DELETE
    await user1Client.from("audit_log").delete().eq("id", auditEntry!.id);

    // Verify record still exists using service role client
    const { data: checkRecord } = await serviceClient
      .from("audit_log")
      .select("id")
      .eq("id", auditEntry!.id)
      .single();

    expect(checkRecord?.id).toBe(auditEntry!.id);
  });

  it("lot_events: client cannot UPDATE lot event records (verified via DB state)", async () => {
    const { data: box } = await user1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `BOX-EVT-${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await user1Client
      .from("lots")
      .insert({
        kind: "rodent",
        species_id: user1RodentSpeciesId,
        lot_code: `LOT-EVT-${Date.now()}`,
        box_id: box!.id,
        males: 5,
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    const { data: eventRecord } = await serviceClient
      .from("lot_events")
      .insert({
        organization_id: user1OrgId,
        lot_id: lot!.id,
        actor_user_id: user1Id,
        event_type: "birth",
        notes: "Original Event Note",
      })
      .select("id")
      .single();

    expect(eventRecord?.id).toBeDefined();

    // Client attempts UPDATE
    await user1Client
      .from("lot_events")
      .update({ notes: "Malicious Tampered Note" })
      .eq("id", eventRecord!.id);

    // Verify note was NOT changed in DB via service role
    const { data: checkEvent } = await serviceClient
      .from("lot_events")
      .select("notes")
      .eq("id", eventRecord!.id)
      .single();

    expect(checkEvent?.notes).toBe("Original Event Note");
  });

  it("is_org_member RPC returns true for authenticated member", async () => {
    const { data, error } = await user1Client.rpc("is_org_member");
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("is_org_admin RPC returns true for org creator", async () => {
    const { data, error } = await user1Client.rpc("is_org_admin");
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("get_my_org_id RPC returns user's active organization ID", async () => {
    const { data, error } = await user1Client.rpc("get_my_org_id");
    expect(error).toBeNull();
    expect(data).toBe(user1OrgId);
  });
});
