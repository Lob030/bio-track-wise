import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeSelector } from "@/components/theme-selector";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { Settings, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
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
            Elige entre 7 temas visuales únicos y profesionales. Tus preferencias se guardarán en tu perfil de BioTrack.
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
          <Button asChild variant="outline" size="sm" className="h-10 sm:h-9 min-h-10 sm:min-h-9 transition-all duration-200">
            <Link to="/billing" className="flex items-center gap-2">
              <CreditCard className="h-4.5 w-4.5 sm:h-4 sm:w-4" />
              Ver Planes de Suscripción
            </Link>
          </Button>
        </Card>
      </div>
    </PageShell>
  );
}
export default SettingsPage;
