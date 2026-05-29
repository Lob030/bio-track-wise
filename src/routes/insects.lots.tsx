import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Bug, Plus, Scale, Layers, CheckCircle2, Edit2, Trash2, Split, Search, Download } from "lucide-react";
import { exportToCSV } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { type InsectRule } from "@/components/size-matrix";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { toast } from "sonner";

export const Route = createFileRoute("/insects/lots")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "",
    mass_grams: "", parent_lot_id: "", notes: "", age_days: 0, tags: "",
  });

  // Action states
  const [editingLot, setEditingLot] = useState<any | null>(null);
  const [editingMass, setEditingMass] = useState<string>("");
  const [editingNotes, setEditingNotes] = useState<string>("");
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [splittingLot, setSplittingLot] = useState<any | null>(null);
  const [sublotsCount, setSublotsCount] = useState<number>(2);
  const [sublots, setSublots] = useState<Array<{ lot_code: string; box_id: string; mass_grams: number }>>([]);
  const [submittingSplit, setSubmittingSplit] = useState(false);

  const [deletingLot, setDeletingLot] = useState<any | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  const [deathLot, setDeathLot] = useState<any | null>(null);
  const [deathGrams, setDeathGrams] = useState(0);
  const [deathCause, setDeathCause] = useState("desconocida");
  const [submittingDeath, setSubmittingDeath] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const initEdit = (lot: any) => {
    setEditingLot(lot);
    setEditingMass(lot.mass_grams ? String(lot.mass_grams) : "");
    setEditingNotes(lot.notes ?? "");
  };

  const handleEditSubmit = async () => {
    if (!editingLot) return;
    const mass = Number(editingMass);
    if (isNaN(mass) || mass <= 0) {
      return toast.error("El peso en gramos del lote debe ser mayor a 0");
    }

    setSubmittingEdit(true);
    try {
      const { error } = await supabase.from("lots").update({
        mass_grams: mass,
        notes: editingNotes,
      }).eq("id", editingLot.id);

      if (error) throw error;

      toast.success("Lote actualizado");
      setEditingLot(null);
      qc.invalidateQueries({ queryKey: ["lots", "insect"] });
      qc.invalidateQueries({ queryKey: ["lots-by-box"] });
    } catch (err: any) {
      toast.error(err.message ?? "Error al actualizar lote");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const initSplit = (lot: any) => {
    setSplittingLot(lot);
    setSublotsCount(2);
    setSublots([
      { lot_code: "", box_id: "", mass_grams: 0 },
      { lot_code: "", box_id: "", mass_grams: 0 }
    ]);
  };

  const handleCountChange = (count: number) => {
    setSublotsCount(count);
    setSublots(prev => {
      const next = [...prev];
      while (next.length < count) {
        next.push({ lot_code: "", box_id: "", mass_grams: 0 });
      }
      return next.slice(0, count);
    });
  };

  const updateSublot = (idx: number, patch: any) => {
    setSublots(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const sumMass = sublots.reduce((s, sl) => s + sl.mass_grams, 0);
  const remainingMass = (splittingLot?.mass_grams ?? 0) - sumMass;

  const handleSplitSubmit = async () => {
    if (!splittingLot) return;
    if (sumMass > (splittingLot.mass_grams ?? 0)) {
      return toast.error("La biomasa de los sublotes excede la disponible en el lote padre.");
    }
    if (sumMass <= 0) {
      return toast.error("El peso total de los sublotes debe ser mayor a 0 g");
    }
    for (let i = 0; i < sublots.length; i++) {
      const sl = sublots[i];
      if (sl.mass_grams > 0 && !sl.box_id) {
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
        if (sl.mass_grams <= 0) continue;
        
        const { data: inserted, error } = await supabase.from("lots").insert({
          owner_id: u.user.id,
          kind: "insect",
          lot_code: sl.lot_code.trim() || null,
          lot_type: splittingLot.lot_type,
          species_id: splittingLot.species_id,
          line_id: splittingLot.line_id,
          box_id: sl.box_id,
          parent_lot_id: splittingLot.id,
          mass_grams: sl.mass_grams,
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

      const nextMass = (splittingLot.mass_grams ?? 0) - sumMass;

      // Update parent lot mass + children_lot_ids
      const existingChildren = (splittingLot.children_lot_ids as string[] | null) ?? [];
      const { error: updateErr } = await supabase.from("lots").update({
        mass_grams: nextMass,
        status: nextMass <= 0 ? "finalizado" : "active",
        finalized_at: nextMass <= 0 ? new Date().toISOString() : null,
        children_lot_ids: [...existingChildren, ...newChildIds],
      } as any).eq("id", splittingLot.id);

      if (updateErr) {
        console.error("Update parent error:", updateErr);
        throw updateErr;
      }

      toast.success("Lote dividido con éxito");
      setSplittingLot(null);
      qc.invalidateQueries({ queryKey: ["lots", "insect"] });
      qc.invalidateQueries({ queryKey: ["lots-by-box"] });
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
      qc.invalidateQueries({ queryKey: ["lots", "insect"] });
      qc.invalidateQueries({ queryKey: ["lots-by-box"] });
    } catch (err: any) {
      toast.error(err.message ?? "Error al eliminar lote");
    } finally {
      setSubmittingDelete(false);
    }
  };

  const registerDeath = async () => {
    if (!deathLot || deathGrams <= 0) return;

    const currentMass = deathLot.mass_grams ?? 0;
    if (deathGrams > currentMass) {
      toast.error(`No puedes registrar ${deathGrams}g de bajas si el lote solo tiene ${currentMass}g`);
      return;
    }

    setSubmittingDeath(true);
    try {
      const newMass = currentMass - deathGrams;
      const { error } = await supabase
        .from("lots")
        .update({
          mass_grams: newMass,
          total_deaths: (deathLot.total_deaths ?? 0) + 1,
          status: newMass === 0 ? "finalizado" : "active",
          finalized_at: newMass === 0 ? new Date().toISOString() : null,
          notes: deathLot.notes
            ? `${deathLot.notes} | Baja ${new Date().toLocaleDateString("es-MX")}: ${deathGrams}g (${deathCause})`
            : `Baja ${new Date().toLocaleDateString("es-MX")}: ${deathGrams}g (${deathCause})`,
        })
        .eq("id", deathLot.id);

      if (error) throw error;

      toast.success(`Baja registrada: ${deathGrams}g (${deathCause})`);
      setDeathLot(null);
      setDeathGrams(0);
      setDeathCause("desconocida");
      qc.invalidateQueries({ queryKey: ["lots"] });
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmittingDeath(false);
    }
  };

  const { data: lots } = useQuery({
    queryKey: ["lots", "insect"],
    queryFn: async () => (await supabase.from("lots").select("*").eq("kind", "insect").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: species } = useQuery({
    queryKey: ["species", "insect", "min"],
    queryFn: async () => (await supabase.from("species").select("id,name,size_rules").eq("kind", "insect")).data ?? [],
  });
  const { data: lines } = useQuery({
    queryKey: ["lines", "insect", "min"],
    queryFn: async () => (await supabase.from("genetic_lines").select("id,name,species_id")).data ?? [],
  });
  const { data: boxes } = useQuery({
    queryKey: ["boxes", "insect", "min"],
    queryFn: async () => (await supabase.from("boxes").select("id,code").eq("kind", "insect")).data ?? [],
  });

  const linesForSp = useMemo(() => (lines ?? []).filter((l) => !form.species_id || l.species_id === form.species_id), [lines, form.species_id]);

  const lotCodeMap = useMemo(() => {
    const map: Record<string, string> = {};
    (lots ?? []).forEach((l) => {
      map[l.id] = l.lot_code ?? l.id.slice(0, 8);
    });
    return map;
  }, [lots]);

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

  const speciesDataMap = useMemo(() => {
    const map: Record<string, any> = {};
    (species ?? []).forEach((s) => { map[s.id] = s; });
    return map;
  }, [species]);

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

  const summary = useMemo(() => {
    const active = (lots ?? []).filter((l) => l.status === "active");
    const biomass = active.reduce((s, l) => s + (Number(l.mass_grams) || 0), 0);
    const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
    const finalizedMonth = (lots ?? []).filter((l) => l.status === "finalizado" && l.finalized_at && new Date(l.finalized_at) >= monthAgo).length;
    return { active: active.length, biomass, finalizedMonth };
  }, [lots]);

  const submit = async () => {
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSubmitting(false);
      return;
    }
    const grams = +form.mass_grams;
    if (!grams || grams <= 0) {
      setSubmitting(false);
      return toast.error("Peso en gramos del lote es obligatorio");
    }

    const today = new Date();
    today.setDate(today.getDate() - (Number(form.age_days) || 0));
    const started_at = today.toISOString().slice(0, 10);

    const parsedTags = form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [];

    const { error } = await supabase.from("lots").insert({
      owner_id: u.user.id, kind: "insect",
      lot_code: form.lot_code || null, lot_type: form.lot_type as any,
      species_id: form.species_id || null, line_id: form.line_id || null, box_id: form.box_id || null,
      parent_lot_id: form.parent_lot_id || null,
      mass_grams: grams, notes: form.notes,
      started_at,
      tags: parsedTags,
    });
    if (error) {
      setSubmitting(false);
      return toast.error(error.message.includes("TIER_LIMIT") ? "Límite del plan alcanzado." : error.message);
    }
    toast.success("Lote de insectos creado");
    setOpen(false);
    setForm({ lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "", mass_grams: "", parent_lot_id: "", notes: "", age_days: 0, tags: "" });
    qc.invalidateQueries({ queryKey: ["lots", "insect"] });
    qc.invalidateQueries({ queryKey: ["lots-by-box", "insect"] });
    setSubmitting(false);
  };

  return (
    <PageShell
      title="Lotes de Insectos"
      subtitle="Biomasa en gramos por lote, sin tracking individual de sexo."
      icon={<Bug className="h-6 w-6" />}
      actions={
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" className="gap-1.5 h-9"
            onClick={() => exportToCSV(
              `lotes-insectos-${new Date().toISOString().slice(0,10)}.csv`,
              ["Código", "Tipo", "Especie", "Línea", "Caja", "Biomasa (g)", "Bajas", "Inicio", "Estado"],
              (lots ?? []).map(l => [
                l.lot_code, l.lot_type, l.species_id, l.line_id, l.box_id,
                l.mass_grams,
                l.total_deaths ?? 0,
                l.started_at, l.status
              ])
            )}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="h-10 md:h-9 min-h-10 md:min-h-9 transition-all duration-200"><Plus className="h-5 md:h-4 w-5 md:w-4 mr-2" /> Nuevo lote</Button></DialogTrigger>
          <DialogContent className="max-w-3xl p-6 gap-6 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">Nuevo lote de insectos</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Código de lote</Label>
                  <Input className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.lot_code} onChange={(e) => setForm({ ...form, lot_code: e.target.value })} placeholder="Ej. I-01" />
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
                    <SelectContent>{linesForSp.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Peso en gramos del lote *</Label>
                  <Input type="number" step="0.1" className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.mass_grams} onChange={(e) => setForm({ ...form, mass_grams: e.target.value })} placeholder="Ej. 250" />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Edad actual en días</Label>
                  <Input type="number" min={0} className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.age_days} onChange={(e) => setForm({ ...form, age_days: +e.target.value })} />
                  <p className="text-[11px] text-muted-foreground mt-1">Si nació hace días, ingresa los días transcurridos.</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Lote padre (subdivisión)</Label>
                <Select value={form.parent_lot_id} onValueChange={(v) => setForm({ ...form, parent_lot_id: v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(lots ?? []).filter((l) => l.status === "active").map((l) => <SelectItem key={l.id} value={l.id}>{l.lot_code ?? l.id.slice(0, 8)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Etiquetas (opcional)</Label>
                <Input className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="reservado, prioridad, especial" />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Notas</Label>
                <Textarea className="min-h-20 focus-visible:ring-2 focus-visible:ring-primary" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Detalles u observaciones..." />
              </div>
            </div>
            <DialogFooter className="mt-2 border-t border-border/20 pt-4 flex gap-2">
              <Button variant="outline" className="h-10 transition-all duration-200" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="h-10 transition-all duration-200" onClick={submit} disabled={submitting}>
                {submitting ? "Registrando..." : "Registrar lote"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Lotes activos</div><div className="text-2xl font-bold mt-1 text-foreground">{summary.active}</div></div><Layers className="h-6 w-6 text-emerald-glow" /></div></Card>
        <Card className="p-4 border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Biomasa total</div><div className="text-2xl font-bold mt-1 text-foreground">{summary.biomass.toLocaleString("es-MX")} g</div></div><Scale className="h-6 w-6 text-amber-glow" /></div></Card>
        <Card className="p-4 border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Finalizados (mes)</div><div className="text-2xl font-bold mt-1 text-foreground">{summary.finalizedMonth}</div></div><CheckCircle2 className="h-6 w-6 text-info" /></div></Card>
      </div>

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
                  {(l.tags ?? []).length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(l.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-0 px-1 rounded">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
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
              </div>

              {/* Center-Left Column: Genetic Line & Box */}
              <div className="space-y-1 md:w-1/4">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Línea genética</div>
                <div className="text-sm font-semibold text-foreground">{lineName}</div>
                <div className="text-xs text-muted-foreground">Caja: <span className="font-semibold text-foreground">{boxCode}</span></div>
              </div>

              {/* Center-Right Column: Current Stage & Individuals */}
              <div className="space-y-1 md:w-1/4">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Biomasa / Info</div>
                <div className="text-sm font-bold text-foreground">{(+(l.mass_grams ?? 0)).toFixed(1)} g</div>
                <div className="text-xs text-muted-foreground">Iniciado: <span className="font-medium text-foreground/85">{new Date(l.started_at).toLocaleDateString("es-MX")}</span></div>
                {(l.total_deaths ?? 0) > 0 && (
                  <span className="text-xs text-rose-400/70 flex items-center gap-1">
                    💀 {l.total_deaths} evento{(l.total_deaths ?? 0) > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Right Column: Actions */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap md:justify-end">
                {l.status === "active" && (
                  <>
                    <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 px-3 font-medium border-border/60 hover:bg-accent hover:border-primary/50" onClick={() => initSplit(l)}>
                      <Split className="h-3.5 w-3.5" /> Dividir
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-9 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1.5 px-3"
                      onClick={() => { setDeathLot(l); setDeathGrams(0); setDeathCause("desconocida"); }}
                    >
                      💀 Baja
                    </Button>
                  </>
                )}
                <Button size="sm" variant="secondary" className="h-9 text-xs gap-1.5 px-3 font-medium" onClick={() => initEdit(l)}>
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </Button>
                <InsectProfitabilityDialog lot={l} species={l.species_id ? speciesDataMap[l.species_id] : null} />
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
            <div>
              <Label>Peso en gramos del lote</Label>
              <Input type="number" step="0.1" value={editingMass} onChange={(e) => setEditingMass(e.target.value)} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={editingNotes} onChange={(e) => setEditingNotes(e.target.value)} />
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
              <div className="font-semibold">Peso total del lote original: {splittingLot?.mass_grams} g</div>
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
                      <Input className="h-8 text-xs" value={sl.lot_code} onChange={(e) => updateSublot(idx, { lot_code: e.target.value })} placeholder={`${splittingLot?.lot_code ?? "I"}-${String.fromCharCode(65 + idx)}`} />
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
                    <div className="col-span-2">
                      <Label className="text-[10px]">Masa (gramos)</Label>
                      <Input type="number" step="0.1" min={0} className="h-8 text-xs" value={sl.mass_grams} onChange={(e) => updateSublot(idx, { mass_grams: +e.target.value })} />
                    </div>
                    <div className="col-span-2 text-right text-xs font-medium text-emerald-glow pt-2">
                      Subtotal: {sl.mass_grams} g
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-accent/40 rounded-md text-xs space-y-1">
              <div className="font-semibold text-emerald-glow flex justify-between">
                <span>Total asignado a sublotes:</span>
                <span>{sumMass.toFixed(1)} g</span>
              </div>
              <div className="text-muted-foreground flex justify-between">
                <span>Resta en lote padre:</span>
                <span className={remainingMass < 0 ? "text-destructive font-semibold" : ""}>
                  {remainingMass.toFixed(1)} g
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplittingLot(null)}>Cancelar</Button>
            <Button onClick={handleSplitSubmit} disabled={submittingSplit || remainingMass < 0}>
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

      {/* Death Dialog */}
      <Dialog open={!!deathLot} onOpenChange={(v) => !v && setDeathLot(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>💀 Registrar Baja — {deathLot?.lot_code ?? deathLot?.id.slice(0, 8)}</DialogTitle>
            <div className="text-xs text-muted-foreground mt-1">
              Biomasa actual: {deathLot?.mass_grams ?? 0}g
              · Bajas previas: {deathLot?.total_deaths ?? 0}
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Gramos perdidos *</Label>
              <Input
                type="number" min={1}
                value={deathGrams || ""}
                onChange={e => setDeathGrams(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="h-10"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Causa</Label>
              <Select value={deathCause} onValueChange={setDeathCause}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desconocida">Desconocida</SelectItem>
                  <SelectItem value="enfermedad">Enfermedad</SelectItem>
                  <SelectItem value="pelea">Pelea</SelectItem>
                  <SelectItem value="escapó">Escapó</SelectItem>
                  <SelectItem value="estrés">Estrés</SelectItem>
                  <SelectItem value="malas-condiciones">Malas condiciones</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeathLot(null)}>Cancelar</Button>
            <Button
              onClick={registerDeath}
              disabled={submittingDeath}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {submittingDeath ? "Registrando..." : "Confirmar baja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function InsectProfitabilityDialog({ lot, species }: { lot: any; species: any }) {
  const [open, setOpen] = useState(false);
  const rules: InsectRule[] = (species?.size_rules as InsectRule[]) ?? [];
  const massGrams = lot.mass_grams ?? 0;
  const ageToday = Math.floor((Date.now() - new Date(lot.started_at).getTime()) / 86400000);

  const projections = rules.map(rule => {
    const saleRevenue = (rule.price_mxn ?? 0) * massGrams;
    const daysUntil = Math.max(0, rule.min_days - ageToday);
    return {
      label: rule.label,
      revenue: saleRevenue,
      daysUntil,
      readyDate: new Date(Date.now() + daysUntil * 86400000).toLocaleDateString('es-MX'),
    };
  });

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-400 hover:text-emerald-300 gap-1" onClick={() => setOpen(true)}>
        💰 Rentabilidad
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>💰 Rentabilidad — {lot.lot_code ?? lot.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3 text-center bg-card/50">
                <p className="text-xs text-muted-foreground">Biomasa actual</p>
                <p className="text-xl font-bold">{massGrams.toLocaleString("es-MX")} g</p>
              </Card>
              <Card className="p-3 text-center bg-card/50">
                <p className="text-xs text-muted-foreground">Edad actual</p>
                <p className="text-xl font-bold">{ageToday}d</p>
              </Card>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Proyección de ingresos por etapa</h4>
              <div className="space-y-2">
                {projections.length > 0 ? (
                  projections.map(p => (
                    <div key={p.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div>
                        <p className="font-semibold text-sm">{p.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.daysUntil === 0 ? "✅ Listo ahora" : `📅 En ${p.daysUntil} días (${p.readyDate})`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-bold">${p.revenue.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">precio: ${((p.revenue / (massGrams || 1))).toFixed(2)}/g</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No hay reglas de tamaño configuradas para esta especie.</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
