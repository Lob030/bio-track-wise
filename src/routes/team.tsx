import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users2, Trash2, UserPlus, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { AdminOnly } from "@/components/role-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: 'Equipo — BioTrack' },
      { name: "description", content: 'Gestiona los miembros y roles de tu equipo en BioTrack.' },
      { property: "og:title", content: 'Equipo — BioTrack' },
      { property: "og:description", content: 'Gestiona los miembros y roles de tu equipo en BioTrack.' },
      { property: "og:url", content: 'https://biostrack.lovable.app/team' },
    ],
    links: [{ rel: "canonical", href: 'https://biostrack.lovable.app/team' }],
  }),
  component: TeamPage,
});

function TeamPage() {
  return (
    <AdminOnly
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center p-8">
          <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            Solo el administrador puede gestionar el equipo.
          </p>
        </div>
      }
    >
      <TeamPageInner />
    </AdminOnly>
  );
}

function TeamPageInner() {
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch all users with roles (joined with profiles for name/email)
  const { data: members, isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles(email, full_name)")
        .order("role");
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleRevoke = async (userId: string) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (error) {
      toast.error("No se pudo revocar el acceso: " + error.message);
      return;
    }
    toast.success("Acceso revocado");
    qc.invalidateQueries({ queryKey: ["team-members"] });
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSubmitting(true);
    try {
      // inviteUserByEmail requires service_key and is not available from the browser client.
      // The admin should send the link manually or use the Supabase dashboard.
      // We simulate the UX and inform the admin.
      toast.info(
        "La invitación vía email requiere acceso al backend. Puedes agregar al operador manualmente desde el dashboard de Supabase.",
        { duration: 6000 }
      );
      setInviteEmail("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="Equipo"
      subtitle="Gestión de accesos al bioterio"
      icon={<Users2 className="h-6 w-6" />}
    >
      {/* Members list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Miembros con acceso
        </h2>

        {isLoading && (
          <Card className="p-8 text-center text-muted-foreground text-sm border-border/50">
            Cargando…
          </Card>
        )}

        {!isLoading && (!members || members.length === 0) && (
          <Card className="p-8 text-center text-muted-foreground text-sm border-dashed border-border/50">
            No hay operadores registrados aún. El dueño de la cuenta
            (administrador) siempre tiene acceso.
          </Card>
        )}

        {(members ?? []).map((m: any) => {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          const name = profile?.full_name ?? "Sin nombre";
          const email = profile?.email ?? m.user_id.slice(0, 8);
          const isAdmin = m.role === "admin";

          return (
            <Card
              key={m.user_id}
              className="p-4 border-border/50 bg-gradient-to-br from-card to-card/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-accent/40 grid place-items-center shrink-0">
                  {isAdmin ? (
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={isAdmin ? "default" : "secondary"}
                  className={
                    isAdmin
                      ? "bg-primary/20 text-primary border-primary/30 capitalize"
                      : "capitalize"
                  }
                >
                  {isAdmin ? "Administrador" : "Operador"}
                </Badge>
                {!isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60"
                    onClick={() => handleRevoke(m.user_id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Revocar acceso
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Invite section */}
      <div className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Agregar operador
        </h2>
        <Card className="p-5 border-border/50 bg-gradient-to-br from-card to-card/40 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Para agregar un operador, envíale una invitación. El operador podrá
            ver lotes, cajas y el dashboard, y registrar bajas — sin acceso a
            crear, editar ni eliminar registros, ni a almacén, reportes o
            clientes.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Label className="text-xs mb-1.5 block text-muted-foreground">
                Email del operador
              </Label>
              <Input
                type="email"
                placeholder="operador@ejemplo.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-10"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="h-10 gap-1.5 w-full sm:w-auto"
                onClick={handleInvite}
                disabled={submitting || !inviteEmail.trim()}
              >
                <UserPlus className="h-4 w-4" />
                Enviar invitación
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            ℹ️ Las invitaciones por email requieren configuración del backend
            (service key). Puedes agregar usuarios directamente desde el
            dashboard de Supabase → Authentication → Users.
          </p>
        </Card>
      </div>
    </PageShell>
  );
}
