import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Rat, Plus, Edit2, Trash2, Split } from "lucide-react";
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
    males: 0, females: 0, unsexed: 0, notes: "", age_days: 0,
  });

  // Action states
  const [editingLot, setEditingLot] = useState<any | null>(null);
  const [editingMales, setEditingMales] = useState<number>(0);
  const [editingFemales, setEditingFemales] = useState<number>(0);
  const [editingUnsexed, setEditingUnsexed] = useState<number>(0);
  const [editingNotes, setEditingNotes] = useState<string>("");
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
  };

  const handleEditSubmit = async () => {
    if (!editingLot) return;
    const totalQty = editingMales + editingFemales + editingUnsexed;
    if (totalQty <= 0) {
      return toast.error("La población total del lote debe ser mayor a 0");
    }

    setSubmittingEdit(true);
    try {
      const { error } = await supabase.from("lots").update({
        males: editingMales,
        females: editingFemales,
        unsexed: editingUnsexed,
        notes: editingNotes,
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
    queryFn: async () => (await supabase.from("species").select("id,name").eq("kind", "rodent")).data ?? [],
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

  const submit = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (total <= 0) return toast.error("La población total debe ser mayor a 0");
    
    const today = new Date();
    today.setDate(today.getDate() - (Number(form.age_days) || 0));
    const started_at = today.toISOString().slice(0, 10);

    const { error } = await supabase.from("lots").insert({
      owner_id: u.user.id, kind: "rodent",
      lot_code: form.lot_code || null, lot_type: form.lot_type as any,
      species_id: form.species_id || null, line_id: form.line_id || null, box_id: form.box_id || null,
      males: form.males, females: form.females, unsexed: form.unsexed, notes: form.notes,
      started_at,
    });
    if (error) return toast.error(error.message.includes("TIER_LIMIT") ? "Límite del plan alcanzado." : error.message);
    toast.success("Lote creado");
    setOpen(false);
    setForm({ lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "", males: 0, females: 0, unsexed: 0, notes: "", age_days: 0 });
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
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nuevo lote</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Nuevo lote de roedores</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Código de lote</Label><Input value={form.lot_code} onChange={(e) => setForm({ ...form, lot_code: e.target.value })} placeholder="R-01" /></div>
                <div><Label>Tipo *</Label>
                  <Select value={form.lot_type} onValueChange={(v) => setForm({ ...form, lot_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breeder">Reproductor</SelectItem>
                      <SelectItem value="engorda">Engorda</SelectItem>
                      <SelectItem value="birth">Nacimiento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Especie</Label>
                  <Select value={form.species_id} onValueChange={(v) => setForm({ ...form, species_id: v, line_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(species ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Línea</Label>
                  <Select value={form.line_id} onValueChange={(v) => setForm({ ...form, line_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{linesForSpecies.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Caja</Label>
                  <Select value={form.box_id} onValueChange={(v) => setForm({ ...form, box_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(boxes ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Machos</Label><Input type="number" value={form.males} onChange={(e) => setForm({ ...form, males: +e.target.value })} /></div>
                <div><Label>Hembras</Label><Input type="number" value={form.females} onChange={(e) => setForm({ ...form, females: +e.target.value })} /></div>
                <div><Label>Sin sexar</Label><Input type="number" value={form.unsexed} onChange={(e) => setForm({ ...form, unsexed: +e.target.value })} /></div>
              </div>
              <div className="text-sm bg-accent/30 rounded p-2 text-center">
                Total población: <span className="font-bold text-emerald-glow">{total}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Edad actual en días</Label>
                  <Input type="number" min={0} value={form.age_days} onChange={(e) => setForm({ ...form, age_days: +e.target.value })} />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Si nació hace días, ingresa los días transcurridos.</p>
                </div>
                <div>
                  <Label>Notas</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-0" />
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Registrar lote</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-3">
        {(lots ?? []).map((l) => {
          const t = (l.males ?? 0) + (l.females ?? 0) + (l.unsexed ?? 0);
          const childNames = childrenNamesMap[l.id];
          const parentCode = (l as any).parent_lot_id ? lotCodeMap[(l as any).parent_lot_id] : null;
          const speciesName = speciesMap[l.species_id] ?? "";
          const lineName = linesMap[l.line_id] ?? "—";
          const boxCode = boxesMap[l.box_id] ?? "—";
          
          return (
            <Card key={l.id} className="p-4 border-border bg-card/60 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden transition-all hover:translate-y-[-2px] hover:border-primary/50 hover:shadow-lg">
              {/* Left Column: Code, Badges, Gender Population */}
              <div className="space-y-2 md:w-1/3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold tracking-tight text-foreground font-heading">
                    {l.lot_code ?? l.id.slice(0, 8)}
                  </span>
                  {parentCode && (
                    <Badge variant="outline" className="text-[9px] text-muted-foreground border-border">
                      sub-lote de {parentCode}
                    </Badge>
                  )}
                  {childNames && childNames.length > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="text-[9px] cursor-help">
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
                
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] capitalize font-medium px-2 py-0.5 rounded-md">
                    {l.lot_type === "breeder" ? "Reproductor" : l.lot_type === "engorda" ? "Engorda" : "Nacimiento"}
                  </Badge>
                  {speciesName && (
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground px-2 py-0.5 rounded-md">
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
                  {l.unsexed > 0 && <span>S/S: <strong className="text-foreground">{l.unsexed}</strong></span>}
                </div>
              </div>

              {/* Center-Left Column: Genetic Line & Box */}
              <div className="space-y-1 md:w-1/4">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Línea genética</div>
                <div className="text-sm font-semibold text-foreground">{lineName}</div>
                <div className="text-xs text-muted-foreground">Caja: <span className="font-medium text-foreground">{boxCode}</span></div>
              </div>

              {/* Center-Right Column: Current Stage & Individuals */}
              <div className="space-y-1 md:w-1/4">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Etapa / Info</div>
                <div className="text-sm font-semibold text-foreground">{t} individuos</div>
                <div className="text-xs text-muted-foreground">Iniciado: <span className="font-medium">{new Date(l.started_at).toLocaleDateString("es-MX")}</span></div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex items-center md:flex-col gap-2 shrink-0 md:items-end justify-between md:justify-center">
                {l.status === "active" && (
                  <Button size="sm" variant="secondary" className="h-8 text-[11px] gap-1 px-3" onClick={() => initSplit(l)}>
                    <Split className="h-3.5 w-3.5" /> Dividir
                  </Button>
                )}
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => initEdit(l)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeletingLot(l)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {(lots ?? []).length === 0 && (
          <Card className="p-10 text-center text-muted-foreground border-dashed">Sin lotes registrados.</Card>
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
