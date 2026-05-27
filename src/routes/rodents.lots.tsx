import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Area, ReferenceLine } from "recharts";
import type { RodentRule } from "@/components/size-matrix";
import { Rat, Plus, Edit2, Trash2, Split, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

export const Route = createFileRoute("/rodents/lots")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "",
    males: 0, females: 0, unsexed: 0, notes: "", age_days: 0, tags: "",
  });

  // Action states
  const [editingLot, setEditingLot] = useState<any | null>(null);
  const [editingMales, setEditingMales] = useState<number>(0);
  const [editingFemales, setEditingFemales] = useState<number>(0);
  const [editingUnsexed, setEditingUnsexed] = useState<number>(0);
  const [editingNotes, setEditingNotes] = useState<string>("");
  const [editingTags, setEditingTags] = useState<string>("");
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [splittingLot, setSplittingLot] = useState<any | null>(null);
  const [sublotsCount, setSublotsCount] = useState<number>(2);
  const [sublots, setSublots] = useState<Array<{ lot_code: string; box_id: string; males: number; females: number; unsexed: number }>>([]);
  const [submittingSplit, setSubmittingSplit] = useState(false);

  const [deletingLot, setDeletingLot] = useState<any | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  const initEdit = (lot: any) => {
    setEditingLot(lot);
    setEditingMales(lot.males ?? 0);
    setEditingFemales(lot.females ?? 0);
    setEditingUnsexed(lot.unsexed ?? 0);
    setEditingNotes(lot.notes ?? "");
    setEditingTags((lot.tags ?? []).join(", "));
  };

  const handleEditSubmit = async () => {
    if (!editingLot) return;
    const totalQty = editingMales + editingFemales + editingUnsexed;
    if (totalQty <= 0) {
      return toast.error("La población total del lote debe ser mayor a 0");
    }

    setSubmittingEdit(true);
    try {
      const parsedEditTags = editingTags.split(",").map(t => t.trim()).filter(Boolean);
      const { error } = await supabase.from("lots").update({
        males: editingMales,
        females: editingFemales,
        unsexed: editingUnsexed,
        notes: editingNotes,
        tags: parsedEditTags,
      }).eq("id", editingLot.id);

      if (error) throw error;

      toast.success("Lote actualizado");
      setEditingLot(null);
      qc.invalidateQueries({ queryKey: ["lots", "rodent"] });
      qc.invalidateQueries({ queryKey: ["lots-by-box"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err: any) {
      console.error("Edit error:", err);
      toast.error(err.message ?? "Error al actualizar lote");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const initSplit = (lot: any) => {
    setSplittingLot(lot);
    setSublotsCount(2);
    setSublots([
      { lot_code: "", box_id: "", males: 0, females: 0, unsexed: 0 },
      { lot_code: "", box_id: "", males: 0, females: 0, unsexed: 0 }
    ]);
  };

  const handleCountChange = (count: number) => {
    setSublotsCount(count);
    setSublots(prev => {
      const next = [...prev];
      while (next.length < count) {
        next.push({ lot_code: "", box_id: "", males: 0, females: 0, unsexed: 0 });
      }
      return next.slice(0, count);
    });
  };

  const updateSublot = (idx: number, patch: any) => {
    setSublots(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const sumMales = sublots.reduce((s, sl) => s + sl.males, 0);
  const sumFemales = sublots.reduce((s, sl) => s + sl.females, 0);
  const sumUnsexed = sublots.reduce((s, sl) => s + sl.unsexed, 0);

  const remainingMales = (splittingLot?.males ?? 0) - sumMales;
  const remainingFemales = (splittingLot?.females ?? 0) - sumFemales;
  const remainingUnsexed = (splittingLot?.unsexed ?? 0) - sumUnsexed;

  const handleSplitSubmit = async () => {
    if (!splittingLot) return;
    if (sumMales > (splittingLot.males ?? 0) || sumFemales > (splittingLot.females ?? 0) || sumUnsexed > (splittingLot.unsexed ?? 0)) {
      return toast.error("Las cantidades de los sublotes exceden las disponibles en el lote padre.");
    }
    const totalSublots = sumMales + sumFemales + sumUnsexed;
    if (totalSublots <= 0) {
      return toast.error("La población de los sublotes debe ser mayor a 0");
    }
    for (let i = 0; i < sublots.length; i++) {
      const sl = sublots[i];
      const slTotal = sl.males + sl.females + sl.unsexed;
      if (slTotal > 0 && !sl.box_id) {
        return toast.error(`Selecciona una caja para el sublote ${i + 1}`);
      }
    }

    setSubmittingSplit(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        console.error("Split failed: No user found");
        toast.error("No user found");
        setSubmittingSplit(false);
        return;
      }

      const newChildIds: string[] = [];

      for (const sl of sublots) {
        const slTotal = sl.males + sl.females + sl.unsexed;
        if (slTotal <= 0) continue;
        
        const { data: inserted, error } = await supabase.from("lots").insert({
          owner_id: u.user.id,
          kind: "rodent",
          lot_code: sl.lot_code.trim() || null,
          lot_type: splittingLot.lot_type,
          species_id: splittingLot.species_id,
          line_id: splittingLot.line_id,
          box_id: sl.box_id,
          parent_lot_id: splittingLot.id,
          males: sl.males,
          females: sl.females,
          unsexed: sl.unsexed,
          started_at: splittingLot.started_at,
          notes: sl.lot_code.trim()
            ? `Sublote "${sl.lot_code.trim()}" de ${splittingLot.lot_code ?? splittingLot.id.slice(0, 8)}`
            : `Sublote creado de la división de ${splittingLot.lot_code ?? splittingLot.id.slice(0, 8)}`,
          status: "active",
        }).select("id").single();
        if (error) {
          console.error("Insert sublot error:", error);
          throw error;
        }
        if (inserted) newChildIds.push(inserted.id);
      }

      const nextMales = (splittingLot.males ?? 0) - sumMales;
      const nextFemales = (splittingLot.females ?? 0) - sumFemales;
      const nextUnsexed = (splittingLot.unsexed ?? 0) - sumUnsexed;
      const nextTotal = nextMales + nextFemales + nextUnsexed;

      // Update parent lot quantities + children_lot_ids
      const existingChildren = (splittingLot.children_lot_ids as string[] | null) ?? [];
      const { error: updateErr } = await supabase.from("lots").update({
        males: nextMales,
        females: nextFemales,
        unsexed: nextUnsexed,
        status: nextTotal <= 0 ? "finalizado" : "active",
        finalized_at: nextTotal <= 0 ? new Date().toISOString() : null,
        children_lot_ids: [...existingChildren, ...newChildIds],
      } as any).eq("id", splittingLot.id);

      if (updateErr) {
        console.error("Update parent error:", updateErr);
        throw updateErr;
      }

      toast.success("Lote dividido con éxito");
      setSplittingLot(null);
      qc.invalidateQueries({ queryKey: ["lots", "rodent"] });
      qc.invalidateQueries({ queryKey: ["lots-by-box"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err: any) {
      console.error("Split operation failed:", err);
      toast.error(err.message ?? "Error al dividir el lote");
    } finally {
      setSubmittingSplit(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deletingLot) return;
    setSubmittingDelete(true);
    try {
      const { error } = await supabase.from("lots").delete().eq("id", deletingLot.id);
      if (error) throw error;

      toast.success("Lote eliminado");
      setDeletingLot(null);
      qc.invalidateQueries({ queryKey: ["lots", "rodent"] });
      qc.invalidateQueries({ queryKey: ["lots-by-box"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error(err.message ?? "Error al eliminar lote");
    } finally {
      setSubmittingDelete(false);
    }
  };

  const { data: lots } = useQuery({
    queryKey: ["lots", "rodent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("*").eq("kind", "rodent").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: species } = useQuery({
    queryKey: ["species", "rodent", "min"],
    queryFn: async () => (await supabase.from("species").select("id,name,size_rules").eq("kind", "rodent")).data ?? [],
  });
  const { data: lines } = useQuery({
    queryKey: ["lines", "rodent", "min"],
    queryFn: async () => (await supabase.from("genetic_lines").select("id,name,species_id")).data ?? [],
  });
  const { data: boxes } = useQuery({
    queryKey: ["boxes", "rodent", "min"],
    queryFn: async () => (await supabase.from("boxes").select("id,code").eq("kind", "rodent")).data ?? [],
  });

  const total = form.males + form.females + form.unsexed;
  const linesForSpecies = useMemo(() => (lines ?? []).filter((l) => !form.species_id || l.species_id === form.species_id), [lines, form.species_id]);

  // Build a lookup for parent lot codes
  const lotCodeMap = useMemo(() => {
    const map: Record<string, string> = {};
    (lots ?? []).forEach((l) => { map[l.id] = l.lot_code ?? l.id.slice(0, 8); });
    return map;
  }, [lots]);

  // Build children names lookup
  const childrenNamesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    (lots ?? []).forEach((l) => {
      const children = (l as any).children_lot_ids as string[] | null;
      if (children && children.length > 0) {
        map[l.id] = children.map((cid) => lotCodeMap[cid] ?? cid.slice(0, 8));
      }
    });
    return map;
  }, [lots, lotCodeMap]);

  const speciesMap = useMemo(() => {
    const map: Record<string, string> = {};
    (species ?? []).forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [species]);

  const speciesDataMap = useMemo(() => {
    const map: Record<string, any> = {};
    (species ?? []).forEach((s) => { map[s.id] = s; });
    return map;
  }, [species]);

  const linesMap = useMemo(() => {
    const map: Record<string, string> = {};
    (lines ?? []).forEach((ln) => { map[ln.id] = ln.name; });
    return map;
  }, [lines]);

  const boxesMap = useMemo(() => {
    const map: Record<string, string> = {};
    (boxes ?? []).forEach((bx) => { map[bx.id] = bx.code; });
    return map;
  }, [boxes]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    (lots ?? []).forEach(l => (l.tags ?? []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [lots]);

  const [filterTag, setFilterTag] = useState<string>("all");

  const filteredLots = useMemo(() =>
    filterTag === "all"
      ? (lots ?? [])
      : (lots ?? []).filter(l => (l.tags ?? []).includes(filterTag)),
    [lots, filterTag]
  );

  const [searchLot, setSearchLot] = useState<string>("");

  const searchedLots = useMemo(() => {
    if (!searchLot.trim()) return filteredLots ?? [];
    const q = searchLot.trim().toLowerCase();
    return (filteredLots ?? []).filter(lot => lot.lot_code?.toLowerCase().startsWith(q));
  }, [filteredLots, searchLot]);

  const submit = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (total <= 0) return toast.error("La población total debe ser mayor a 0");
    
    const today = new Date();
    today.setDate(today.getDate() - (Number(form.age_days) || 0));
    const started_at = today.toISOString().slice(0, 10);

    const parsedTags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const { error } = await supabase.from("lots").insert({
      owner_id: u.user.id, kind: "rodent",
      lot_code: form.lot_code || null, lot_type: form.lot_type as any,
      species_id: form.species_id || null, line_id: form.line_id || null, box_id: form.box_id || null,
      males: form.males, females: form.females, unsexed: form.unsexed, notes: form.notes,
      started_at,
      tags: parsedTags,
    });
    if (error) return toast.error(error.message.includes("TIER_LIMIT") ? "Límite del plan alcanzado." : error.message);
    toast.success("Lote creado");
    setOpen(false);
    setForm({ lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "", males: 0, females: 0, unsexed: 0, notes: "", age_days: 0, tags: "" });
    qc.invalidateQueries({ queryKey: ["lots", "rodent"] });
    qc.invalidateQueries({ queryKey: ["lots-by-box", "rodent"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <PageShell
      title="Lotes de Roedores"
      subtitle="Control individual de machos, hembras y sin sexar por lote."
      icon={<Rat className="h-6 w-6" />}
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="h-10 md:h-9 min-h-10 md:min-h-9 transition-all duration-200"><Plus className="h-5 md:h-4 w-5 md:w-4 mr-2" /> Nuevo lote</Button></DialogTrigger>
          <DialogContent className="max-w-3xl p-6 gap-6 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">Nuevo lote de roedores</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Código de lote</Label>
                  <Input className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.lot_code} onChange={(e) => setForm({ ...form, lot_code: e.target.value })} placeholder="Ej. R-01" />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Tipo *</Label>
                  <Select value={form.lot_type} onValueChange={(v) => setForm({ ...form, lot_type: v })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breeder">Reproductor</SelectItem>
                      <SelectItem value="engorda">Engorda</SelectItem>
                      <SelectItem value="birth">Nacimiento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Especie</Label>
                  <Select value={form.species_id} onValueChange={(v) => setForm({ ...form, species_id: v, line_id: "" })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(species ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Línea genética</Label>
                  <Select value={form.line_id} onValueChange={(v) => setForm({ ...form, line_id: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{linesForSpecies.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Caja</Label>
                  <Select value={form.box_id} onValueChange={(v) => setForm({ ...form, box_id: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(boxes ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Machos</Label>
                  <Input type="number" className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.males} onChange={(e) => setForm({ ...form, males: +e.target.value })} />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Hembras</Label>
                  <Input type="number" className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.females} onChange={(e) => setForm({ ...form, females: +e.target.value })} />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Sin sexar</Label>
                  <Input type="number" className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.unsexed} onChange={(e) => setForm({ ...form, unsexed: +e.target.value })} />
                </div>
              </div>
              <div className="text-sm bg-accent/30 rounded px-4 py-2 text-center font-semibold text-foreground/90">
                Total población: <span className="font-bold text-emerald-glow ml-1">{total}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Edad actual en días</Label>
                  <Input type="number" min={0} className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.age_days} onChange={(e) => setForm({ ...form, age_days: +e.target.value })} />
                  <p className="text-[11px] text-muted-foreground mt-1">Si nació hace días, ingresa los días transcurridos.</p>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Notas</Label>
                  <Input className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ej. Lote inicial" />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Etiquetas (opcional)</Label>
                <Input className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="reservado, prioridad, especial" />
              </div>
            </div>
            <DialogFooter className="mt-2 border-t border-border/20 pt-4 flex gap-2">
              <Button variant="outline" className="h-10 transition-all duration-200" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="h-10 transition-all duration-200" onClick={submit}>Registrar lote</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lote por código..."
            value={searchLot}
            onChange={(e) => setSearchLot(e.target.value)}
            className="pl-9 h-8 text-xs focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Filtrar por etiqueta:</Label>
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      
      {searchLot && (
        <p className="text-xs text-muted-foreground mb-3 ml-1">
          {searchedLots.length} de {(filteredLots ?? []).length} lotes
        </p>
      )}

      <div className="space-y-3">
        {searchedLots.map((l) => {
          const t = (l.males ?? 0) + (l.females ?? 0) + (l.unsexed ?? 0);
          const childNames = childrenNamesMap[l.id];
          const parentCode = (l as any).parent_lot_id ? lotCodeMap[(l as any).parent_lot_id] : null;
          const speciesName = l.species_id ? speciesMap[l.species_id] ?? "" : "";
          const lineName = l.line_id ? linesMap[l.line_id] ?? "—" : "—";
          const boxCode = l.box_id ? boxesMap[l.box_id] ?? "—" : "—";
          
          return (
            <Card key={l.id} className="p-4 border-border/50 bg-gradient-to-br from-card to-card/40 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden transition-all duration-200 hover:translate-y-[-2px] hover:border-primary/50 hover:shadow-lg shadow-sm hover:shadow-md">
              {/* Left Column: Code, Badges, Gender Population */}
              <div className="space-y-2 md:w-1/3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold tracking-tight text-foreground font-heading">
                    {l.lot_code ?? l.id.slice(0, 8)}
                  </span>
                  {parentCode && (
                    <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/40 bg-accent/10">
                      sub-lote de {parentCode}
                    </Badge>
                  )}
                  {childNames && childNames.length > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="text-[9px] cursor-help bg-accent/20 text-foreground">
                            {childNames.length} sublotes
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Sublotes: {childNames.join(", ")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                
                {(l.tags ?? []).length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {(l.tags ?? []).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 rounded-sm">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] capitalize font-medium px-2 py-0.5 rounded-md bg-accent/30 text-foreground">
                    {l.lot_type === "breeder" ? "Reproductor" : l.lot_type === "engorda" ? "Engorda" : "Nacimiento"}
                  </Badge>
                  {speciesName && (
                    <Badge variant="outline" className="text-[10px] border-border/40 text-muted-foreground px-2 py-0.5 rounded-md">
                      {speciesName}
                    </Badge>
                  )}
                  <Badge className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    l.status === "active" 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" 
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {l.status === "active" ? "Activo" : "Finalizado"}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground flex gap-3 mt-1 flex-wrap">
                  <span>♀ Hembras: <strong className="text-foreground">{l.females ?? 0}</strong></span>
                  <span>♂ Machos: <strong className="text-foreground">{l.males ?? 0}</strong></span>
                  {(l.unsexed ?? 0) > 0 && <span>S/S: <strong className="text-foreground">{l.unsexed}</strong></span>}
                </div>
              </div>

              {/* Center-Left Column: Genetic Line & Box */}
              <div className="space-y-1 md:w-1/4">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Línea genética</div>
                <div className="text-sm font-semibold text-foreground">{lineName}</div>
                <div className="text-xs text-muted-foreground">Caja: <span className="font-semibold text-foreground">{boxCode}</span></div>
              </div>

              {/* Center-Right Column: Current Stage & Individuals */}
              <div className="space-y-1 md:w-1/4">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Etapa / Info</div>
                <div className="text-sm font-bold text-foreground">{t} individuos</div>
                <div className="text-xs text-muted-foreground">Iniciado: <span className="font-medium text-foreground/85">{new Date(l.started_at).toLocaleDateString("es-MX")}</span></div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap md:justify-end">
                <ProfitabilityDialog lot={l} species={l.species_id ? speciesDataMap[l.species_id] : null} />
                <GrowthCurveDialog lot={l} species={l.species_id ? speciesDataMap[l.species_id] : null} />
                {l.status === "active" && (
                  <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 px-3 font-medium border-border/60 hover:bg-accent hover:border-primary/50" onClick={() => initSplit(l)}>
                    <Split className="h-3.5 w-3.5" /> Dividir
                  </Button>
                )}
                <Button size="sm" variant="secondary" className="h-9 text-xs gap-1.5 px-3 font-medium" onClick={() => initEdit(l)}>
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 px-3 font-medium text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60" onClick={() => setDeletingLot(l)}>
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </div>
            </Card>
          );
        })}
        {searchedLots.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm">{filterTag !== "all" || searchLot ? "No hay lotes con estos criterios." : "Sin lotes registrados."}</Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingLot} onOpenChange={(v) => !v && setEditingLot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar lote {editingLot?.lot_code ?? editingLot?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Machos</Label>
                <Input type="number" value={editingMales} onChange={(e) => setEditingMales(+e.target.value)} />
              </div>
              <div>
                <Label>Hembras</Label>
                <Input type="number" value={editingFemales} onChange={(e) => setEditingFemales(+e.target.value)} />
              </div>
              <div>
                <Label>Sin sexar</Label>
                <Input type="number" value={editingUnsexed} onChange={(e) => setEditingUnsexed(+e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={editingNotes} onChange={(e) => setEditingNotes(e.target.value)} />
            </div>
            <div>
              <Label>Etiquetas</Label>
              <Input value={editingTags} onChange={(e) => setEditingTags(e.target.value)} placeholder="reservado, prioridad, especial" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLot(null)}>Cancelar</Button>
            <Button onClick={handleEditSubmit} disabled={submittingEdit}>
              {submittingEdit ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split Dialog */}
      <Dialog open={!!splittingLot} onOpenChange={(v) => !v && setSplittingLot(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dividir lote {splittingLot?.lot_code ?? splittingLot?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-accent/30 rounded-md text-xs space-y-1">
              <div className="font-semibold">Población total del lote original: {(splittingLot?.males ?? 0) + (splittingLot?.females ?? 0) + (splittingLot?.unsexed ?? 0)}</div>
              <div className="text-muted-foreground flex gap-4">
                <span>Machos: {splittingLot?.males ?? 0}</span>
                <span>Hembras: {splittingLot?.females ?? 0}</span>
                <span>Sin sexar: {splittingLot?.unsexed ?? 0}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Label className="whitespace-nowrap">¿Cuántos sublotes deseas crear?</Label>
              <Select value={String(sublotsCount)} onValueChange={(v) => handleCountChange(Number(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Distribución de los sublotes</Label>
              {sublots.map((sl, idx) => (
                <div key={idx} className="p-3 border border-border rounded-md bg-card/40 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">Sublote {idx + 1}</div>
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <div className="col-span-2">
                      <Label className="text-[10px]">Nombre del sublote</Label>
                      <Input className="h-8 text-xs" value={sl.lot_code} onChange={(e) => updateSublot(idx, { lot_code: e.target.value })} placeholder={`${splittingLot?.lot_code ?? "R"}-${String.fromCharCode(65 + idx)}`} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px]">Caja Destino</Label>
                      <Select value={sl.box_id} onValueChange={(v) => updateSublot(idx, { box_id: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Seleccionar caja" />
                        </SelectTrigger>
                        <SelectContent>
                          {(boxes ?? []).map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <div>
                      <Label className="text-[10px]">Machos</Label>
                      <Input type="number" min={0} className="h-8 text-xs" value={sl.males} onChange={(e) => updateSublot(idx, { males: +e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Hembras</Label>
                      <Input type="number" min={0} className="h-8 text-xs" value={sl.females} onChange={(e) => updateSublot(idx, { females: +e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Sin sexar</Label>
                      <Input type="number" min={0} className="h-8 text-xs" value={sl.unsexed} onChange={(e) => updateSublot(idx, { unsexed: +e.target.value })} />
                    </div>
                    <div className="text-right text-xs font-medium text-emerald-glow pt-2">
                      Subtotal: {sl.males + sl.females + sl.unsexed} ind.
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-accent/40 rounded-md text-xs space-y-1">
              <div className="font-semibold text-emerald-glow flex justify-between">
                <span>Total asignado a sublotes:</span>
                <span>{sumMales + sumFemales + sumUnsexed} ind.</span>
              </div>
              <div className="text-muted-foreground flex justify-between">
                <span>Resta en lote padre:</span>
                <span className={remainingMales < 0 || remainingFemales < 0 || remainingUnsexed < 0 ? "text-destructive font-semibold" : ""}>
                  M: {remainingMales} · H: {remainingFemales} · S/S: {remainingUnsexed} ({remainingMales + remainingFemales + remainingUnsexed} ind.)
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplittingLot(null)}>Cancelar</Button>
            <Button onClick={handleSplitSubmit} disabled={submittingSplit || remainingMales < 0 || remainingFemales < 0 || remainingUnsexed < 0}>
              {submittingSplit ? "Dividiendo..." : "Crear Sublotes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingLot} onOpenChange={(v) => !v && setDeletingLot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro de que desea eliminar este lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el lote {deletingLot?.lot_code ?? deletingLot?.id.slice(0, 8)} de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSubmit} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function ProfitabilityDialog({ lot, species }: { lot: any; species: any }) {
  const [open, setOpen] = useState(false);
  const FEED_COST_PER_GRAM = 0.05;

  const rules: RodentRule[] = (species?.size_rules as RodentRule[]) ?? [];
  const totalAnimals = (lot.males ?? 0) + (lot.females ?? 0) + (lot.unsexed ?? 0);
  const ageToday = Math.floor((Date.now() - new Date(lot.started_at).getTime()) / 86400000);

  const dailyFeedNow = (() => {
    const rule = rules.find(r => ageToday >= r.min_days && ageToday <= r.max_days);
    return (rule?.daily_feed_g ?? 0) * totalAnimals;
  })();

  const totalFeedCost = (() => {
    let cost = 0;
    for (let day = 0; day <= ageToday; day++) {
      const rule = rules.find(r => day >= r.min_days && day <= r.max_days);
      cost += (rule?.daily_feed_g ?? 0) * totalAnimals * FEED_COST_PER_GRAM;
    }
    return cost;
  })();

  const projections = rules.map(rule => {
    const saleRevenue = (rule.price_mxn ?? 0) * totalAnimals;
    const daysUntil = Math.max(0, rule.min_days - ageToday);
    let feedCostAtSize = 0;
    for (let day = 0; day <= rule.min_days; day++) {
      const rx = rules.find(rr => day >= rr.min_days && day <= rr.max_days);
      feedCostAtSize += (rx?.daily_feed_g ?? 0) * totalAnimals * FEED_COST_PER_GRAM;
    }
    return {
      label: rule.label,
      revenue: saleRevenue,
      feedCost: feedCostAtSize,
      margin: saleRevenue - feedCostAtSize,
      marginPct: saleRevenue > 0 ? ((saleRevenue - feedCostAtSize) / saleRevenue * 100) : 0,
      daysUntil,
      readyDate: new Date(Date.now() + daysUntil * 86400000).toLocaleDateString('es-MX'),
    };
  });

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-400 hover:text-emerald-300" onClick={() => setOpen(true)}>
        💰 Rentabilidad
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>💰 Rentabilidad — {lot.lot_code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Animales</p>
                <p className="text-xl font-bold">{totalAnimals}</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Edad actual</p>
                <p className="text-xl font-bold">{ageToday}d</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Costo alim. acum.</p>
                <p className="text-xl font-bold text-amber-400">${totalFeedCost.toFixed(2)}</p>
              </Card>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Proyección por talla</h4>
              <div className="space-y-2">
                {projections.map(p => (
                  <div key={p.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div>
                      <p className="font-semibold text-sm">{p.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.daysUntil === 0 ? "✅ Listo ahora" : `📅 En ${p.daysUntil} días (${p.readyDate})`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-emerald-400 font-bold">${p.revenue.toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">Margen: {p.marginPct.toFixed(0)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-sm text-amber-300">Consumo hoy</span>
              <span className="font-bold text-amber-300">{dailyFeedNow.toFixed(1)}g — ${(dailyFeedNow * FEED_COST_PER_GRAM).toFixed(2)}/día</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GrowthCurveDialog({ lot, species }: { lot: any; species: any }) {
  const [open, setOpen] = useState(false);
  const rules: RodentRule[] = (species?.size_rules as RodentRule[]) ?? [];
  const ageToday = Math.floor((Date.now() - new Date(lot.started_at).getTime()) / 86400000);
  const maxDay = Math.max(...rules.map(r => r.max_days), ageToday) + 3;

  const chartData = useMemo(() => {
    return Array.from({ length: maxDay + 1 }, (_, day) => {
      const rule = rules.find(r => day >= r.min_days && day <= r.max_days);
      return {
        day,
        pesoMax: rule?.max_weight_g ?? null,
        pesoMin: rule?.min_weight_g ?? null,
        talla: rule?.label ?? null,
        esHoy: day === ageToday,
      };
    });
  }, [rules, ageToday, maxDay]);

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs text-cyan-400 hover:text-cyan-300" onClick={() => setOpen(true)}>
        📈 Curva
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>📈 Curva de Crecimiento — {lot.lot_code}</DialogTitle>
            <p className="text-xs text-muted-foreground">Edad actual: {ageToday} días</p>
          </DialogHeader>

          <div className="flex gap-2 flex-wrap">
            {rules.map(rule => {
              const isActive = ageToday >= rule.min_days && ageToday <= rule.max_days;
              return (
                <Badge key={rule.label} variant={isActive ? "default" : "outline"}
                  className={isActive ? "bg-primary text-primary-foreground" : ""}>
                  {rule.label}: día {rule.min_days}–{rule.max_days}
                </Badge>
              );
            })}
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-border)" />
              <XAxis dataKey="day" label={{ value: "Días", position: "insideBottom", offset: -8, fontSize: 11 }} tick={{ fontSize: 10 }} />
              <YAxis label={{ value: "Peso (g)", angle: -90, position: "insideLeft", fontSize: 11 }} tick={{ fontSize: 10 }} />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-surface border border-border rounded-lg p-2 text-xs shadow-lg">
                      <p className="font-bold">Día {d.day}{d.talla ? ` — ${d.talla}` : ""}</p>
                      {d.pesoMin != null && <p>Peso: {d.pesoMin}–{d.pesoMax}g</p>}
                      {d.esHoy && <p className="text-primary font-bold">← HOY</p>}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="pesoMax" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="pesoMin" stroke="var(--color-accent)" fill="transparent" strokeWidth={1} strokeDasharray="4 2" dot={false} />
              <ReferenceLine x={ageToday} stroke="var(--color-warning)" strokeWidth={2}
                label={{ value: "HOY", fill: "var(--color-warning)", fontSize: 10, position: "top" }} />
              {rules.map(r => (
                <ReferenceLine key={r.label} x={r.min_days} stroke="var(--color-surface-border)" strokeDasharray="3 3"
                  label={{ value: r.label, fill: "var(--color-text-muted)", fontSize: 9, position: "top" }} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>

          {(() => {
            const nextRule = rules.find(r => r.min_days > ageToday);
            if (!nextRule) return (
              <p className="text-xs text-muted-foreground text-center py-2">Este lote está en su talla final.</p>
            );
            const daysLeft = nextRule.min_days - ageToday;
            const eta = new Date(Date.now() + daysLeft * 86400000).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
                <p className="text-sm font-medium">
                  <span className="font-bold text-primary">{daysLeft} días</span> para alcanzar talla
                  <span className="font-bold text-primary ml-1">{nextRule.label}</span>
                </p>
                <p className="text-xs text-muted-foreground capitalize">{eta}</p>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

