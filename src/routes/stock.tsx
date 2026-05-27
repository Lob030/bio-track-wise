import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TierGate } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Rat, Bug, Download } from "lucide-react";
import html2canvas from "html2canvas";

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

// ── Extracted card components so useRef is at the top level ──────────────────

interface RodentCardProps {
  species: any;
  rows: any[];
  totalIndividuals: number;
  downloadingSpeciesId: string | null;
  onDownload: (id: string, name: string, el: HTMLDivElement | null) => void;
}

function RodentSpeciesCard({ species, rows, totalIndividuals, downloadingSpeciesId, onDownload }: RodentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  return (
    <Card
      ref={cardRef}
      key={species.id}
      className="border-border bg-card overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0" aria-hidden>🐭</span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-foreground tracking-tight truncate">
                {species.name}
              </h3>
              {species.unit_price_mxn !== undefined && species.unit_price_mxn !== null && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Precio base: <span className="font-semibold text-primary">${species.unit_price_mxn}</span> / unidad
                </p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-xs font-semibold tabular-nums shrink-0">
            {totalIndividuals.toLocaleString("es-MX")} ind.
          </Badge>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-left px-4 py-2.5">Tamaño</th>
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-left px-4 py-2.5">Días</th>
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-left px-4 py-2.5">Peso (g)</th>
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-left px-4 py-2.5">Precio</th>
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-right px-4 py-2.5">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, i: number) => (
              <tr
                key={i}
                className="border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-2.5 text-foreground font-semibold">{row.label}</td>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                  {row.isUnmatched ? "Fuera de rango" : `${row.min_days}–${row.max_days}`}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.weight_g ?? "—"}</td>
                <td className="px-4 py-2.5 text-primary font-semibold tabular-nums">
                  {row.price_mxn != null ? `$${row.price_mxn}` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">
                  {row.stock > 0 ? row.stock.toLocaleString("es-MX") : <span className="text-muted-foreground/60 font-normal">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-xs">
                  Sin reglas de tamaño configuradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDownload(species.id, species.name, cardRef.current)}
          disabled={downloadingSpeciesId === species.id}
          className="text-xs h-8 px-3 font-medium"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {downloadingSpeciesId === species.id ? "Descargando…" : "Descargar imagen"}
        </Button>
      </div>
    </Card>
  );
}

interface InsectCardProps {
  species: any;
  rows: any[];
  totalGrams: number;
  downloadingSpeciesId: string | null;
  onDownload: (id: string, name: string, el: HTMLDivElement | null) => void;
}

function InsectSpeciesCard({ species, rows, totalGrams, downloadingSpeciesId, onDownload }: InsectCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  return (
    <Card
      ref={cardRef}
      key={species.id}
      className="border-border bg-card overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0" aria-hidden>🐛</span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-foreground tracking-tight truncate">
                {species.name}
              </h3>
              {species.unit_price_mxn !== undefined && species.unit_price_mxn !== null && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Precio base: <span className="font-semibold text-primary">${species.unit_price_mxn}</span> / gramo
                </p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-xs font-semibold tabular-nums shrink-0">
            {totalGrams.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g
          </Badge>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-left px-4 py-2.5">Tamaño</th>
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-left px-4 py-2.5">Días</th>
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-left px-4 py-2.5">Ind. / 1g</th>
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-left px-4 py-2.5">Precio</th>
              <th className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold text-right px-4 py-2.5">Stock (g)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, i: number) => (
              <tr
                key={i}
                className="border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-2.5 text-foreground font-semibold">{row.label}</td>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                  {row.isUnmatched ? "Fuera de rango" : `${row.min_days}–${row.max_days}`}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.individuals_per_gram ?? "—"}</td>
                <td className="px-4 py-2.5 text-primary font-semibold tabular-nums">
                  {row.price_mxn != null ? `$${row.price_mxn}` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">
                  {row.stock > 0
                    ? row.stock.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                    : <span className="text-muted-foreground/60 font-normal">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-xs">
                  Sin reglas de tamaño configuradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDownload(species.id, species.name, cardRef.current)}
          disabled={downloadingSpeciesId === species.id}
          className="text-xs h-8 px-3 font-medium"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {downloadingSpeciesId === species.id ? "Descargando…" : "Descargar imagen"}
        </Button>
      </div>
    </Card>
  );
}

// ── Pure compute helpers (kept outside useMemo so hook count is stable) ─────

function computeRodentStock(species: any, lotsForKind: any[], getLotAge: (lot: any) => number) {
  const rules = (species.size_rules as any[] | null) ?? [];
  const speciesLots = lotsForKind.filter((l: any) => l.species_id === species.id);

  let totalIndividuals = 0;
  let unmatchedIndividuals = 0;
  const matchedLotIds = new Set<string>();

  const rows = rules.map((rule: SizeRuleRodent) => {
    const stock = speciesLots.reduce((sum: number, lot: any) => {
      const age = getLotAge(lot);
      if (age >= rule.min_days && age <= rule.max_days) {
        matchedLotIds.add(lot.id);
        return sum + (Number(lot.males) || 0) + (Number(lot.females) || 0) + (Number(lot.unsexed) || 0);
      }
      return sum;
    }, 0);
    totalIndividuals += stock;
    return { ...rule, stock };
  });

  speciesLots.forEach((lot: any) => {
    if (!matchedLotIds.has(lot.id)) {
      unmatchedIndividuals += (Number(lot.males) || 0) + (Number(lot.females) || 0) + (Number(lot.unsexed) || 0);
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
}

function computeInsectStock(species: any, lotsForKind: any[], getLotAge: (lot: any) => number) {
  const rules = (species.size_rules as any[] | null) ?? [];
  const speciesLots = lotsForKind.filter((l: any) => l.species_id === species.id);

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
}

// ── Main page ────────────────────────────────────────────────────────────────

function StockPage() {
  const [activeKind, setActiveKind] = useState<KindType>("rodent");
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────
  const { data: allSpecies, refetch: refetchSpecies } = useQuery({
    queryKey: ["species"],
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
  const rodentStockData = useMemo(
    () => (activeKind === "rodent" ? filteredSpecies.map((s: any) => computeRodentStock(s, lotsForKind, getLotAge)) : []),
    [filteredSpecies, lotsForKind, activeKind],
  );

  // ── Insect stock computation ─────────────────────────────────────────
  const insectStockData = useMemo(
    () => (activeKind === "insect" ? filteredSpecies.map((s: any) => computeInsectStock(s, lotsForKind, getLotAge)) : []),
    [filteredSpecies, lotsForKind, activeKind],
  );

  // ── Reset species filter when switching kind ─────────────────────────
  const handleKindSwitch = (kind: KindType) => {
    setActiveKind(kind);
    setSelectedSpeciesId(null);
  };

  // ── Download species card as image ───────────────────────────────────
  const [downloadingSpeciesId, setDownloadingSpeciesId] = useState<string | null>(null);

  const downloadSpeciesCard = async (
    speciesId: string,
    speciesName: string,
    cardElement: HTMLDivElement | null
  ) => {
    if (!cardElement) return;
    setDownloadingSpeciesId(speciesId);
    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: "oklch(0.12 0.015 250)",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      const today = new Date().toISOString().split("T")[0];
      link.download = `stock-${speciesName.replace(/\s+/g, "-")}-${today}.png`;
      link.click();
      toast.success("Imagen descargada");
    } catch (err) {
      console.error("Download failed:", err);
      toast.error("Error al descargar imagen");
    } finally {
      setDownloadingSpeciesId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
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
            <Card className="border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 p-8 text-center shadow-sm">
              <p className="text-muted-foreground">
                No hay especies de roedores registradas.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {rodentStockData.map(({ species, rows, totalIndividuals }) => (
                <RodentSpeciesCard
                  key={species.id}
                  species={species}
                  rows={rows}
                  totalIndividuals={totalIndividuals}
                  downloadingSpeciesId={downloadingSpeciesId}
                  onDownload={downloadSpeciesCard}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {filteredSpecies.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 p-8 text-center shadow-sm">
              <p className="text-muted-foreground">
                No hay especies de insectos registradas.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {insectStockData.map(({ species, rows, totalGrams }) => (
                <InsectSpeciesCard
                  key={species.id}
                  species={species}
                  rows={rows}
                  totalGrams={totalGrams}
                  downloadingSpeciesId={downloadingSpeciesId}
                  onDownload={downloadSpeciesCard}
                />
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
