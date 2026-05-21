import { createFileRoute } from "@tanstack/react-router";
import { TierGate } from "@/components/tier-gate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/warehouse")({
  component: () => (
    <TierGate min="gold" module="Almacén">
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Almacén</h1>
          <p className="text-sm text-muted-foreground">Inventario operativo en 5 categorías.</p>
        </div>
        <Tabs defaultValue="alimento">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="alimento">Alimento</TabsTrigger>
            <TabsTrigger value="limpieza">Limpieza</TabsTrigger>
            <TabsTrigger value="herramientas">Herramientas</TabsTrigger>
            <TabsTrigger value="entregas">Entregas</TabsTrigger>
            <TabsTrigger value="ejemplares">Ejemplares</TabsTrigger>
          </TabsList>
          {["alimento", "limpieza", "herramientas", "entregas", "ejemplares"].map((t) => (
            <TabsContent key={t} value={t}>
              <Card className="p-8 text-center border-dashed border-border bg-card/40 text-muted-foreground capitalize">
                {t}: estructura lista, interfaz de captura en siguiente iteración.
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </TierGate>
  ),
});
