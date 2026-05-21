import { createFileRoute } from "@tanstack/react-router";
import { TierGate } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/ai")({
  component: () => (
    <TierGate min="gold" module="Asistente IA">
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Sparkles className="h-6 w-6 text-info" /> Asistente IA</h1>
          <p className="text-sm text-muted-foreground">Secretaria virtual con confirmación obligatoria para acciones de escritura.</p>
        </div>
        <Card className="p-8 text-center border-dashed border-border bg-card/40 text-muted-foreground">
          Workspace de chat con loop de confirmación de mutaciones — implementación en siguiente iteración.
        </Card>
      </div>
    </TierGate>
  ),
});
