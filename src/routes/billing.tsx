import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown } from "lucide-react";
import { useProfile, type Tier } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/billing")({ component: Billing });

const PLANS: { tier: Tier; price: string; name: string; features: string[]; accent: string }[] = [
  { tier: "bronze", price: "Gratis", name: "Bronze",
    features: ["5 lotes roedores", "5 lotes insectos", "Alertas básicas", "Dashboard"],
    accent: "border-amber-700/40" },
  { tier: "silver", price: "$33 MXN/mes", name: "Silver",
    features: ["20 lotes roedores", "20 lotes insectos", "Alertas avanzadas", "Dashboard"],
    accent: "border-slate-500/40" },
  { tier: "gold", price: "$199 MXN/mes", name: "Gold",
    features: ["Lotes ilimitados", "Almacén + Stock", "Ventas + 60 clientes", "Reportes (sin avanzados)", "IA: 20 prompts/mes"],
    accent: "border-yellow-500/40" },
  { tier: "diamond", price: "$477 MXN/mes", name: "Diamond",
    features: ["Todo ilimitado", "Reportes avanzados", "IA ilimitada", "Soporte prioritario"],
    accent: "border-cyan-500/40" },
];

function Billing() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const current = (profile?.tier ?? "bronze") as Tier;

  const setTier = async (t: Tier) => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ tier: t, tier_renewed_at: new Date().toISOString() }).eq("id", profile.id);
    if (error) return toast.error(error.message);
    toast.success(`Plan actualizado a ${t}`);
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Suscripción</h1>
        <p className="text-sm text-muted-foreground">Elige el plan que se ajusta a tu operación.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((p) => {
          const active = current === p.tier;
          return (
            <Card key={p.tier} className={`p-5 border bg-card/60 ${p.accent} ${active ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  {p.tier === "diamond" && <Crown className="h-4 w-4 text-cyan-300" />}
                  {p.name}
                </h3>
                {active && <Badge className="bg-primary text-primary-foreground">Actual</Badge>}
              </div>
              <div className="text-2xl font-bold mb-4">{p.price}</div>
              <ul className="space-y-1.5 mb-5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-emerald-glow mt-0.5 shrink-0" /> {f}</li>
                ))}
              </ul>
              <Button variant={active ? "outline" : "default"} className="w-full" disabled={active} onClick={() => setTier(p.tier)}>
                {active ? "Plan actual" : "Cambiar a " + p.name}
              </Button>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Demo: el cambio de plan se aplica al instante. En producción se conecta al checkout.</p>
    </div>
  );
}
