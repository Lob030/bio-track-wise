import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Beta `supabase.auth.oauth` namespace: use a local typed wrapper for the
// three methods we call. It routes to the same @supabase/supabase-js client.
type OAuthResult = {
  data?: {
    client?: { name?: string; redirect_uri?: string } | null;
    scope?: string;
    redirect_url?: string;
    redirect_to?: string;
  } | null;
  error?: { message?: string } | null;
};
type SupabaseOAuth = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = (supabase.auth as unknown as { oauth: SupabaseOAuth }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const nextPath = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next: nextPath } });
    }
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen grid place-items-center p-6 bg-background text-foreground">
      <Card className="max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold mb-2">No se pudo cargar la autorización</h1>
        <p className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </Card>
    </main>
  ),
});

function Consent() {
  const { authorization_id } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<OAuthResult["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await oauth.getAuthorizationDetails(authorization_id);
      if (cancelled) return;
      if (error) {
        setError(error.message ?? "Authorization error");
        setLoading(false);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authorization_id]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message ?? "Request failed");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background text-muted-foreground">
        Cargando autorización…
      </main>
    );
  }

  const clientName = details?.client?.name ?? "una aplicación";

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold mb-2">Conectar {clientName} a BioTrack</h1>
        <p className="text-sm text-muted-foreground mb-4">
          {clientName} podrá usar las herramientas de BioTrack habilitadas mientras estés
          autenticado. Los permisos y políticas de tu cuenta siguen aplicando.
        </p>
        {details?.client?.redirect_uri && (
          <p className="text-xs text-muted-foreground mb-4 break-all">
            Redirige a: <span className="font-mono">{details.client.redirect_uri}</span>
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive mb-3">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            Cancelar conexión
          </Button>
          <Button disabled={busy} onClick={() => decide(true)}>
            Aprobar
          </Button>
        </div>
      </Card>
    </main>
  );
}
