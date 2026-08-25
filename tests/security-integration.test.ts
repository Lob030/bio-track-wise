/**
 * BioTrack v4.8 - Real Supabase Integration Tests
 *
 * Requirements enforced:
 *   - Real Supabase authentication (admin, operator, secondary org users).
 *   - Invite & accept flow for admin2 and operator (no orphan user_roles inserts).
 *   - Explicit organization_id, role, and status assertions before tests run.
 *   - RLS checks verified against live DB state via service_role client.
 *   - adjust_lot permissions, kind checks, atomic finalization, tag updates, and no-op audit prevention.
 *   - Single adjust_lot signature and 2 FIFO signatures verified via get_security_function_signatures RPC.
 *   - Strict concurrency test for manage_team_member last admin protection (exactly 1 active admin remaining).
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

function requireAcceptedInvite(label: string, data: unknown): void {
  const result = data as { success?: boolean; status?: string; message?: string } | null;
  if (!result?.success) {
    throw new Error(
      `${label}: ${result?.message ?? `unexpected status ${result?.status ?? "unknown"}`}`,
    );
  }
}

function requireInviteToken(label: string, data: unknown): string {
  const invite = data as { token?: string } | null;
  if (!invite?.token) {
    throw new Error(`${label}: database did not return an invitation token`);
  }
  return invite.token;
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

describe("BioTrack v4.8 - Real Supabase Integration Suite", () => {
  let serviceClient: SupabaseClient;

  // Org 1 Users
  let admin1Client: SupabaseClient;
  let admin1Id: string;
  let admin2Client: SupabaseClient;
  let admin2Id: string;
  let operatorClient: SupabaseClient;
  let operatorId: string;
  let org1Id: string;

  // Org 2 Users
  let org2AdminClient: SupabaseClient;
  let org2AdminId: string;
  let org2Id: string;
  let org1RodentSpeciesId: string;
  let org1InsectSpeciesId: string;
  let org2RodentSpeciesId: string;

  // Track created user IDs and organization IDs for clean teardown
  const createdUserIds: string[] = [];
  const createdOrgIds: Set<string> = new Set();

  async function createRodentSaleFixture(stock: number, label: string) {
    const stamp = `${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const speciesResult = await requireSuccess(
      "Create transactional species fixture",
      admin1Client
        .from("species")
        .insert({ kind: "rodent", name: `Species-${stamp}`, size_rules: [] })
        .select("id")
        .single(),
    );
    const clientResult = await requireSuccess(
      "Create transactional client fixture",
      admin1Client
        .from("clients")
        .insert({ name: `Client-${stamp}`, phone: "5550000000" })
        .select("id")
        .single(),
    );
    const boxResult = await requireSuccess(
      "Create transactional box fixture",
      admin1Client
        .from("boxes")
        .insert({ kind: "rodent", code: `BOX-${stamp}` })
        .select("id")
        .single(),
    );
    const lotResult = await requireSuccess(
      "Create transactional lot fixture",
      admin1Client
        .from("lots")
        .insert({
          kind: "rodent",
          species_id: speciesResult.data!.id,
          box_id: boxResult.data!.id,
          lot_code: `LOT-${stamp}`,
          unsexed: stock,
          started_at: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single(),
    );

    return {
      speciesId: speciesResult.data!.id,
      clientId: clientResult.data!.id,
      boxId: boxResult.data!.id,
      lotId: lotResult.data!.id,
    };
  }

  beforeAll(async () => {
    requireEnv();

    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: healthErr } = await serviceClient.from("organizations").select("id").limit(1);
    if (healthErr) {
      throw new Error(
        `Cannot connect to Supabase at ${SUPABASE_URL}: ${healthErr.message}. ` +
          "Ensure Docker is running and `npx supabase start` has been executed.",
      );
    }

    const ts = Date.now();

    // 1. Create Admin 1 (Org 1)
    const emailAdmin1 = `admin1-${ts}@biotrack.test`;
    const admin1Res = await createAuthUser(serviceClient, emailAdmin1);
    admin1Client = admin1Res.client;
    admin1Id = admin1Res.userId;
    createdUserIds.push(admin1Id);

    const { data: prof1, error: prof1Err } = await admin1Client
      .from("profiles")
      .select("organization_id")
      .eq("id", admin1Id)
      .single();
    if (prof1Err || !prof1?.organization_id) throw new Error("Org 1 not created for Admin 1");
    org1Id = prof1.organization_id;
    createdOrgIds.add(org1Id);

    // 2. Create Invite & Accept Flow for Admin 2 in Org 1
    const emailAdmin2 = `admin2-${ts}@biotrack.test`;

    const { data: inviteAdmin2, error: invAdmin2Err } = await admin1Client.rpc(
      "create_organization_invite",
      { _email: emailAdmin2, _role: "operator" },
    );
    if (invAdmin2Err) {
      throw new Error(`Failed to create invite for Admin 2: ${invAdmin2Err?.message}`);
    }
    const inviteAdmin2Token = requireInviteToken(
      "Failed to create invite for Admin 2",
      inviteAdmin2,
    );

    // Create & authenticate Admin 2 user
    const admin2Res = await createAuthUser(serviceClient, emailAdmin2);
    admin2Client = admin2Res.client;
    admin2Id = admin2Res.userId;
    createdUserIds.push(admin2Id);

    // Track temp org created for Admin 2 by handle_new_user
    const tempProfAdmin2Result = await requireSuccess(
      "Read Admin 2 profile before accepting invite",
      serviceClient.from("profiles").select("organization_id").eq("id", admin2Id).single(),
    );
    const tempProfAdmin2 = tempProfAdmin2Result.data;
    if (tempProfAdmin2?.organization_id) createdOrgIds.add(tempProfAdmin2.organization_id);

    // Admin 2 accepts invitation
    const { data: acceptAdmin2Res, error: acceptAdmin2Err } = await admin2Client.rpc(
      "accept_invite",
      { _token: inviteAdmin2Token },
    );
    if (acceptAdmin2Err) {
      throw new Error(`Admin 2 failed to accept invite: ${acceptAdmin2Err.message}`);
    }
    requireAcceptedInvite("Admin 2 failed to accept invite", acceptAdmin2Res);

    const acceptedAdmin2RoleResult = await requireSuccess(
      "Read Admin 2 role after accepting invite",
      serviceClient
        .from("user_roles")
        .select("organization_id, role, status")
        .eq("user_id", admin2Id)
        .single(),
    );
    expect(acceptedAdmin2RoleResult.data?.organization_id).toBe(org1Id);
    expect(acceptedAdmin2RoleResult.data?.role).toBe("operator");
    expect(acceptedAdmin2RoleResult.data?.status).toBe("active");

    // Upgrade Admin 2 to admin role via manage_team_member
    const { error: roleAdmin2Err } = await admin1Client.rpc("manage_team_member", {
      _target_user_id: admin2Id,
      _action: "change_role",
      _new_role: "admin",
    });
    if (roleAdmin2Err) {
      throw new Error(`Failed to set admin role for Admin 2: ${roleAdmin2Err.message}`);
    }

    // 3. Create Invite & Accept Flow for Operator in Org 1
    const emailOperator = `operator-${ts}@biotrack.test`;

    const { data: inviteOp, error: invOpErr } = await admin1Client.rpc(
      "create_organization_invite",
      { _email: emailOperator, _role: "operator" },
    );
    if (invOpErr) {
      throw new Error(`Failed to create invite for Operator: ${invOpErr?.message}`);
    }
    const inviteOpToken = requireInviteToken("Failed to create invite for Operator", inviteOp);

    const opRes = await createAuthUser(serviceClient, emailOperator);
    operatorClient = opRes.client;
    operatorId = opRes.userId;
    createdUserIds.push(operatorId);

    const tempProfOpResult = await requireSuccess(
      "Read Operator profile before accepting invite",
      serviceClient.from("profiles").select("organization_id").eq("id", operatorId).single(),
    );
    const tempProfOp = tempProfOpResult.data;
    if (tempProfOp?.organization_id) createdOrgIds.add(tempProfOp.organization_id);

    const { data: acceptOpRes, error: acceptOpErr } = await operatorClient.rpc("accept_invite", {
      _token: inviteOpToken,
    });
    if (acceptOpErr) {
      throw new Error(`Operator failed to accept invite: ${acceptOpErr.message}`);
    }
    requireAcceptedInvite("Operator failed to accept invite", acceptOpRes);

    // 4. Create Org 2 Admin
    const emailOrg2Admin = `org2admin-${ts}@biotrack.test`;
    const org2Res = await createAuthUser(serviceClient, emailOrg2Admin);
    org2AdminClient = org2Res.client;
    org2AdminId = org2Res.userId;
    createdUserIds.push(org2AdminId);

    const { data: prof2, error: prof2Err } = await org2AdminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", org2AdminId)
      .single();
    if (prof2Err || !prof2?.organization_id) throw new Error("Org 2 not created for Org 2 Admin");
    org2Id = prof2.organization_id;
    createdOrgIds.add(org2Id);

    // 5. Verification of User Setup States Before Tests
    const admin1RoleResult = await requireSuccess(
      "Read Admin 1 membership",
      serviceClient
        .from("user_roles")
        .select("organization_id, role, status")
        .eq("user_id", admin1Id)
        .single(),
    );
    const admin1Role = admin1RoleResult.data;
    expect(admin1Role?.organization_id).toBe(org1Id);
    expect(admin1Role?.role).toBe("admin");
    expect(admin1Role?.status).toBe("active");

    const admin2RoleResult = await requireSuccess(
      "Read Admin 2 membership",
      serviceClient
        .from("user_roles")
        .select("organization_id, role, status")
        .eq("user_id", admin2Id)
        .single(),
    );
    const admin2Role = admin2RoleResult.data;
    expect(admin2Role?.organization_id).toBe(org1Id);
    expect(admin2Role?.role).toBe("admin");
    expect(admin2Role?.status).toBe("active");

    const opRoleResult = await requireSuccess(
      "Read Operator membership",
      serviceClient
        .from("user_roles")
        .select("organization_id, role, status")
        .eq("user_id", operatorId)
        .single(),
    );
    const opRole = opRoleResult.data;
    expect(opRole?.organization_id).toBe(org1Id);
    expect(opRole?.role).toBe("operator");
    expect(opRole?.status).toBe("active");

    const org2RoleResult = await requireSuccess(
      "Read Org 2 Admin membership",
      serviceClient
        .from("user_roles")
        .select("organization_id, role, status")
        .eq("user_id", org2AdminId)
        .single(),
    );
    const org2Role = org2RoleResult.data;
    expect(org2Role?.organization_id).toBe(org2Id);
    expect(org2Role?.role).toBe("admin");
    expect(org2Role?.status).toBe("active");

    const [org1Rodent, org1Insect, org2Rodent] = await Promise.all([
      requireSuccess(
        "Create default Org 1 rodent species",
        admin1Client
          .from("species")
          .insert({ kind: "rodent", name: `Default rodent ${ts}`, size_rules: [] })
          .select("id")
          .single(),
      ),
      requireSuccess(
        "Create default Org 1 insect species",
        admin1Client
          .from("species")
          .insert({ kind: "insect", name: `Default insect ${ts}`, size_rules: [] })
          .select("id")
          .single(),
      ),
      requireSuccess(
        "Create default Org 2 rodent species",
        org2AdminClient
          .from("species")
          .insert({ kind: "rodent", name: `Default rodent org2 ${ts}`, size_rules: [] })
          .select("id")
          .single(),
      ),
    ]);
    org1RodentSpeciesId = org1Rodent.data!.id;
    org1InsectSpeciesId = org1Insect.data!.id;
    org2RodentSpeciesId = org2Rodent.data!.id;
  });

  afterAll(async () => {
    if (!serviceClient) return;

    const orgIdsArray = Array.from(createdOrgIds);
    const cleanupErrors: Error[] = [];

    // Orderly teardown respecting FK dependencies
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
        "Delete depreciation posting fixtures",
        serviceClient
          .from("asset_depreciation_postings")
          .delete()
          .in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete feed inventory event fixtures",
        serviceClient.from("feed_inventory_events").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete lot cost allocation fixtures",
        serviceClient.from("lot_cost_allocations").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete cost entry fixtures",
        serviceClient.from("cost_entries").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete box service event fixtures",
        serviceClient.from("box_service_events").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete substrate event fixtures",
        serviceClient
          .from("substrate_inventory_events")
          .delete()
          .in("organization_id", orgIdsArray),
        cleanupErrors,
      );
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
        "Delete transaction request fixtures",
        serviceClient.from("transaction_requests").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete order allocation fixtures",
        serviceClient.from("order_item_allocations").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete order item fixtures",
        serviceClient.from("order_items").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete order fixtures",
        serviceClient.from("orders").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Unlink purchase fixtures from lots",
        serviceClient
          .from("warehouse_purchases")
          .update({ converted_to_lot_id: null })
          .in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete lots fixtures",
        serviceClient.from("lots").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete purchase fixtures",
        serviceClient.from("warehouse_purchases").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete cost asset fixtures",
        serviceClient.from("cost_assets").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete food fixtures",
        serviceClient.from("warehouse_food").delete().in("owner_id", createdUserIds),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete boxes fixtures",
        serviceClient.from("boxes").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete box substrate rule fixtures",
        serviceClient.from("box_substrate_rules").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete box type fixtures",
        serviceClient.from("box_types").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete substrate fixtures",
        serviceClient.from("substrates").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete species fixtures",
        serviceClient.from("species").delete().in("organization_id", orgIdsArray),
        cleanupErrors,
      );
      await collectCleanupResult(
        "Delete client fixtures",
        serviceClient.from("clients").delete().in("organization_id", orgIdsArray),
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
      throw new AggregateError(cleanupErrors, "Security integration cleanup failed");
    }
  });

  // ---- 1. Concurrency Protection Test ----

  it("multi-tenant isolation: operator cannot read lots from another organization", async () => {
    const ownBoxResult = await requireSuccess(
      "Create Org 1 box",
      admin1Client
        .from("boxes")
        .insert({ kind: "rodent", code: `BOX-ORG1-${Date.now()}` })
        .select("id")
        .single(),
    );
    const ownLotResult = await requireSuccess(
      "Create Org 1 lot",
      admin1Client
        .from("lots")
        .insert({
          kind: "rodent",
          species_id: org1RodentSpeciesId,
          lot_code: `LOT-ORG1-${Date.now()}`,
          box_id: ownBoxResult.data!.id,
          males: 2,
          started_at: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single(),
    );

    const foreignBoxResult = await requireSuccess(
      "Create Org 2 box",
      org2AdminClient
        .from("boxes")
        .insert({ kind: "rodent", code: `BOX-ORG2-${Date.now()}` })
        .select("id")
        .single(),
    );
    const foreignLotResult = await requireSuccess(
      "Create Org 2 lot",
      org2AdminClient
        .from("lots")
        .insert({
          kind: "rodent",
          species_id: org2RodentSpeciesId,
          lot_code: `LOT-ORG2-${Date.now()}`,
          box_id: foreignBoxResult.data!.id,
          males: 3,
          started_at: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single(),
    );

    const visibleLots = await requireSuccess(
      "Operator reads permitted lots",
      operatorClient.from("lots").select("id"),
    );
    const visibleIds = (visibleLots.data ?? []).map((lot) => lot.id);
    expect(visibleIds).toContain(ownLotResult.data!.id);
    expect(visibleIds).not.toContain(foreignLotResult.data!.id);
  });

  it("operator can query permitted organization data", async () => {
    const organizations = await requireSuccess(
      "Operator reads organization",
      operatorClient.from("organizations").select("id"),
    );
    expect(organizations.data).toEqual([{ id: org1Id }]);

    const memberResult = await requireSuccess(
      "Operator checks active membership",
      operatorClient.rpc("is_org_member"),
    );
    expect(memberResult.data).toBe(true);
  });

  it("audit trail: captures a row insertion with actor, organization, origin and values", async () => {
    const marker = `AUDIT-BOX-${crypto.randomUUID()}`;
    const box = await requireSuccess(
      "Create audited box",
      admin1Client.from("boxes").insert({ kind: "rodent", code: marker }).select("id").single(),
    );

    const audit = await requireSuccess(
      "Read inserted audit event",
      serviceClient
        .from("audit_log")
        .select(
          "organization_id,actor_user_id,action,operation,target_table,target_id,old_values,new_values,origin,entry_hash",
        )
        .eq("organization_id", org1Id)
        .eq("target_table", "boxes")
        .eq("target_id", box.data!.id)
        .eq("operation", "insert:boxes")
        .single(),
    );

    expect(audit.data?.organization_id).toBe(org1Id);
    expect(audit.data?.actor_user_id).toBe(admin1Id);
    expect(audit.data?.action).toBe("record_created");
    expect(audit.data?.old_values).toBeNull();
    expect(audit.data?.new_values).toMatchObject({ id: box.data!.id, code: marker });
    expect(audit.data?.origin).toBeTruthy();
    expect(audit.data?.entry_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("audit trail: normal users cannot update or delete entries", async () => {
    const marker = `AUDIT-IMMUTABLE-${crypto.randomUUID()}`;
    const box = await requireSuccess(
      "Create immutable audit fixture",
      admin1Client.from("boxes").insert({ kind: "rodent", code: marker }).select("id").single(),
    );
    const event = await requireSuccess(
      "Read immutable audit fixture",
      serviceClient
        .from("audit_log")
        .select("id,reason,entry_hash")
        .eq("target_id", box.data!.id)
        .eq("operation", "insert:boxes")
        .single(),
    );

    await admin1Client.from("audit_log").update({ reason: "alterado" }).eq("id", event.data!.id);
    await admin1Client.from("audit_log").delete().eq("id", event.data!.id);

    const persisted = await requireSuccess(
      "Verify immutable audit fixture",
      serviceClient
        .from("audit_log")
        .select("id,reason,entry_hash")
        .eq("id", event.data!.id)
        .single(),
    );
    expect(persisted.data?.reason).toBe(event.data?.reason);
    expect(persisted.data?.entry_hash).toBe(event.data?.entry_hash);
  });

  it("audit trail: is admin-only and isolated by organization", async () => {
    const marker = `AUDIT-ISOLATION-${crypto.randomUUID()}`;
    const box = await requireSuccess(
      "Create isolated audit fixture",
      admin1Client.from("boxes").insert({ kind: "rodent", code: marker }).select("id").single(),
    );

    const ownAdmin = await requireSuccess(
      "Admin reads own audit event",
      admin1Client.from("audit_log").select("id").eq("target_id", box.data!.id),
    );
    expect(ownAdmin.data).toHaveLength(1);

    const operator = await requireSuccess(
      "Operator cannot see audit event",
      operatorClient.from("audit_log").select("id").eq("target_id", box.data!.id),
    );
    expect(operator.data).toHaveLength(0);

    const foreignAdmin = await requireSuccess(
      "Foreign admin cannot see audit event",
      org2AdminClient.from("audit_log").select("id").eq("target_id", box.data!.id),
    );
    expect(foreignAdmin.data).toHaveLength(0);
  });

  it("operator cannot administer users", async () => {
    const { error } = await operatorClient.rpc("manage_team_member", {
      _target_user_id: admin2Id,
      _action: "suspend",
    });
    expect(error).not.toBeNull();

    const admin2Membership = await requireSuccess(
      "Verify Admin 2 remains active",
      serviceClient.from("user_roles").select("status").eq("user_id", admin2Id).single(),
    );
    expect(admin2Membership.data?.status).toBe("active");
  });

  it("operator cannot change their role or organization", async () => {
    const roleMutation = await operatorClient
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", operatorId);
    expect(roleMutation.error).not.toBeNull();

    const profileMutation = await operatorClient
      .from("profiles")
      .update({ organization_id: org2Id })
      .eq("id", operatorId);
    expect(profileMutation.error).not.toBeNull();

    const membership = await requireSuccess(
      "Verify operator permissions did not change",
      serviceClient
        .from("user_roles")
        .select("role, organization_id, status")
        .eq("user_id", operatorId)
        .single(),
    );
    expect(membership.data).toMatchObject({
      role: "operator",
      organization_id: org1Id,
      status: "active",
    });
  });

  it("administrator can suspend and reinstate an operator", async () => {
    await requireSuccess(
      "Admin suspends operator",
      admin1Client.rpc("manage_team_member", {
        _target_user_id: operatorId,
        _action: "suspend",
      }),
    );

    const suspended = await requireSuccess(
      "Verify operator suspension",
      serviceClient.from("user_roles").select("status").eq("user_id", operatorId).single(),
    );
    expect(suspended.data?.status).toBe("suspended");

    await requireSuccess(
      "Admin reinstates operator",
      admin1Client.rpc("manage_team_member", {
        _target_user_id: operatorId,
        _action: "reinstate",
      }),
    );

    const reinstated = await requireSuccess(
      "Verify operator reinstatement",
      serviceClient.from("user_roles").select("status").eq("user_id", operatorId).single(),
    );
    expect(reinstated.data?.status).toBe("active");
  });

  it("manage_team_member: concurrent revocation guarantees exactly 1 active admin remains", async () => {
    // Helper wrapper function throwing on RPC error
    const callManageTeamMember = async (
      client: SupabaseClient,
      targetUserId: string,
      action: string,
    ) => {
      const { error } = await client.rpc("manage_team_member", {
        _target_user_id: targetUserId,
        _action: action,
      });
      if (error) throw new Error(error.message);
      return true;
    };

    const results = await Promise.allSettled([
      callManageTeamMember(admin1Client, admin2Id, "revoke"),
      callManageTeamMember(admin2Client, admin1Id, "revoke"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly 1 operation succeeded, exactly 1 was rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify rejection reason matches last admin protection error
    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason?.message ?? "";
    expect(rejectionReason).toContain(
      "No se puede modificar ni revocar al único administrador activo",
    );

    // Query DB to verify EXACTLY 1 active admin remains
    const activeAdminResult = await requireSuccess(
      "Read active admins after concurrent revocation",
      serviceClient
        .from("user_roles")
        .select("user_id, status")
        .eq("organization_id", org1Id)
        .eq("role", "admin")
        .eq("status", "active"),
    );
    const activeAdmins = activeAdminResult.data;

    expect(activeAdmins?.length).toBe(1);

    const allAdminResult = await requireSuccess(
      "Read all test admins after concurrent revocation",
      serviceClient
        .from("user_roles")
        .select("user_id, status")
        .in("user_id", [admin1Id, admin2Id])
        .eq("role", "admin"),
    );
    const revokedAdminIds = (allAdminResult.data ?? [])
      .filter((member) => member.status === "revoked")
      .map((member) => member.user_id);
    expect(revokedAdminIds).toHaveLength(1);

    for (const revokedAdminId of revokedAdminIds) {
      await requireSuccess(
        `Restore role for revoked admin ${revokedAdminId}`,
        serviceClient.from("user_roles").update({ status: "active" }).eq("user_id", revokedAdminId),
      );
      await requireSuccess(
        `Restore profile for revoked admin ${revokedAdminId}`,
        serviceClient.from("profiles").update({ organization_id: org1Id }).eq("id", revokedAdminId),
      );
    }

    const restoredAdminResult = await requireSuccess(
      "Verify both admins were restored",
      serviceClient
        .from("user_roles")
        .select("user_id, status, organization_id")
        .in("user_id", [admin1Id, admin2Id]),
    );
    expect(restoredAdminResult.data).toHaveLength(2);
    for (const member of restoredAdminResult.data ?? []) {
      expect(member.status).toBe("active");
      expect(member.organization_id).toBe(org1Id);
    }
  });

  // ---- 2. adjust_lot Security & Validation Tests ----

  it("adjust_lot: permits admin of the organization", async () => {
    const { data: box } = await admin1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `ROD-BOX-${Date.now()}` })
      .select("id")
      .single();

    const { data: species } = await admin1Client
      .from("species")
      .insert({ kind: "rodent", name: `Rodent Species ${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await admin1Client
      .from("lots")
      .insert({
        kind: "rodent",
        lot_code: `LOT-ROD-${Date.now()}`,
        species_id: species!.id,
        box_id: box!.id,
        males: 5,
        females: 5,
        unsexed: 0,
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    const { error } = await admin1Client.rpc("adjust_lot", {
      _lot_id: lot!.id,
      _males: 10,
      _females: 10,
      _tags: ["ajustado", "control"],
      _notes: "Ajuste de inventario por conteo físico",
    });

    expect(error).toBeNull();

    const { data: updatedLot } = await serviceClient
      .from("lots")
      .select("males, females, tags, notes")
      .eq("id", lot!.id)
      .single();

    expect(updatedLot?.males).toBe(10);
    expect(updatedLot?.females).toBe(10);
    expect(updatedLot?.tags).toEqual(["ajustado", "control"]);
  });

  it("adjust_lot: prevents empty audit when called with identical values (no-op)", async () => {
    const { data: box } = await admin1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `ROD-NOOP-${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await admin1Client
      .from("lots")
      .insert({
        kind: "rodent",
        species_id: org1RodentSpeciesId,
        lot_code: `LOT-NOOP-${Date.now()}`,
        box_id: box!.id,
        males: 8,
        females: 4,
        unsexed: 2,
        tags: ["inicial"],
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    // Query event and audit log counts before calling adjust_lot
    const eventsBeforeResult = await requireSuccess(
      "Count lot events before no-op adjustment",
      serviceClient
        .from("lot_events")
        .select("id", { count: "exact", head: true })
        .eq("lot_id", lot!.id),
    );
    const auditBeforeResult = await requireSuccess(
      "Count audit entries before no-op adjustment",
      serviceClient
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("target_id", lot!.id),
    );
    const eventsBefore = eventsBeforeResult.count;
    const auditBefore = auditBeforeResult.count;
    expect(typeof eventsBefore).toBe("number");
    expect(typeof auditBefore).toBe("number");

    // Call adjust_lot with IDENTICAL values
    const { error } = await admin1Client.rpc("adjust_lot", {
      _lot_id: lot!.id,
      _males: 8,
      _females: 4,
      _unsexed: 2,
      _tags: ["inicial"],
      _notes: "Ajuste idéntico sin cambios",
    });

    expect(error).toBeNull();

    // Query event and audit log counts after call
    const eventsAfterResult = await requireSuccess(
      "Count lot events after no-op adjustment",
      serviceClient
        .from("lot_events")
        .select("id", { count: "exact", head: true })
        .eq("lot_id", lot!.id),
    );
    const auditAfterResult = await requireSuccess(
      "Count audit entries after no-op adjustment",
      serviceClient
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("target_id", lot!.id),
    );
    const eventsAfter = eventsAfterResult.count;
    const auditAfter = auditAfterResult.count;
    expect(typeof eventsAfter).toBe("number");
    expect(typeof auditAfter).toBe("number");

    // Verify 0 new records were inserted
    expect(eventsAfter).toBe(eventsBefore);
    expect(auditAfter).toBe(auditBefore);
  });

  it("adjust_lot: rejects non-admin (operator)", async () => {
    const { data: box } = await admin1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `ROD-BOX-OP-${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await admin1Client
      .from("lots")
      .insert({
        kind: "rodent",
        species_id: org1RodentSpeciesId,
        lot_code: `LOT-OP-${Date.now()}`,
        box_id: box!.id,
        males: 5,
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    const { error } = await operatorClient.rpc("adjust_lot", {
      _lot_id: lot!.id,
      _males: 20,
      _tags: null,
      _notes: "Ajuste por operador",
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("Administrador");
  });

  it("adjust_lot: rejects user from another organization", async () => {
    const { data: box } = await admin1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `ROD-BOX-ORG1-${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await admin1Client
      .from("lots")
      .insert({
        kind: "rodent",
        species_id: org1RodentSpeciesId,
        lot_code: `LOT-ORG1-${Date.now()}`,
        box_id: box!.id,
        males: 5,
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    const { error } = await org2AdminClient.rpc("adjust_lot", {
      _lot_id: lot!.id,
      _males: 20,
      _tags: null,
      _notes: "Ajuste cruzado no autorizado",
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("no encontrado");
  });

  it("adjust_lot: rejects mass change for rodent lots", async () => {
    const { data: box } = await admin1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `ROD-BOX-MASS-${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await admin1Client
      .from("lots")
      .insert({
        kind: "rodent",
        species_id: org1RodentSpeciesId,
        lot_code: `LOT-ROD-MASS-${Date.now()}`,
        box_id: box!.id,
        males: 5,
        mass_grams: 0,
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    const { error } = await admin1Client.rpc("adjust_lot", {
      _lot_id: lot!.id,
      _mass_grams: 500,
      _tags: null,
      _notes: "Intento de cambiar biomasa a roedor",
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("No se permite modificar la masa en lotes de roedores");
  });

  it("adjust_lot: rejects population change for insect lots", async () => {
    const { data: box } = await admin1Client
      .from("boxes")
      .insert({ kind: "insect", code: `INS-BOX-POP-${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await admin1Client
      .from("lots")
      .insert({
        kind: "insect",
        species_id: org1InsectSpeciesId,
        lot_code: `LOT-INS-POP-${Date.now()}`,
        box_id: box!.id,
        mass_grams: 100,
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    const { error } = await admin1Client.rpc("adjust_lot", {
      _lot_id: lot!.id,
      _males: 10,
      _tags: null,
      _notes: "Intento de cambiar machos a insecto",
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain(
      "No se permite modificar conteos de población en lotes de insectos",
    );
  });

  it("adjust_lot: atomically finalizes lot when inventory reaches zero", async () => {
    const { data: box } = await admin1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `ROD-BOX-ZERO-${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await admin1Client
      .from("lots")
      .insert({
        kind: "rodent",
        species_id: org1RodentSpeciesId,
        lot_code: `LOT-ZERO-${Date.now()}`,
        box_id: box!.id,
        males: 5,
        females: 5,
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    const { error } = await admin1Client.rpc("adjust_lot", {
      _lot_id: lot!.id,
      _males: 0,
      _females: 0,
      _unsexed: 0,
      _tags: null,
      _notes: "Ajuste a cero - finalización automática",
    });

    expect(error).toBeNull();

    const { data: finalizedLot } = await serviceClient
      .from("lots")
      .select("status, finalized_at")
      .eq("id", lot!.id)
      .single();

    expect(finalizedLot?.status).toBe("finalizado");
    expect(finalizedLot?.finalized_at).not.toBeNull();
  });

  // ---- 3. move_lot Test with Inactive Lot ----

  it("move_lot: rejects move when lot is inactive (finalizado)", async () => {
    const { data: box1 } = await admin1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `ROD-MOVE-1-${Date.now()}` })
      .select("id")
      .single();

    const { data: box2 } = await admin1Client
      .from("boxes")
      .insert({ kind: "rodent", code: `ROD-MOVE-2-${Date.now()}` })
      .select("id")
      .single();

    const { data: lot } = await admin1Client
      .from("lots")
      .insert({
        kind: "rodent",
        species_id: org1RodentSpeciesId,
        lot_code: `LOT-INACTIVE-${Date.now()}`,
        box_id: box1!.id,
        males: 0,
        status: "finalizado",
        finalized_at: new Date().toISOString(),
        started_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    const { error } = await admin1Client.rpc("move_lot", {
      _lot_id: lot!.id,
      _destination_box_id: box2!.id,
      _reason: "Mover lote inactivo",
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("Solo se pueden mover lotes con estado activo");
  });

  // ---- 4. Transactional Integrity ----

  it("create_sale_tx: commits the order, allocation and FIFO consumption together", async () => {
    const fixture = await createRodentSaleFixture(8, "success");
    const requestId = crypto.randomUUID();
    const { data, error } = await admin1Client.rpc("create_sale_tx", {
      _request_id: requestId,
      _client_id: fixture.clientId,
      _items: [
        {
          kind: "rodent",
          species_id: fixture.speciesId,
          size_label: "all",
          quantity: 3,
          unit_price: 25,
        },
      ],
      _notes: `tx-success-${requestId}`,
      _consume_inventory: true,
    });

    expect(error).toBeNull();
    const result = data as { order_id?: string } | null;
    expect(result?.order_id).toBeTruthy();

    const lot = await requireSuccess(
      "Read stock after successful sale",
      serviceClient.from("lots").select("unsexed").eq("id", fixture.lotId).single(),
    );
    expect(lot.data?.unsexed).toBe(5);

    const allocations = await requireSuccess(
      "Read successful sale allocations",
      serviceClient
        .from("order_item_allocations")
        .select("qty_taken, order_items!inner(order_id)")
        .eq("order_items.order_id", result!.order_id!),
    );
    expect(allocations.data).toHaveLength(1);
    expect(Number(allocations.data?.[0].qty_taken)).toBe(3);
  });

  it("create_sale_tx: rolls back an earlier line when a later line fails", async () => {
    const fixture = await createRodentSaleFixture(5, "rollback");
    const marker = `tx-rollback-${crypto.randomUUID()}`;
    const { error } = await admin1Client.rpc("create_sale_tx", {
      _request_id: crypto.randomUUID(),
      _client_id: fixture.clientId,
      _items: [
        {
          kind: "rodent",
          species_id: fixture.speciesId,
          size_label: "all",
          quantity: 3,
          unit_price: 10,
        },
        {
          kind: "rodent",
          species_id: fixture.speciesId,
          size_label: "all",
          quantity: 3,
          unit_price: 10,
        },
      ],
      _notes: marker,
      _consume_inventory: true,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("Stock insuficiente");
    const lot = await requireSuccess(
      "Read stock after rolled back sale",
      serviceClient.from("lots").select("unsexed").eq("id", fixture.lotId).single(),
    );
    expect(lot.data?.unsexed).toBe(5);
    const orders = await requireSuccess(
      "Ensure rolled back order does not exist",
      serviceClient.from("orders").select("id").eq("notes", marker),
    );
    expect(orders.data).toHaveLength(0);
  });

  it("create_sale_tx: rejects insufficient quantity without side effects", async () => {
    const fixture = await createRodentSaleFixture(2, "insufficient");
    const marker = `tx-insufficient-${crypto.randomUUID()}`;
    const { error } = await admin1Client.rpc("create_sale_tx", {
      _request_id: crypto.randomUUID(),
      _client_id: fixture.clientId,
      _items: [
        {
          kind: "rodent",
          species_id: fixture.speciesId,
          size_label: "all",
          quantity: 3,
          unit_price: 10,
        },
      ],
      _notes: marker,
      _consume_inventory: true,
    });

    expect(error).not.toBeNull();
    const lot = await requireSuccess(
      "Read stock after insufficient sale",
      serviceClient.from("lots").select("unsexed").eq("id", fixture.lotId).single(),
    );
    expect(lot.data?.unsexed).toBe(2);
    const orders = await requireSuccess(
      "Ensure insufficient order does not exist",
      serviceClient.from("orders").select("id").eq("notes", marker),
    );
    expect(orders.data).toHaveLength(0);
  });

  it("create_sale_tx: returns the committed result on duplicate submission", async () => {
    const fixture = await createRodentSaleFixture(6, "duplicate");
    const requestId = crypto.randomUUID();
    const args = {
      _request_id: requestId,
      _client_id: fixture.clientId,
      _items: [
        {
          kind: "rodent",
          species_id: fixture.speciesId,
          size_label: "all",
          quantity: 2,
          unit_price: 10,
        },
      ],
      _notes: `tx-duplicate-${requestId}`,
      _consume_inventory: true,
    };

    const first = await admin1Client.rpc("create_sale_tx", args);
    const second = await admin1Client.rpc("create_sale_tx", args);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toEqual(first.data);

    const lot = await requireSuccess(
      "Read stock after duplicate submission",
      serviceClient.from("lots").select("unsexed").eq("id", fixture.lotId).single(),
    );
    expect(lot.data?.unsexed).toBe(4);
    const orders = await requireSuccess(
      "Count duplicate-submission orders",
      serviceClient.from("orders").select("id").eq("notes", args._notes),
    );
    expect(orders.data).toHaveLength(1);
  });

  it("create_sale_tx: serializes concurrent users competing for the same stock", async () => {
    const fixture = await createRodentSaleFixture(5, "concurrency");
    const marker = `tx-concurrency-${crypto.randomUUID()}`;
    const items = [
      {
        kind: "rodent",
        species_id: fixture.speciesId,
        size_label: "all",
        quantity: 4,
        unit_price: 10,
      },
    ];

    const [first, second] = await Promise.all([
      admin1Client.rpc("create_sale_tx", {
        _request_id: crypto.randomUUID(),
        _client_id: fixture.clientId,
        _items: items,
        _notes: marker,
        _consume_inventory: true,
      }),
      admin2Client.rpc("create_sale_tx", {
        _request_id: crypto.randomUUID(),
        _client_id: fixture.clientId,
        _items: items,
        _notes: marker,
        _consume_inventory: true,
      }),
    ]);

    expect([first, second].filter((result) => !result.error)).toHaveLength(1);
    expect([first, second].filter((result) => result.error)).toHaveLength(1);
    const lot = await requireSuccess(
      "Read stock after concurrent sales",
      serviceClient.from("lots").select("unsexed").eq("id", fixture.lotId).single(),
    );
    expect(lot.data?.unsexed).toBe(1);
    const orders = await requireSuccess(
      "Count concurrently committed orders",
      serviceClient.from("orders").select("id").eq("notes", marker),
    );
    expect(orders.data).toHaveLength(1);
  });

  it("create_purchase_tx: atomically creates and links a lot and is idempotent", async () => {
    const fixture = await createRodentSaleFixture(1, "purchase");
    const requestId = crypto.randomUUID();
    const invoice = `INV-${requestId}`;
    const args = {
      _request_id: requestId,
      _kind: "rodent",
      _species_id: fixture.speciesId,
      _population: 7,
      _males: 3,
      _females: 2,
      _total_cost: 1250,
      _invoice_id: invoice,
      _create_lot: true,
      _box_id: fixture.boxId,
      _lot_code: `PURCHASE-${requestId}`,
      _started_at: new Date().toISOString().slice(0, 10),
    };

    const first = await admin1Client.rpc("create_purchase_tx", args);
    const second = await admin1Client.rpc("create_purchase_tx", args);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toEqual(first.data);

    const result = first.data as { purchase_id?: string; lot_id?: string } | null;
    const purchase = await requireSuccess(
      "Read atomic purchase",
      serviceClient
        .from("warehouse_purchases")
        .select("id, converted_to_lot_id")
        .eq("invoice_id", invoice)
        .single(),
    );
    expect(purchase.data?.id).toBe(result?.purchase_id);
    expect(purchase.data?.converted_to_lot_id).toBe(result?.lot_id);

    const lot = await requireSuccess(
      "Read lot created from purchase",
      serviceClient
        .from("lots")
        .select("provider_purchase_id, males, females, unsexed")
        .eq("id", result!.lot_id!)
        .single(),
    );
    expect(lot.data?.provider_purchase_id).toBe(result?.purchase_id);
    expect(lot.data?.males).toBe(3);
    expect(lot.data?.females).toBe(2);
    expect(lot.data?.unsexed).toBe(2);
  });

  // ---- 5. Data quality and relational integrity ----

  it("data integrity: rejects negative inventory, prices, percentages and malformed size rules", async () => {
    const stamp = crypto.randomUUID();
    const negativeFood = await admin1Client.from("warehouse_food").insert({
      name: `Negative-${stamp}`,
      quantity_grams: -1,
    });
    expect(negativeFood.error?.message).toContain("warehouse_food_quantity_nonnegative");

    const negativePrice = await admin1Client.from("species").insert({
      kind: "rodent",
      name: `Negative-price-${stamp}`,
      unit_price_mxn: -0.01,
      size_rules: [],
    });
    expect(negativePrice.error?.message).toContain("species_price_nonnegative");

    const malformedRules = await admin1Client.from("species").insert({
      kind: "insect",
      name: `Bad-rules-${stamp}`,
      size_rules: [
        {
          label: "Etapa invalida",
          min_days: 10,
          max_days: 2,
          individuals_per_gram: 0,
          price_mxn: -1,
        },
      ],
    });
    expect(malformedRules.error?.message).toContain("species_size_rules_valid");

    const fixture = await createRodentSaleFixture(2, "bad-discount");
    const invalidDiscount = await admin1Client.rpc("create_sale_tx", {
      _request_id: crypto.randomUUID(),
      _client_id: fixture.clientId,
      _items: [
        {
          kind: "rodent",
          species_id: fixture.speciesId,
          size_label: "all",
          quantity: 1,
          unit_price: 1,
        },
      ],
      _discount_pct: 101,
    });
    expect(invalidDiscount.error).not.toBeNull();
  });

  it("data integrity: enforces unique business names and codes per organization", async () => {
    const stamp = crypto.randomUUID();
    const firstSpecies = await requireSuccess(
      "Create unique species",
      admin1Client
        .from("species")
        .insert({ kind: "rodent", name: `Unique Species ${stamp}`, size_rules: [] })
        .select("id")
        .single(),
    );
    const duplicateSpecies = await admin1Client.from("species").insert({
      kind: "rodent",
      name: `  unique species ${stamp}  `,
      size_rules: [],
    });
    expect(duplicateSpecies.error?.message).toContain("species_org_kind_name_uidx");

    const box = await requireSuccess(
      "Create unique box",
      admin1Client
        .from("boxes")
        .insert({ kind: "rodent", code: `UNIQUE-BOX-${stamp}` })
        .select("id")
        .single(),
    );
    const duplicateBox = await admin1Client.from("boxes").insert({
      kind: "rodent",
      code: `unique-box-${stamp}`,
    });
    expect(duplicateBox.error?.message).toContain("boxes_org_code_uidx");

    await requireSuccess(
      "Create unique lot code",
      admin1Client.from("lots").insert({
        kind: "rodent",
        species_id: firstSpecies.data!.id,
        box_id: box.data!.id,
        lot_code: `UNIQUE-LOT-${stamp}`,
        unsexed: 1,
      }),
    );
    const duplicateLot = await admin1Client.from("lots").insert({
      kind: "rodent",
      species_id: firstSpecies.data!.id,
      box_id: box.data!.id,
      lot_code: `unique-lot-${stamp}`,
      unsexed: 1,
    });
    expect(duplicateLot.error?.message).toContain("lots_org_code_uidx");
  });

  it("data integrity: rejects cross-organization species, lines and boxes", async () => {
    const stamp = crypto.randomUUID();
    const foreignSpecies = await requireSuccess(
      "Create foreign species",
      org2AdminClient
        .from("species")
        .insert({ kind: "rodent", name: `Foreign species ${stamp}`, size_rules: [] })
        .select("id")
        .single(),
    );
    const foreignBox = await requireSuccess(
      "Create foreign box",
      org2AdminClient
        .from("boxes")
        .insert({ kind: "rodent", code: `FOREIGN-${stamp}` })
        .select("id")
        .single(),
    );

    const foreignSpeciesLot = await admin1Client.from("lots").insert({
      kind: "rodent",
      species_id: foreignSpecies.data!.id,
      unsexed: 1,
    });
    expect(foreignSpeciesLot.error?.message).toContain("lots_org_species_kind_fkey");

    const localSpecies = await requireSuccess(
      "Create local species for foreign box test",
      admin1Client
        .from("species")
        .insert({ kind: "rodent", name: `Local species ${stamp}`, size_rules: [] })
        .select("id")
        .single(),
    );
    const foreignBoxLot = await admin1Client.from("lots").insert({
      kind: "rodent",
      species_id: localSpecies.data!.id,
      box_id: foreignBox.data!.id,
      unsexed: 1,
    });
    expect(foreignBoxLot.error?.message).toContain("lots_org_box_kind_fkey");

    const otherSpecies = await requireSuccess(
      "Create second local species",
      admin1Client
        .from("species")
        .insert({ kind: "rodent", name: `Other species ${stamp}`, size_rules: [] })
        .select("id")
        .single(),
    );
    const line = await requireSuccess(
      "Create line for second species",
      admin1Client
        .from("genetic_lines")
        .insert({ species_id: otherSpecies.data!.id, name: `Line ${stamp}` })
        .select("id")
        .single(),
    );
    const wrongLineLot = await admin1Client.from("lots").insert({
      kind: "rodent",
      species_id: localSpecies.data!.id,
      line_id: line.data!.id,
      unsexed: 1,
    });
    expect(wrongLineLot.error?.message).toContain("lots_org_line_species_fkey");
  });

  it("data integrity: enforces genealogy, compatible states and possible dates", async () => {
    const fixture = await createRodentSaleFixture(3, "genealogy");
    const child = await requireSuccess(
      "Create genealogical child",
      admin1Client
        .from("lots")
        .insert({
          kind: "rodent",
          species_id: fixture.speciesId,
          box_id: fixture.boxId,
          parent_lot_id: fixture.lotId,
          unsexed: 1,
        })
        .select("id")
        .single(),
    );

    const cycle = await admin1Client
      .from("lots")
      .update({ parent_lot_id: child.data!.id })
      .eq("id", fixture.lotId);
    expect(cycle.error?.message).toContain("genealogia de lotes no puede contener ciclos");

    const impossibleDate = new Date();
    impossibleDate.setDate(impossibleDate.getDate() + 1);
    const futureLot = await admin1Client.from("lots").insert({
      kind: "rodent",
      species_id: fixture.speciesId,
      box_id: fixture.boxId,
      unsexed: 1,
      started_at: impossibleDate.toISOString().slice(0, 10),
    });
    expect(futureLot.error?.message).toContain("fecha de inicio del lote no es valida");

    const badStatus = await admin1Client.from("lots").insert({
      kind: "rodent",
      species_id: fixture.speciesId,
      box_id: fixture.boxId,
      unsexed: 1,
      status: "finalizado",
      finalized_at: null,
    });
    expect(badStatus.error?.message).toContain("lots_status_dates_compatible");
  });

  it("operational domain: reconciles rodent mortality with the immutable inventory ledger", async () => {
    const fixture = await createRodentSaleFixture(5, "operational-mortality");
    const requestId = crypto.randomUUID();
    const args = {
      _request_id: requestId,
      _lot_id: fixture.lotId,
      _unsexed: 2,
      _cause: "enfermedad",
      _observations: "Hallazgo durante revision diaria",
      _event_at: new Date().toISOString(),
    };
    const first = await admin1Client.rpc("register_mortality_event_tx", args);
    const duplicate = await admin1Client.rpc("register_mortality_event_tx", args);
    expect(first.error).toBeNull();
    expect(duplicate.error).toBeNull();
    expect(duplicate.data).toEqual(first.data);

    const lot = await requireSuccess(
      "Read rodent balance after mortality",
      serviceClient.from("lots").select("unsexed").eq("id", fixture.lotId).single(),
    );
    expect(lot.data?.unsexed).toBe(3);

    const ledger = await requireSuccess(
      "Read mortality ledger event",
      serviceClient
        .from("inventory_events")
        .select("event_type, unsexed_delta, cause")
        .eq("request_id", requestId),
    );
    expect(ledger.data).toHaveLength(1);
    expect(ledger.data?.[0]).toMatchObject({
      event_type: "mortality_out",
      unsexed_delta: -2,
      cause: "enfermedad",
    });

    const reconciliation = await requireSuccess(
      "Reconcile rodent ledger",
      serviceClient
        .from("lot_balance_reconciliation")
        .select("current_unsexed, ledger_unsexed, is_consistent")
        .eq("lot_id", fixture.lotId)
        .single(),
    );
    expect(reconciliation.data).toMatchObject({
      current_unsexed: 3,
      ledger_unsexed: 3,
      is_consistent: true,
    });
  });

  it("operational domain: reconciles insect biomass and preserves structured mortality data", async () => {
    const stamp = crypto.randomUUID();
    const species = await requireSuccess(
      "Create insect species",
      admin1Client
        .from("species")
        .insert({ kind: "insect", name: `Insect-${stamp}`, size_rules: [] })
        .select("id")
        .single(),
    );
    const box = await requireSuccess(
      "Create insect box",
      admin1Client
        .from("boxes")
        .insert({ kind: "insect", code: `INSECT-${stamp}` })
        .select("id")
        .single(),
    );
    const lot = await requireSuccess(
      "Create insect lot",
      admin1Client
        .from("lots")
        .insert({
          kind: "insect",
          species_id: species.data!.id,
          box_id: box.data!.id,
          mass_grams: 100,
        })
        .select("id")
        .single(),
    );
    const requestId = crypto.randomUUID();
    const result = await admin1Client.rpc("register_mortality_event_tx", {
      _request_id: requestId,
      _lot_id: lot.data!.id,
      _mass_grams: 25,
      _cause: "contaminacion",
      _observations: "Muestra aislada",
    });
    expect(result.error).toBeNull();

    const event = await requireSuccess(
      "Read structured insect mortality event",
      serviceClient
        .from("lot_events")
        .select("cause, observations, mass_delta, request_id")
        .eq("request_id", requestId)
        .single(),
    );
    expect(event.data).toMatchObject({
      cause: "contaminacion",
      observations: "Muestra aislada",
      mass_delta: -25,
      request_id: requestId,
    });

    const reconciliation = await requireSuccess(
      "Reconcile insect biomass ledger",
      serviceClient
        .from("lot_balance_reconciliation")
        .select("current_mass_grams, ledger_mass_grams, is_consistent")
        .eq("lot_id", lot.data!.id)
        .single(),
    );
    expect(Number(reconciliation.data?.current_mass_grams)).toBe(75);
    expect(Number(reconciliation.data?.ledger_mass_grams)).toBe(75);
    expect(reconciliation.data?.is_consistent).toBe(true);
  });

  it("operational domain: records structured box movements without changing balances", async () => {
    const fixture = await createRodentSaleFixture(4, "operational-move");
    const destination = await requireSuccess(
      "Create movement destination box",
      admin1Client
        .from("boxes")
        .insert({ kind: "rodent", code: `MOVE-${crypto.randomUUID()}` })
        .select("id")
        .single(),
    );
    const requestId = crypto.randomUUID();
    const result = await admin1Client.rpc("move_lot_event_tx", {
      _request_id: requestId,
      _lot_id: fixture.lotId,
      _destination_box_id: destination.data!.id,
      _cause: "cambio_de_sala",
      _observations: "Movimiento sanitario programado",
    });
    expect(result.error).toBeNull();

    const event = await requireSuccess(
      "Read structured movement",
      serviceClient
        .from("lot_events")
        .select("source_box_id, destination_box_id, cause, observations")
        .eq("request_id", requestId)
        .single(),
    );
    expect(event.data).toMatchObject({
      source_box_id: fixture.boxId,
      destination_box_id: destination.data!.id,
      cause: "cambio_de_sala",
      observations: "Movimiento sanitario programado",
    });
    const balanceEvents = await requireSuccess(
      "Verify movement did not create a balance event",
      serviceClient.from("inventory_events").select("id").eq("request_id", requestId),
    );
    expect(balanceEvents.data).toHaveLength(0);
  });

  it("operational domain: creates an idempotent birth linked to its parent and ledger", async () => {
    const fixture = await createRodentSaleFixture(3, "operational-birth");
    const requestId = crypto.randomUUID();
    const args = {
      _request_id: requestId,
      _kind: "rodent",
      _box_id: fixture.boxId,
      _species_id: fixture.speciesId,
      _parent_lot_id: fixture.lotId,
      _lot_code: `BIRTH-${crypto.randomUUID()}`,
      _unsexed: 4,
      _observations: "Camada registrada por prueba",
    };
    const first = await admin1Client.rpc("register_birth_event_tx", args);
    const duplicate = await admin1Client.rpc("register_birth_event_tx", args);
    expect(first.error).toBeNull();
    expect(duplicate.error).toBeNull();
    expect(duplicate.data).toEqual(first.data);

    const result = first.data as { lot_id: string };
    const child = await requireSuccess(
      "Read newborn lot",
      serviceClient
        .from("lots")
        .select("parent_lot_id,unsexed,organization_id")
        .eq("id", result.lot_id)
        .single(),
    );
    expect(child.data).toMatchObject({
      parent_lot_id: fixture.lotId,
      unsexed: 4,
      organization_id: org1Id,
    });
    const ledger = await requireSuccess(
      "Read newborn ledger entry",
      serviceClient
        .from("inventory_events")
        .select("event_type,unsexed_delta")
        .eq("request_id", requestId)
        .single(),
    );
    expect(ledger.data).toMatchObject({ event_type: "birth_in", unsexed_delta: 4 });
  });

  it("operational domain: splits sublots atomically and rejects excess quantities", async () => {
    const fixture = await createRodentSaleFixture(6, "operational-split");
    const destination = await requireSuccess(
      "Create split destination box",
      admin1Client
        .from("boxes")
        .insert({ kind: "rodent", code: `SPLIT-${crypto.randomUUID()}` })
        .select("id")
        .single(),
    );
    const split = await admin1Client.rpc("split_lot", {
      _source_lot_id: fixture.lotId,
      _reason: "Separación de prueba",
      _sublots: [
        { lot_code: `SUB-A-${crypto.randomUUID()}`, box_id: fixture.boxId, unsexed: 2 },
        { lot_code: `SUB-B-${crypto.randomUUID()}`, box_id: destination.data!.id, unsexed: 2 },
      ],
    });
    expect(split.error).toBeNull();
    const created = (split.data as { created_lots: string[] }).created_lots;
    expect(created).toHaveLength(2);

    const source = await requireSuccess(
      "Read source after split",
      serviceClient.from("lots").select("unsexed,status").eq("id", fixture.lotId).single(),
    );
    expect(source.data).toMatchObject({ unsexed: 2, status: "active" });
    const children = await requireSuccess(
      "Read split children",
      serviceClient.from("lots").select("parent_lot_id,unsexed").in("id", created),
    );
    expect(children.data).toHaveLength(2);
    expect(
      children.data?.every((lot) => lot.parent_lot_id === fixture.lotId && lot.unsexed === 2),
    ).toBe(true);

    const excess = await admin1Client.rpc("split_lot", {
      _source_lot_id: fixture.lotId,
      _sublots: [{ lot_code: `EXCESS-${crypto.randomUUID()}`, box_id: fixture.boxId, unsexed: 3 }],
    });
    expect(excess.error?.message).toContain(
      "Split population totals exceed source lot available population",
    );
  });

  it("operational domain: validates breeder compatibility and records reproduction idempotently", async () => {
    const stamp = crypto.randomUUID();
    const species = await requireSuccess(
      "Create breeder species",
      admin1Client
        .from("species")
        .insert({ kind: "rodent", name: `Breeder-${stamp}`, size_rules: [] })
        .select("id")
        .single(),
    );
    const otherSpecies = await requireSuccess(
      "Create incompatible breeder species",
      admin1Client
        .from("species")
        .insert({ kind: "rodent", name: `Other-breeder-${stamp}`, size_rules: [] })
        .select("id")
        .single(),
    );
    const box = await requireSuccess(
      "Create breeder box",
      admin1Client
        .from("boxes")
        .insert({ kind: "rodent", code: `BREEDER-${stamp}` })
        .select("id")
        .single(),
    );
    const primary = await requireSuccess(
      "Create primary breeder",
      admin1Client
        .from("lots")
        .insert({
          kind: "rodent",
          lot_type: "breeder",
          species_id: species.data!.id,
          box_id: box.data!.id,
          males: 1,
        })
        .select("id")
        .single(),
    );
    const secondary = await requireSuccess(
      "Create secondary breeder",
      admin1Client
        .from("lots")
        .insert({
          kind: "rodent",
          lot_type: "breeder",
          species_id: species.data!.id,
          box_id: box.data!.id,
          females: 1,
        })
        .select("id")
        .single(),
    );
    const incompatible = await requireSuccess(
      "Create incompatible breeder",
      admin1Client
        .from("lots")
        .insert({
          kind: "rodent",
          lot_type: "breeder",
          species_id: otherSpecies.data!.id,
          box_id: box.data!.id,
          females: 1,
        })
        .select("id")
        .single(),
    );

    const requestId = crypto.randomUUID();
    const args = {
      _request_id: requestId,
      _event_type: "mating" as const,
      _primary_lot_id: primary.data!.id,
      _secondary_lot_id: secondary.data!.id,
      _observations: "Apareamiento controlado",
    };
    const first = await admin1Client.rpc("register_reproduction_event_tx", args);
    const duplicate = await admin1Client.rpc("register_reproduction_event_tx", args);
    expect(first.error).toBeNull();
    expect(duplicate.data).toEqual(first.data);

    const invalid = await admin1Client.rpc("register_reproduction_event_tx", {
      _request_id: crypto.randomUUID(),
      _event_type: "mating",
      _primary_lot_id: primary.data!.id,
      _secondary_lot_id: incompatible.data!.id,
    });
    expect(invalid.error?.message).toContain("compartir organizacion, tipo, especie y linea");
  });

  it("alerts: evaluates automatically, deduplicates and records lifecycle timestamps", async () => {
    const fixture = await createRodentSaleFixture(2, "alert-lifecycle");
    const rule = await requireSuccess(
      "Create population alert rule",
      admin1Client
        .from("alert_rules")
        .insert({
          name: `Low population ${crypto.randomUUID()}`,
          scope: "lot",
          lot_id: fixture.lotId,
          animal_kind: "rodent",
          metric: "population",
          operator: "<",
          threshold: 5,
          template_text: "Lot {entity} has {value}; threshold {threshold}",
        })
        .select("id")
        .single(),
    );

    const first = await serviceClient.rpc("evaluate_alert_rules", {
      _organization_id: org1Id,
      _invocation_id: crypto.randomUUID(),
    });
    const second = await serviceClient.rpc("evaluate_alert_rules", {
      _organization_id: org1Id,
      _invocation_id: crypto.randomUUID(),
    });
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const openAlerts = await requireSuccess(
      "Read deduplicated alert",
      serviceClient
        .from("alerts")
        .select("id,status,generated_at,acknowledged_at,resolved_at,occurrence_count")
        .eq("rule_id", rule.data!.id)
        .neq("status", "resolved"),
    );
    expect(openAlerts.data).toHaveLength(1);
    const alertId = openAlerts.data![0].id;
    expect(openAlerts.data![0].status).toBe("active");
    expect(openAlerts.data![0].generated_at).toBeTruthy();

    const acknowledge = await operatorClient.rpc("acknowledge_alert", { _alert_id: alertId });
    expect(acknowledge.error).toBeNull();
    const acknowledged = await requireSuccess(
      "Read acknowledged alert",
      serviceClient
        .from("alerts")
        .select("status,acknowledged_at,acknowledged_by")
        .eq("id", alertId)
        .single(),
    );
    expect(acknowledged.data?.status).toBe("acknowledged");
    expect(acknowledged.data?.acknowledged_by).toBe(operatorId);
    expect(acknowledged.data?.acknowledged_at).toBeTruthy();

    const forbiddenResolve = await operatorClient.rpc("resolve_alert", {
      _alert_id: alertId,
      _reason: "Operator must not resolve",
    });
    expect(forbiddenResolve.error?.message).toContain("ALERT_RESOLVE_ADMIN_REQUIRED");

    const adjustment = await admin1Client.rpc("adjust_lot_event_tx", {
      _request_id: crypto.randomUUID(),
      _lot_id: fixture.lotId,
      _unsexed: 6,
      _reason: "Restore population above alert threshold",
    });
    expect(adjustment.error).toBeNull();
    const reevaluation = await serviceClient.rpc("evaluate_alert_rules", {
      _organization_id: org1Id,
      _invocation_id: crypto.randomUUID(),
    });
    expect(reevaluation.error).toBeNull();

    const resolved = await requireSuccess(
      "Read automatically resolved alert",
      serviceClient
        .from("alerts")
        .select("status,resolved_at,resolved_by,resolution_reason")
        .eq("id", alertId)
        .single(),
    );
    expect(resolved.data).toMatchObject({
      status: "resolved",
      resolved_by: null,
      resolution_reason: "La condición dejó de cumplirse",
    });
    expect(resolved.data?.resolved_at).toBeTruthy();
  });

  it("box substrates: enforces roles, organization, idempotency, stock locks and lot costs", async () => {
    const substrate = await requireSuccess(
      "Create substrate",
      admin1Client
        .from("substrates")
        .insert({
          code: `SUB-${crypto.randomUUID()}`,
          name: "Aspen test",
          minimum_stock_grams: 100,
        })
        .select("id")
        .single(),
    );
    const typeRequestId = crypto.randomUUID();
    const typeResult = await admin1Client.rpc("create_box_type_tx", {
      _request_id: typeRequestId,
      _data: {
        code: `TYPE-${crypto.randomUUID()}`,
        name: "Rodent test box",
        kind: "rodent",
        max_population: 12,
        substrate_id: substrate.data!.id,
        setup_grams: 200,
        replacement_grams: 100,
        replacement_interval_days: 7,
      },
    });
    expect(typeResult.error).toBeNull();
    const duplicateType = await admin1Client.rpc("create_box_type_tx", {
      _request_id: typeRequestId,
      _data: { ignored: true },
    });
    expect(duplicateType.data).toEqual(typeResult.data);
    const boxTypeId = (typeResult.data as { box_type_id: string }).box_type_id;

    const operatorCatalogWrite = await operatorClient.from("box_types").insert({
      code: `DENIED-${crypto.randomUUID()}`,
      name: "Denied",
      kind: "rodent",
      max_population: 1,
    });
    expect(operatorCatalogWrite.error).not.toBeNull();

    const stock = await admin1Client.rpc("register_substrate_stock_tx", {
      _request_id: crypto.randomUUID(),
      _substrate_id: substrate.data!.id,
      _grams: 2200,
      _total_cost: 44,
    });
    expect(stock.error).toBeNull();

    const box = await operatorClient.rpc("create_box_from_type_tx", {
      _request_id: crypto.randomUUID(),
      _kind: "rodent",
      _box_type_id: boxTypeId,
      _code: `OP-BOX-${crypto.randomUUID()}`,
      _location: "Test room",
    });
    expect(box.error).toBeNull();
    const boxId = (box.data as { box_id: string }).box_id;
    const lot = await requireSuccess(
      "Create substrate cost lot",
      admin1Client
        .from("lots")
        .insert({
          kind: "rodent",
          species_id: org1RodentSpeciesId,
          box_id: boxId,
          lot_code: `COST-${crypto.randomUUID()}`,
          unsexed: 10,
        })
        .select("id")
        .single(),
    );

    const consumeRequestId = crypto.randomUUID();
    const consumeArgs = {
      _request_id: consumeRequestId,
      _box_id: boxId,
      _substrate_id: substrate.data!.id,
      _event_type: "setup",
      _grams: 200,
      _lot_id: lot.data!.id,
    };
    const consume = await operatorClient.rpc("consume_box_substrate_tx", consumeArgs);
    const duplicateConsume = await operatorClient.rpc("consume_box_substrate_tx", consumeArgs);
    expect(consume.error).toBeNull();
    expect(duplicateConsume.data).toEqual(consume.data);

    const costs = await requireSuccess(
      "Read substrate production cost",
      operatorClient
        .from("lot_production_costs")
        .select("substrate_cost,cost_per_animal")
        .eq("lot_id", lot.data!.id)
        .single(),
    );
    expect(Number(costs.data?.substrate_cost)).toBe(4);
    expect(Number(costs.data?.cost_per_animal)).toBe(0.4);

    const [concurrentA, concurrentB] = await Promise.all([
      operatorClient.rpc("consume_box_substrate_tx", {
        ...consumeArgs,
        _request_id: crypto.randomUUID(),
        _event_type: "replacement",
        _grams: 1100,
      }),
      operatorClient.rpc("consume_box_substrate_tx", {
        ...consumeArgs,
        _request_id: crypto.randomUUID(),
        _event_type: "replacement",
        _grams: 1100,
      }),
    ]);
    expect([concurrentA.error, concurrentB.error].filter(Boolean)).toHaveLength(1);

    const crossOrgRead = await org2AdminClient
      .from("substrates")
      .select("id")
      .eq("id", substrate.data!.id);
    expect(crossOrgRead.error).toBeNull();
    expect(crossOrgRead.data).toEqual([]);
  });

  it("continuity: operational export is admin-only and organization scoped", async () => {
    const operatorExport = await operatorClient.rpc("export_organization_data");
    expect(operatorExport.error?.message).toContain("OPERATIONAL_EXPORT_ADMIN_REQUIRED");

    const adminExport = await admin1Client.rpc("export_organization_data");
    expect(adminExport.error).toBeNull();
    const exported = adminExport.data as {
      schema_version: string;
      organization: { id: string };
      lots: Array<{ organization_id: string }>;
    };
    expect(exported.schema_version).toBe("20260808000005");
    expect(exported.organization.id).toBe(org1Id);
    expect(exported.lots.every((lot) => lot.organization_id === org1Id)).toBe(true);
    expect(exported.lots.some((lot) => lot.organization_id === org2Id)).toBe(false);
  });

  it("complete costing: enforces admin visibility and idempotent feed consumption", async () => {
    const fixture = await createRodentSaleFixture(8, "complete-costing");
    const requestId = crypto.randomUUID();
    const manualArgs = {
      _request_id: requestId,
      _category: "labor",
      _description: "Limpieza y manejo del lote",
      _total_amount: 125,
      _allocations: [{ lot_id: fixture.lotId, amount: 125, weight: 1 }],
      _allocation_basis: "direct",
    };

    const forbidden = await operatorClient.rpc("register_lot_cost_tx", manualArgs);
    expect(forbidden.error?.message).toContain("Solo un administrador");

    const first = await admin1Client.rpc("register_lot_cost_tx", manualArgs);
    const duplicate = await admin1Client.rpc("register_lot_cost_tx", manualArgs);
    expect(first.error).toBeNull();
    expect(duplicate.error).toBeNull();
    expect(duplicate.data).toEqual(first.data);

    const operatorCosts = await operatorClient.from("cost_entries").select("id");
    expect(operatorCosts.error).toBeNull();
    expect(operatorCosts.data).toEqual([]);
    const foreignCosts = await org2AdminClient
      .from("cost_entries")
      .select("id")
      .eq("id", (first.data as { cost_entry_id: string }).cost_entry_id);
    expect(foreignCosts.error).toBeNull();
    expect(foreignCosts.data).toEqual([]);

    const food = await requireSuccess(
      "Create feed inventory",
      admin1Client
        .from("warehouse_food")
        .insert({
          name: `Feed-${crypto.randomUUID()}`,
          quantity_grams: 2000,
          unit_cost: 50,
        })
        .select("id")
        .single(),
    );
    const feedRequestId = crypto.randomUUID();
    const feedArgs = {
      _request_id: feedRequestId,
      _food_id: food.data!.id,
      _allocations: [{ lot_id: fixture.lotId, grams: 500 }],
      _observations: "Racion diaria",
    };
    const consumed = await operatorClient.rpc("consume_feed_tx", feedArgs);
    const consumedAgain = await operatorClient.rpc("consume_feed_tx", feedArgs);
    expect(consumed.error).toBeNull();
    expect(consumedAgain.error).toBeNull();
    expect(consumedAgain.data).toEqual(consumed.data);

    const balance = await requireSuccess(
      "Read feed balance after idempotent consumption",
      admin1Client.from("warehouse_food").select("quantity_grams").eq("id", food.data!.id).single(),
    );
    expect(Number(balance.data?.quantity_grams)).toBe(1500);

    const insufficient = await operatorClient.rpc("consume_feed_tx", {
      ...feedArgs,
      _request_id: crypto.randomUUID(),
      _allocations: [{ lot_id: fixture.lotId, grams: 2000 }],
    });
    expect(insufficient.error?.message).toContain("Alimento insuficiente");

    const summary = await requireSuccess(
      "Read lot financial summary",
      admin1Client
        .from("lot_financial_summary")
        .select("total_cost,labor_cost,feed_cost,cost_per_unit")
        .eq("lot_id", fixture.lotId)
        .single(),
    );
    expect(Number(summary.data?.labor_cost)).toBe(125);
    expect(Number(summary.data?.feed_cost)).toBe(25);
    expect(Number(summary.data?.total_cost)).toBe(150);
    expect(Number(summary.data?.cost_per_unit)).toBe(18.75);
  });

  it("product consolidation: partial receipts, FIFO costs, concurrency and shift RLS", async () => {
    const stamp = crypto.randomUUID();
    const fixture = await createRodentSaleFixture(10, "supply-consolidation");
    const item = await requireSuccess(
      "Create consolidated supply item",
      admin1Client
        .from("supply_items")
        .insert({
          sku: `SUP-${stamp}`,
          name: `Supply ${stamp}`,
          category: "cleaning",
          unit: "kg",
          minimum_quantity: 2,
          lead_time_days: 3,
        })
        .select("id")
        .single(),
    );

    const forbiddenItem = await operatorClient.from("supply_items").insert({
      sku: `DENIED-${stamp}`,
      name: "Denied item",
      category: "other",
      unit: "unit",
    });
    expect(forbiddenItem.error).not.toBeNull();

    const orderRequest = crypto.randomUUID();
    const orderArgs = {
      _request_id: orderRequest,
      _order_number: `PO-${stamp}`,
      _vendor: "Integration vendor",
      _supply_item_id: item.data!.id,
      _quantity: 10,
      _unit_cost: 5,
      _expected_at: null,
      _notes: "Partial receipt test",
    };
    const order = await admin1Client.rpc("create_supply_purchase_order_tx", orderArgs);
    const duplicateOrder = await admin1Client.rpc("create_supply_purchase_order_tx", orderArgs);
    expect(order.error).toBeNull();
    expect(duplicateOrder.data).toEqual(order.data);
    const ids = order.data as { purchase_order_id: string; line_id: string };

    const firstReceiptArgs = {
      _request_id: crypto.randomUUID(),
      _purchase_order_line_id: ids.line_id,
      _batch_code: `BATCH-${stamp}`,
      _quantity: 6,
      _expiry_date: null,
      _document_reference: "DOC-1",
    };
    const firstReceipt = await admin1Client.rpc("receive_supply_tx", firstReceiptArgs);
    const duplicateReceipt = await admin1Client.rpc("receive_supply_tx", firstReceiptArgs);
    expect(firstReceipt.error).toBeNull();
    expect(duplicateReceipt.data).toEqual(firstReceipt.data);
    const partial = await requireSuccess(
      "Read partial order",
      admin1Client
        .from("purchase_orders")
        .select("status")
        .eq("id", ids.purchase_order_id)
        .single(),
    );
    expect(partial.data?.status).toBe("partial");

    const finalReceipt = await admin1Client.rpc("receive_supply_tx", {
      ...firstReceiptArgs,
      _request_id: crypto.randomUUID(),
      _quantity: 4,
      _document_reference: "DOC-2",
    });
    expect(finalReceipt.error).toBeNull();
    const received = await requireSuccess(
      "Read completed order and inventory",
      admin1Client
        .from("purchase_orders")
        .select("status,received_at")
        .eq("id", ids.purchase_order_id)
        .single(),
    );
    expect(received.data?.status).toBe("received");
    expect(received.data?.received_at).not.toBeNull();

    const consumption = await operatorClient.rpc("consume_supply_tx", {
      _request_id: crypto.randomUUID(),
      _supply_item_id: item.data!.id,
      _quantity: 3,
      _reference_type: "lot",
      _reference_id: fixture.lotId,
      _notes: "Assigned production consumption",
      _event_type: "consumption",
    });
    expect(consumption.error).toBeNull();
    expect(Number((consumption.data as { total_cost: number }).total_cost)).toBe(15);
    const allocated = await requireSuccess(
      "Read allocated supply cost",
      admin1Client
        .from("lot_cost_allocations")
        .select("allocated_amount")
        .eq("lot_id", fixture.lotId)
        .eq("allocated_amount", 15),
    );
    expect(allocated.data).toHaveLength(1);

    const concurrent = await Promise.all([
      operatorClient.rpc("consume_supply_tx", {
        _request_id: crypto.randomUUID(),
        _supply_item_id: item.data!.id,
        _quantity: 5,
        _reference_type: "general",
        _reference_id: null,
        _notes: "Concurrent A",
        _event_type: "consumption",
      }),
      operatorClient.rpc("consume_supply_tx", {
        _request_id: crypto.randomUUID(),
        _supply_item_id: item.data!.id,
        _quantity: 5,
        _reference_type: "general",
        _reference_id: null,
        _notes: "Concurrent B",
        _event_type: "consumption",
      }),
    ]);
    expect(concurrent.filter((result) => result.error === null)).toHaveLength(1);
    expect(concurrent.filter((result) => result.error !== null)).toHaveLength(1);

    const operatorShift = await operatorClient.rpc("create_operational_shift_tx", {
      _name: `Denied ${stamp}`,
      _start_time: "08:00",
      _end_time: "16:00",
      _weekdays: [1, 2, 3, 4, 5],
    });
    expect(operatorShift.error).not.toBeNull();
    const adminShift = await admin1Client.rpc("create_operational_shift_tx", {
      _name: `Morning ${stamp}`,
      _start_time: "08:00",
      _end_time: "16:00",
      _weekdays: [1, 2, 3, 4, 5],
    });
    expect(adminShift.error).toBeNull();
    const shiftId = (adminShift.data as { shift_id: string }).shift_id;
    const foreignShift = await org2AdminClient
      .from("operational_shifts")
      .select("id")
      .eq("id", shiftId);
    expect(foreignShift.error).toBeNull();
    expect(foreignShift.data).toEqual([]);
  });

  // ---- 6. pg_proc Function Signatures Verification ----

  it("get_security_function_signatures: verifies exactly 2 FIFO signatures and 1 adjust_lot signature in pg_proc", async () => {
    const { data, error } = await serviceClient.rpc("get_security_function_signatures");

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const signatures = data as Array<{ proname: string; identity_args: string }>;

    const rodentSigs = signatures.filter((s) => s.proname === "fifo_consume_rodents");
    const insectSigs = signatures.filter((s) => s.proname === "fifo_consume_insects");
    const adjustSigs = signatures.filter((s) => s.proname === "adjust_lot");

    // Exactly 1 signature for fifo_consume_rodents
    expect(rodentSigs.length).toBe(1);
    expect(rodentSigs[0].identity_args).toBe("_species uuid, _size text, _qty integer");

    // Exactly 1 signature for fifo_consume_insects
    expect(insectSigs.length).toBe(1);
    expect(insectSigs[0].identity_args).toBe("_species uuid, _size text, _grams numeric");

    // Exactly 1 signature for adjust_lot (NO ambiguous overloads)
    expect(adjustSigs.length).toBe(1);
    expect(adjustSigs[0].identity_args).toBe(
      "_lot_id uuid, _males integer, _females integer, _unsexed integer, _mass_grams numeric, _tags text[], _notes text",
    );

    // Total security functions tracked = 3
    expect(signatures.length).toBe(3);

    // Calling get_security_function_signatures with authenticated client must be denied
    const { error: userDeniedErr } = await admin1Client.rpc("get_security_function_signatures");
    expect(userDeniedErr).not.toBeNull();
  });
});
