import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitFork, ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind = "rodent" | "insect";

interface LotRow {
  id: string;
  lot_code: string | null;
  parent_lot_id: string | null;
  lot_type: string | null;
  species_id: string | null;
  status: string | null;
  started_at: string | null;
  males: number | null;
  females: number | null;
  unsexed: number | null;
  mass_grams: number | null;
}

interface SpeciesRow {
  id: string;
  name: string;
}

interface TreeNodeData extends LotRow {
  children: TreeNodeData[];
}

// ─────────────────────────────────────────────────────────────────
// Helper: build tree from flat list
// ─────────────────────────────────────────────────────────────────
function buildTree(lots: LotRow[]): { roots: TreeNodeData[]; nodeMap: Map<string, TreeNodeData> } {
  const nodeMap = new Map<string, TreeNodeData>();
  lots.forEach((lot) => nodeMap.set(lot.id, { ...lot, children: [] }));

  const roots: TreeNodeData[] = [];
  lots.forEach((lot) => {
    const node = nodeMap.get(lot.id)!;
    if (lot.parent_lot_id && nodeMap.has(lot.parent_lot_id)) {
      nodeMap.get(lot.parent_lot_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return { roots, nodeMap };
}

// ─────────────────────────────────────────────────────────────────
// Lot type badge labels
// ─────────────────────────────────────────────────────────────────
const LOT_TYPE_LABEL: Record<string, string> = {
  breeder: "Reproductor",
  engorda: "Engorda",
  birth: "Nacimiento",
};

// ─────────────────────────────────────────────────────────────────
// TreeNode component
// ─────────────────────────────────────────────────────────────────
interface TreeNodeProps {
  node: TreeNodeData;
  kind: Kind;
  speciesMap: Map<string, string>;
  depth?: number;
}

function TreeNode({ node, kind, speciesMap, depth = 0 }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);

  const label = node.lot_code ?? node.id.slice(-8);
  const speciesName = node.species_id ? (speciesMap.get(node.species_id) ?? "—") : "—";
  const lotTypeLabel = node.lot_type ? (LOT_TYPE_LABEL[node.lot_type] ?? node.lot_type) : "—";
  const hasChildren = node.children.length > 0;

  const population =
    kind === "rodent"
      ? (node.males ?? 0) + (node.females ?? 0) + (node.unsexed ?? 0)
      : null;
  const massGrams = kind === "insect" ? node.mass_grams : null;

  const isActive = node.status === "active";

  return (
    <div style={{ paddingLeft: depth > 0 ? "2rem" : 0 }}>
      <div
        style={{
          borderLeft: depth > 0 ? "2px solid var(--color-border-secondary, hsl(var(--border)))" : "none",
          paddingLeft: depth > 0 ? "0.75rem" : 0,
          marginBottom: "0.5rem",
        }}
      >
        <Card
          className="p-3 border-border/50 bg-gradient-to-br from-card to-card/40 hover:border-primary/40 hover:shadow-md transition-all duration-200 shadow-sm"
          style={{ cursor: hasChildren ? "default" : "default" }}
        >
          <div className="flex items-start gap-2">
            {/* Expand / collapse button */}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 mt-0.5 h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
              style={{ visibility: hasChildren ? "visible" : "hidden" }}
              aria-label={expanded ? "Colapsar" : "Expandir"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Content */}
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              {/* Lot code */}
              <span className="text-sm font-bold tracking-tight text-foreground font-heading">
                {label}
              </span>

              {/* Type badge */}
              <Badge
                variant="secondary"
                className="text-[10px] px-2 py-0.5 rounded-md bg-accent/30 text-foreground capitalize font-medium"
              >
                {lotTypeLabel}
              </Badge>

              {/* Species badge */}
              {node.species_id && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0.5 rounded-md border-border/40 text-muted-foreground"
                >
                  {speciesName}
                </Badge>
              )}

              {/* Population */}
              <span className="text-[11px] text-muted-foreground">
                {kind === "rodent" && population !== null && (
                  <>
                    <span className="font-semibold text-foreground">{population}</span>{" "}
                    indiv.
                    {(node.males !== null || node.females !== null || node.unsexed !== null) && (
                      <span className="ml-1 text-muted-foreground/70">
                        (♂{node.males ?? 0} ♀{node.females ?? 0}{" "}
                        {(node.unsexed ?? 0) > 0 ? `S/S${node.unsexed}` : ""})
                      </span>
                    )}
                  </>
                )}
                {kind === "insect" && massGrams !== null && (
                  <>
                    <span className="font-semibold text-foreground">{massGrams}</span>g
                  </>
                )}
              </span>

              {/* Status badge */}
              <Badge
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-transparent"
                }`}
              >
                {isActive ? "Activo" : "Finalizado"}
              </Badge>

              {/* Date */}
              {node.started_at && (
                <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                  {new Date(node.started_at).toLocaleDateString("es-MX")}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Render children recursively */}
        {hasChildren && expanded && (
          <div className="mt-1">
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                kind={kind}
                speciesMap={speciesMap}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main LotTree component
// ─────────────────────────────────────────────────────────────────
export function LotTree({ kind }: { kind: Kind }) {
  const [selectedSpecies, setSelectedSpecies] = useState<string>("all");

  const { data: lots = [] } = useQuery<LotRow[]>({
    queryKey: ["lots", kind],
    queryFn: async () =>
      (
        await supabase
          .from("lots")
          .select(
            "id, lot_code, parent_lot_id, lot_type, species_id, status, started_at, males, females, unsexed, mass_grams"
          )
          .eq("kind", kind)
          .order("started_at", { ascending: true })
      ).data ?? [],
  });

  const { data: species = [] } = useQuery<SpeciesRow[]>({
    queryKey: ["species", kind],
    queryFn: async () =>
      (await supabase.from("species").select("id, name").eq("kind", kind)).data ?? [],
  });

  const speciesMap = useMemo(() => {
    const m = new Map<string, string>();
    species.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [species]);

  const { roots } = useMemo(() => buildTree(lots), [lots]);

  // Filter roots by selected species (children keep full subtree)
  const filteredRoots = useMemo(() => {
    if (selectedSpecies === "all") return roots;
    return roots.filter((r) => r.species_id === selectedSpecies);
  }, [roots, selectedSpecies]);

  const kindLabel = kind === "rodent" ? "Roedores" : "Insectos";

  return (
    <PageShell
      title="Árbol Genealógico"
      subtitle={`Trazabilidad de origen entre lotes · ${kindLabel}`}
      icon={<GitFork className="h-6 w-6" />}
    >
      {/* Species filter */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">
          Filtrar por especie:
        </span>
        <Select value={selectedSpecies} onValueChange={setSelectedSpecies}>
          <SelectTrigger className="h-9 w-52 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las especies</SelectItem>
            {species.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tree */}
      {filteredRoots.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm">
          {lots.length === 0 ? "Sin lotes registrados." : "No hay lotes para la especie seleccionada."}
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredRoots.map((root) => (
            <TreeNode
              key={root.id}
              node={root}
              kind={kind}
              speciesMap={speciesMap}
              depth={0}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
