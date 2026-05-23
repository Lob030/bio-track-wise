import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TierGate } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Rat, Bug } from "lucide-react";

type KindType = "rodent" | "insect";

interface SizeRuleRodent {
  label: string;
  min_days: number;
  max_days: number;
  weight_g?: string;
}

interface SizeRuleInsect {
  label: string;
  min_days: number;
  max_days: number;
  individuals_per_gram?: number;
}

function StockPage() {
  const [activeKind, setActiveKind] = useState<KindType>("rodent");
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────
  const { data: allSpecies, refetch: refetchSpecies } = useQuery({
    queryKey: ["species", "stock"],
    queryFn: async () =>
      (await supabase.from("species").select("*")).data ?? [],
  });

  const { data: allLots, refetch: refetchLots } = useQuery({
    queryKey: ["lots", "stock"],
    queryFn: async () =>
      (await supabase.from("lots").select("*").eq("status", "active")).data ??
      [],
  });

  // ── Refresh handler ──────────────────────────────────────────────────
  const handleRefresh = async () => {
    await Promise.all([refetchSpecies(), refetchLots()]);
    toast.success("Stock actualizado");
  };

  // ── Derived species / lots for active kind ───────────────────────────
  const speciesForKind = useMemo(
    () => (allSpecies ?? []).filter((s: any) => s.kind === activeKind),
    [allSpecies, activeKind],
  );

  const lotsForKind = useMemo(() => {
    const lots = allLots ?? [];
    if (activeKind === "rodent") {
      return lots.filter(
        (l: any) =>
          l.kind === "rodent" &&
          (l.lot_type === "birth" || l.lot_type === "engorda"),
      );
    }
    return lots.filter(
      (l: any) => l.kind === "insect" && l.lot_type === "engorda",
    );
  }, [allLots, activeKind]);

  // ── Filtered by species chip ─────────────────────────────────────────
  const filteredSpecies = useMemo(() => {
    if (!selectedSpeciesId) return speciesForKind;
    return speciesForKind.filter((s: any) => s.id === selectedSpeciesId);
  }, [speciesForKind, selectedSpeciesId]);

  // ── Age helper ───────────────────────────────────────────────────────
  const getLotAge = (lot: any): number => {
    if (!lot.started_at) return 0;
    const started = new Date(lot.started_at + "T00:00:00");
    if (isNaN(started.getTime())) return 0;

    const today = new Date();
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const startedMidnight = new Date(
      started.getFullYear(),
      started.getMonth(),
      started.getDate(),
    );

    const diffTime = todayMidnight.getTime() - startedMidnight.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };

  // ── Rodent stock computation ─────────────────────────────────────────
  const rodentStockData = useMemo(() => {
    if (activeKind !== "rodent") return [];
    return filteredSpecies.map((species: any) => {
      const rules = (species.size_rules as any[] | null) ?? [];
      const speciesLots = lotsForKind.filter(
        (l: any) => l.species_id === species.id,
      );

      let totalIndividuals = 0;
      let unmatchedIndividuals = 0;
      const matchedLotIds = new Set<string>();

      const rows = rules.map((rule: SizeRuleRodent) => {
        const stock = speciesLots.reduce((sum: number, lot: any) => {
          const age = getLotAge(lot);
          if (age >= rule.min_days && age <= rule.max_days) {
            matchedLotIds.add(lot.id);
            return (
              sum +
              (Number(lot.males) || 0) +
              (Number(lot.females) || 0) +
              (Number(lot.unsexed) || 0)
            );
          }
          return sum;
        }, 0);
        totalIndividuals += stock;
        return { ...rule, stock };
      });

      speciesLots.forEach((lot: any) => {
        if (!matchedLotIds.has(lot.id)) {
          unmatchedIndividuals +=
            (Number(lot.males) || 0) +
            (Number(lot.females) || 0) +
            (Number(lot.unsexed) || 0);
        }
      });

      if (unmatchedIndividuals > 0) {
        rows.push({
          label: "Fuera de rango / Rezagados",
          min_days: 0,
          max_days: 0,
          weight_g: "—",
          stock: unmatchedIndividuals,
          isUnmatched: true,
        } as any);
        totalIndividuals += unmatchedIndividuals;
      }

      return { species, rows, totalIndividuals };
    });
  }, [filteredSpecies, lotsForKind, activeKind]);

  // ── Insect stock computation ─────────────────────────────────────────
  const insectStockData = useMemo(() => {
    if (activeKind !== "insect") return [];
    return filteredSpecies.map((species: any) => {
      const rules = (species.size_rules as any[] | null) ?? [];
      const speciesLots = lotsForKind.filter(
        (l: any) => l.species_id === species.id,
      );

      let totalGrams = 0;
      let unmatchedGrams = 0;
      const matchedLotIds = new Set<string>();

      const rows = rules.map((rule: SizeRuleInsect) => {
        const stock = speciesLots.reduce((sum: number, lot: any) => {
          const age = getLotAge(lot);
          if (age >= rule.min_days && age <= rule.max_days) {
            matchedLotIds.add(lot.id);
            return sum + (Number(lot.mass_grams) || 0);
          }
          return sum;
        }, 0);
        totalGrams += stock;
        return { ...rule, stock };
      });

      speciesLots.forEach((lot: any) => {
        if (!matchedLotIds.has(lot.id)) {
          unmatchedGrams += Number(lot.mass_grams) || 0;
        }
      });

      if (unmatchedGrams > 0) {
        rows.push({
          label: "Fuera de rango / Rezagados",
          min_days: 0,
          max_days: 0,
          individuals_per_gram: undefined,
          stock: unmatchedGrams,
          isUnmatched: true,
        } as any);
        totalGrams += unmatchedGrams;
      }

      return { species, rows, totalGrams };
    });
  }, [filteredSpecies, lotsForKind, activeKind]);

  // ── Reset species filter when switching kind ─────────────────────────
  const handleKindSwitch = (kind: KindType) => {
    setActiveKind(kind);
    setSelectedSpeciesId(null);
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Stock
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vista en tiempo real del inventario por tamaño y especie.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="shrink-0"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Kind toggle */}
      <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
        <button
          onClick={() => handleKindSwitch("rodent")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeKind === "rodent"
              ? "bg-primary text-primary-foreground"
              : "bg-accent/40 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Rat className="h-4 w-4" />
          Roedores
        </button>
        <button
          onClick={() => handleKindSwitch("insect")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeKind === "insect"
              ? "bg-primary text-primary-foreground"
              : "bg-accent/40 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bug className="h-4 w-4" />
          Insectos
        </button>
      </div>

      {/* Species filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={`cursor-pointer transition-colors ${
            selectedSpeciesId === null
              ? "bg-primary/20 text-primary border-primary/40"
              : "bg-accent/40 text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setSelectedSpeciesId(null)}
        >
          Todas
        </Badge>
        {speciesForKind.map((s: any) => (
          <Badge
            key={s.id}
            variant="outline"
            className={`cursor-pointer transition-colors ${
              selectedSpeciesId === s.id
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-accent/40 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() =>
              setSelectedSpeciesId(selectedSpeciesId === s.id ? null : s.id)
            }
          >
            {s.name}
          </Badge>
        ))}
      </div>

      {/* Content */}
      {activeKind === "rodent" ? (
        <>
          {filteredSpecies.length === 0 ? (
            <Card className="border-dashed border-border bg-card/60 p-8 text-center">
              <p className="text-muted-foreground">
                No hay especies de roedores registradas.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {rodentStockData.map(({ species, rows, totalIndividuals }) => (
                <Card
                  key={species.id}
                  className="border-border bg-card/60 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">
                      🐭 {species.name}{" "}
                      {species.unit_price_mxn !== undefined && species.unit_price_mxn !== null && (
                        <span className="text-xs text-emerald-400 font-normal ml-1 mr-1">
                          (${species.unit_price_mxn}/unidad)
                        </span>
                      )}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({totalIndividuals.toLocaleString("es-MX")} individuos)
                      </span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-accent/30">
                          <th className="text-[10px] uppercase text-muted-foreground font-medium text-left px-4 py-2">
                            Tamaño
                          </th>
                          <th className="text-[10px] uppercase text-muted-foreground font-medium text-left px-4 py-2">
                            Días
                          </th>
                          <th className="text-[10px] uppercase text-muted-foreground font-medium text-left px-4 py-2">
                            Peso (g)
                          </th>
                          <th className="text-[10px] uppercase text-muted-foreground font-medium text-right px-4 py-2">
                            Stock
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row: any, i: number) => (
                          <tr
                            key={i}
                            className="border-t border-border/50 hover:bg-accent/10 transition-colors"
                          >
                            <td className="px-4 py-2 text-foreground">
                              {row.label}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {row.isUnmatched ? "Fuera de rango" : `${row.min_days}–${row.max_days}`}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {row.weight_g ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-foreground">
                              {row.stock > 0
                                ? row.stock.toLocaleString("es-MX")
                                : "--"}
                            </td>
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-4 py-4 text-center text-muted-foreground text-xs"
                            >
                              Sin reglas de tamaño configuradas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {filteredSpecies.length === 0 ? (
            <Card className="border-dashed border-border bg-card/60 p-8 text-center">
              <p className="text-muted-foreground">
                No hay especies de insectos registradas.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {insectStockData.map(({ species, rows, totalGrams }) => (
                <Card
                  key={species.id}
                  className="border-border bg-card/60 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">
                      🐛 {species.name}{" "}
                      {species.unit_price_mxn !== undefined && species.unit_price_mxn !== null && (
                        <span className="text-xs text-emerald-400 font-normal ml-1 mr-1">
                          (${species.unit_price_mxn}/gramo)
                        </span>
                      )}{" "}
                      <span className="text-muted-foreground font-normal">
                        (
                        {totalGrams.toLocaleString("es-MX", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        g en total)
                      </span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-accent/30">
                          <th className="text-[10px] uppercase text-muted-foreground font-medium text-left px-4 py-2">
                            Tamaño
                          </th>
                          <th className="text-[10px] uppercase text-muted-foreground font-medium text-left px-4 py-2">
                            Días
                          </th>
                          <th className="text-[10px] uppercase text-muted-foreground font-medium text-left px-4 py-2">
                            Cant. ind por 1g
                          </th>
                          <th className="text-[10px] uppercase text-muted-foreground font-medium text-right px-4 py-2">
                            Stock (g)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row: any, i: number) => (
                          <tr
                            key={i}
                            className="border-t border-border/50 hover:bg-accent/10 transition-colors"
                          >
                            <td className="px-4 py-2 text-foreground">
                              {row.label}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {row.isUnmatched ? "Fuera de rango" : `${row.min_days}–${row.max_days}`}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {row.individuals_per_gram ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-foreground">
                              {row.stock > 0
                                ? row.stock.toLocaleString("es-MX", {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })
                                : "--"}
                            </td>
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-4 py-4 text-center text-muted-foreground text-xs"
                            >
                              Sin reglas de tamaño configuradas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute("/stock")({
  component: () => (
    <TierGate min="gold" module="Stock">
      <StockPage />
    </TierGate>
  ),
});
