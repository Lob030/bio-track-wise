import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ThemeSelector } from "@/components/theme-selector";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { Settings, CreditCard, DatabaseBackup, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-role";
import { toast } from "sonner";
import { toUserFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Configuración — BioTrack" },
      {
        name: "description",
        content: "Personaliza el aspecto visual y los ajustes de tu cuenta de BioTrack.",
      },
      { property: "og:title", content: "Configuración — BioTrack" },
      {
        property: "og:description",
        content: "Personaliza el aspecto visual y los ajustes de tu cuenta de BioTrack.",
      },
      { property: "og:url", content: "https://biostrack.lovable.app/settings" },
    ],
    links: [{ rel: "canonical", href: "https://biostrack.lovable.app/settings" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const isAdmin = useIsAdmin();
  const [exporting, setExporting] = useState(false);

  const exportOperationalData = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("export_organization_data");
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `biotrack-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Exportación operativa generada");
    } catch (error) {
      toast.error(toUserFriendlyError(error, "No fue posible generar la exportación"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageShell
      title="Configuración"
      subtitle="Personaliza el aspecto visual de BioTrack y gestiona los ajustes generales de tu cuenta."
      icon={<Settings className="h-6 w-6" />}
    >
      <div className="space-y-6 max-w-4xl">
        {/* Theme Settings Section */}
        <Card className="p-6 border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200">
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2 text-foreground">
            🎨 Personalización Visual
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Elige entre 7 temas visuales únicos y profesionales. Tus preferencias se guardarán en tu
            perfil de BioTrack.
          </p>
          <ThemeSelector />
        </Card>

        {/* Account & Billing quick link Section */}
        <Card className="p-6 border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200">
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2 text-foreground">
            💳 Suscripción y Cuenta
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Consulta y cambia tu plan actual de BioTrack (Bronze, Silver, Gold, Diamond).
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-10 sm:h-9 min-h-10 sm:min-h-9 transition-all duration-200"
          >
            <Link to="/billing" className="flex items-center gap-2">
              <CreditCard className="h-4.5 w-4.5 sm:h-4 sm:w-4" />
              Ver Planes de Suscripción
            </Link>
          </Button>
        </Card>

        {isAdmin && (
          <Card className="p-6 border-border/50 shadow-sm">
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2 text-foreground">
              <DatabaseBackup className="h-5 w-5" /> Continuidad operativa
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Descarga una copia JSON de los datos de tu organización para consulta y recuperación
              operativa.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={exportOperationalData}
              disabled={exporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? "Generando..." : "Exportar datos"}
            </Button>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
export default SettingsPage;
