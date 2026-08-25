import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: z.object({
    token: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Aceptar Invitación — BioTrack" },
      { name: "description", content: "Acepta tu invitación para unirte al equipo de BioTrack." },
    ],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const search = Route.useSearch();
  const token = search.token;
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function processInvite() {
      if (!token) {
        setStatus("error");
        setErrorMsg("No se proporcionó token de invitación.");
        return;
      }

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          setStatus("error");
          setErrorMsg(
            "No hay sesión activa. Haz clic nuevamente en el enlace recibido por correo.",
          );
          return;
        }

        const { data, error } = await supabase.rpc("accept_invite", { _token: token });

        if (error) {
          setStatus("error");
          setErrorMsg(error.message);
        } else if (
          data &&
          typeof data === "object" &&
          (data as { success?: boolean }).success === false
        ) {
          setStatus("error");
          const payload = data as { message?: string; status?: string };
          setErrorMsg(payload.message || `Estado: ${payload.status}`);
        } else {
          setStatus("success");
          setTimeout(() => {
            navigate({ to: "/" });
          }, 2500);
        }
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.message || "Error inesperado al procesar la invitación.");
      }
    }

    processInvite();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full p-8 text-center border-border/50 bg-card/60 backdrop-blur space-y-6">
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
            <h2 className="text-lg font-semibold">Procesando invitación...</h2>
            <p className="text-xs text-muted-foreground">
              Validando tus credenciales y asignando acceso al bioterio.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">¡Invitación Aceptada!</h2>
            <p className="text-xs text-muted-foreground">
              Te has unido exitosamente al bioterio. Redirigiendo al panel principal...
            </p>
            <Button onClick={() => navigate({ to: "/" })} className="w-full">
              Ir al Panel Principal
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Error al aceptar invitación</h2>
            <p className="text-xs text-destructive/90 bg-destructive/10 p-3 rounded border border-destructive/20">
              {errorMsg}
            </p>
            <Button variant="outline" onClick={() => navigate({ to: "/" })} className="w-full">
              Volver al Inicio
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
