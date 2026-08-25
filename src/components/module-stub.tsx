import { ReactNode } from "react";
import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ModuleStub({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="p-10 text-center border-dashed border-border bg-card/40">
        <Construction className="h-10 w-10 mx-auto text-amber-glow mb-3" />
        <h3 className="font-semibold mb-1">Módulo en construcción</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          La estructura base, el esquema de base de datos y las reglas de acceso por plan ya están listas para este módulo.
          La interfaz completa se habilita en la siguiente iteración.
        </p>
        {children}
      </Card>
    </div>
  );
}
