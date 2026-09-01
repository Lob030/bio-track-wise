import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { useProfile, tierAllows, type Tier } from "@/hooks/use-profile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function TierGate({ min, children, module }: { min: Tier; children: ReactNode; module?: string }) {
  const { data: profile, isLoading } = useProfile();
  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando…</div>;
  const tier = (profile?.tier ?? "bronze") as Tier;
  if (tierAllows(tier, min)) return <>{children}</>;
  return (
    <div className="p-8 flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md p-8 text-center border-amber-700/40 bg-card/60 backdrop-blur">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-amber-500/15 grid place-items-center">
          <Lock className="h-7 w-7 text-amber-glow" />
        </div>
        <h3 className="text-xl font-bold mb-2">{module ?? "Módulo"} bloqueado</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Tu plan <span className="capitalize font-semibold text-foreground">{tier}</span> no incluye este módulo.
          Requiere plan <span className="capitalize font-semibold text-primary">{min}</span> o superior.
        </p>
        <Button asChild className="w-full">
          <Link to="/billing"><Sparkles className="h-4 w-4 mr-2" /> Ver planes</Link>
        </Button>
      </Card>
    </div>
  );
}
