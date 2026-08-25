import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inviteSchema = z.object({ email: z.string().email(), role: z.literal("operator") });
const userActionSchema = z.object({ userId: z.string().uuid() });
const roleActionSchema = userActionSchema.extend({ role: z.enum(["admin", "operator"]) });

function inviteSiteUrl() {
  const configured = process.env.SITE_URL;
  if (!configured) throw new Error("SITE_URL no está configurada en el servidor.");
  const url = new URL(configured);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new Error("SITE_URL debe usar HTTPS fuera del entorno local.");
  }
  return url.origin;
}

export const inviteUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const parsed = inviteSchema.parse(data);
    const { data: inviteData, error: invErr } = await context.supabase.rpc(
      "create_organization_invite",
      {
        _email: parsed.email,
        _role: parsed.role,
      },
    );

    if (invErr) {
      if (invErr.code === "23505") {
        throw new Error("Ya existe una invitación pendiente para este correo electrónico.");
      }
      throw invErr;
    }

    const invite = inviteData as {
      token: string;
      email: string;
      organization_id: string;
    } | null;
    if (!invite?.token || !invite.email || !invite.organization_id) {
      throw new Error("La base de datos no devolvio una invitacion valida.");
    }

    const siteUrl = inviteSiteUrl();
    const redirectUrl = `${siteUrl}/accept-invite?token=${invite.token}`;

    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(invite.email, {
      redirectTo: redirectUrl,
    });

    if (inviteErr) {
      await supabaseAdmin
        .from("organization_invites")
        .delete()
        .eq("token", invite.token)
        .eq("organization_id", invite.organization_id);
      throw inviteErr;
    }

    return { success: true as const };
  });

export const revokeUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const parsed = userActionSchema.parse(data);
    const { error } = await context.supabase.rpc("manage_team_member", {
      _target_user_id: parsed.userId,
      _action: "revoke",
    });

    if (error) throw new Error(error.message);
    return { success: true as const };
  });

export const suspendUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const parsed = userActionSchema.parse(data);
    const { error } = await context.supabase.rpc("manage_team_member", {
      _target_user_id: parsed.userId,
      _action: "suspend",
    });

    if (error) throw new Error(error.message);
    return { success: true as const };
  });

export const reinstateUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const parsed = userActionSchema.parse(data);
    const { error } = await context.supabase.rpc("manage_team_member", {
      _target_user_id: parsed.userId,
      _action: "reinstate",
    });

    if (error) throw new Error(error.message);
    return { success: true as const };
  });

export const changeUserRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const parsed = roleActionSchema.parse(data);
    const { error } = await context.supabase.rpc("manage_team_member", {
      _target_user_id: parsed.userId,
      _action: "change_role",
      _new_role: parsed.role,
    });

    if (error) throw new Error(error.message);
    return { success: true as const };
  });
