import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TierGate } from "@/components/tier-gate";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/kanban")({
  component: () => (
    <TierGate min="silver" module="Kanban">
      <KanbanPage />
    </TierGate>
  ),
});

function KanbanPage() {
  const { data: lots } = useQuery({
    queryKey: ["lots-kanban"],
    queryFn: async () =>
      (await supabase.from("lots")
        .select("id, lot_code, species_id, started_at, males, females, unsexed, lot_type, kind, status, total_deaths, mass_grams")
        .eq("status", "active")).data ?? [],
  });

  const { data: species } = useQuery({
    queryKey: ["species-kanban"],
    queryFn: async () =>
      (await supabase.from("species").select("id, name, size_rules")).data ?? [],
  });

  // Assign each lot to a stage column
  const columns = useMemo(() => {
    const cols: Record<string, { label: string; color: string; lots: any[] }> = {
      neonato:   { label: "🐣 Neonatos", color: "border-pink-500/40 bg-pink-500/5", lots: [] },
      creciendo: { label: "🌱 Creciendo", color: "border-blue-500/40 bg-blue-500/5", lots: [] },
      intermedio:{ label: "📦 Intermedios", color: "border-amber-500/40 bg-amber-500/5", lots: [] },
      listo:     { label: "✅ Listos para vender", color: "border-emerald-500/40 bg-emerald-500/5", lots: [] },
      breeder:   { label: "🔁 Reproductores", color: "border-purple-500/40 bg-purple-500/5", lots: [] },
    };

    (lots ?? []).forEach(lot => {
      if (lot.lot_type === "breeder") {
        cols.breeder.lots.push(lot);
        return;
      }

      // Para roedores
      if (lot.kind === "rodent") {
        const sp = (species ?? []).find(s => s.id === lot.species_id);
        const rules = (sp?.size_rules as any[]) ?? [];
        const ageToday = Math.floor((Date.now() - new Date(lot.started_at).getTime()) / 86400000);
        const totalRules = rules.length;
        const ruleIndex = rules.findIndex(r => ageToday >= r.min_days && ageToday <= r.max_days);
        const hasPrice = rules.find(r => ageToday >= r.min_days && ageToday <= r.max_days)?.price_mxn > 0;

        if (hasPrice) {
          cols.listo.lots.push({ ...lot, ageToday, currentRule: rules[ruleIndex] });
        } else if (ruleIndex === 0 && ageToday <= (rules[0]?.max_days ?? 7)) {
          cols.neonato.lots.push({ ...lot, ageToday });
        } else if (totalRules > 0 && ruleIndex >= Math.floor(totalRules / 2)) {
          cols.intermedio.lots.push({ ...lot, ageToday });
        } else {
          cols.creciendo.lots.push({ ...lot, ageToday });
        }
      }
      // Para insectos (basado en biomasa o simplemente lista todos)
      else if (lot.kind === "insect") {
        cols.creciendo.lots.push({ ...lot, ageToday: null });
      }
    });

    return cols;
  }, [lots, species]);

  return (
    <PageShell
      title="Kanban de Lotes"
      subtitle="Vista por etapa de crecimiento de todos los lotes activos."
      icon={<LayoutGrid className="h-6 w-6" />}
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.values(columns).map(col => (
          <div key={col.label}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <Badge variant="outline" className="text-[10px]">{col.lots.length}</Badge>
            </div>
            <div className="space-y-2">
              {col.lots.length === 0 ? (
                <Card className="p-3 border-dashed text-center text-xs text-muted-foreground animate-fade-in">
                  Vacío
                </Card>
              ) : (
                col.lots.map(lot => {
                  const total = lot.kind === "rodent"
                    ? (lot.males ?? 0) + (lot.females ?? 0) + (lot.unsexed ?? 0)
                    : lot.mass_grams;
                  const sp = (species ?? []).find(s => s.id === lot.species_id);
                  return (
                    <Card key={lot.id} className={`p-3 border ${col.color} space-y-1.5 shadow-sm hover:shadow-md transition-all duration-200`}>
                      <p className="font-bold text-sm font-mono">{lot.lot_code ?? lot.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{sp?.name ?? "—"}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold">
                          {lot.kind === "rodent" ? `${total} animales` : `${total}g biomasa`}
                        </span>
                        {lot.ageToday != null && (
                          <span className="text-[10px] text-muted-foreground">{lot.ageToday}d</span>
                        )}
                      </div>
                      {lot.currentRule?.price_mxn > 0 && (
                        <p className="text-[10px] text-emerald-400 font-semibold">
                          ${lot.currentRule.price_mxn}/u · {lot.currentRule.label}
                        </p>
                      )}
                      {(lot.total_deaths ?? 0) > 0 && (
                        <p className="text-[10px] text-rose-400">
                          💀 {lot.total_deaths}
                        </p>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
