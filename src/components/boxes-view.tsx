import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes as BoxIcon, Plus, Trash2, Download, Upload, Utensils, Edit2, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { downloadCSV, pickCSVFile } from "@/lib/csv";
import type { RodentRule } from "@/components/size-matrix";
import { toUserFriendlyError } from "@/lib/errors";

type Kind = "rodent" | "insect";

// usage stored in location text suffix as "Room/Rack · Usage"
function packLocation(roomRack: string, usage: string) {
  return usage ? `${roomRack} · ${usage}` : roomRack;
}
function unpackLocation(loc: string | null) {
  if (!loc) return { roomRack: "", usage: "" };
  const parts = loc.split(" · ");
  return { roomRack: parts[0] ?? "", usage: parts[1] ?? "" };
}

function PopoverOpenableBadge({ occupants, kind, qc, boxes }: { occupants: any[]; kind: Kind; qc: any; boxes: any[] }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<any | null>(null);
  const [males, setMales] = useState<number>(0);
  const [females, setFemales] = useState<number>(0);
  const [unsexed, setUnsexed] = useState<number>(0);
  const [massGrams, setMassGrams] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Split states
  const [splittingLot, setSplittingLot] = useState<any | null>(null);
  const [sublotsCount, setSublotsCount] = useState<number>(2);
  const [sublots, setSublots] = useState<Array<{ lot_code: string; box_id: string; males: number; females: number; unsexed: number; mass_grams: number }>>([]);
  const [submittingSplit, setSubmittingSplit] = useState(false);

  // Delete states
  const [deletingLot, setDeletingLot] = useState<any | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  const startEdit = (lot: any) => {
    setPopoverOpen(false);
    setEditingLot(lot);
    setMales(lot.males ?? 0);
    setFemales(lot.females ?? 0);
    setUnsexed(lot.unsexed ?? 0);
    setMassGrams(lot.mass_grams ? String(lot.mass_grams) : "");
    setNotes(lot.notes ?? "");
  };

  const handleSave = async () => {
    if (!editingLot) return;
    setSaving(true);
    try {
      const updateData: any = {
        notes,
      };
      if (kind === "rodent") {
        updateData.males = Number(males) || 0;
        updateData.females = Number(females) || 0;
        updateData.unsexed = Number(unsexed) || 0;
      } else {
        updateData.mass_grams = Number(massGrams) || 0;
      }

      const { error } = await supabase
        .from("lots")
        .update(updateData)
        .eq("id", editingLot.id);

      if (error) throw error;

      toast.success("Lote actualizado");
      setEditingLot(null);
      qc.invalidateQueries({ queryKey: ["lots-by-box", kind] });
      qc.invalidateQueries({ queryKey: ["lots", kind] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err: any) {
      toast.error(toUserFriendlyError(err, "Error al actualizar lote"));
    } finally {
      setSaving(false);
    }
  };

  const initSplit = (lot: any) => {
    setPopoverOpen(false);
    setSplittingLot(lot);
    setSublotsCount(2);
    setSublots([
      { lot_code: "", box_id: "", males: 0, females: 0, unsexed: 0, mass_grams: 0 },
      { lot_code: "", box_id: "", males: 0, females: 0, unsexed: 0, mass_grams: 0 }
    ]);
  };

  const handleCountChange = (count: number) => {
    setSublotsCount(count);
    setSublots(prev => {
      const next = [...prev];
      while (next.length < count) {
        next.push({ lot_code: "", box_id: "", males: 0, females: 0, unsexed: 0, mass_grams: 0 });
      }
      return next.slice(0, count);
    });
  };

  const updateSublot = (idx: number, patch: any) => {
    setSublots(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const sumMales = sublots.reduce((s, sl) => s + (sl.males ?? 0), 0);
  const sumFemales = sublots.reduce((s, sl) => s + (sl.females ?? 0), 0);
  const sumUnsexed = sublots.reduce((s, sl) => s + (sl.unsexed ?? 0), 0);
  const sumMass = sublots.reduce((s, sl) => s + (sl.mass_grams ?? 0), 0);

  const remainingMales = (splittingLot?.males ?? 0) - sumMales;
  const remainingFemales = (splittingLot?.females ?? 0) - sumFemales;
  const remainingUnsexed = (splittingLot?.unsexed ?? 0) - sumUnsexed;
  const remainingMass = (splittingLot?.mass_grams ?? 0) - sumMass;

  const handleSplitSubmit = async () => {
    if (!splittingLot) return;
    setSubmittingSplit(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        console.error("Split failed: No user found");
        toast.error("No user found");
        setSubmittingSplit(false);
        return;
      }

      if (kind === "rodent") {
        if (sumMales > (splittingLot.males ?? 0) || sumFemales > (splittingLot.females ?? 0) || sumUnsexed > (splittingLot.unsexed ?? 0)) {
          throw new Error("Las cantidades exceden las disponibles en el lote padre.");
        }
        const totalSublots = sumMales + sumFemales + sumUnsexed;
        if (totalSublots <= 0) throw new Error("La población debe ser mayor a 0.");
        
        for (let i = 0; i < sublots.length; i++) {
          const sl = sublots[i];
          const totalSl = (sl.males ?? 0) + (sl.females ?? 0) + (sl.unsexed ?? 0);
          if (totalSl > 0 && !sl.box_id) throw new Error(`Selecciona una caja para el sublote ${i + 1}`);
        }

        const newChildIds: string[] = [];

        for (const sl of sublots) {
          const totalSl = (sl.males ?? 0) + (sl.females ?? 0) + (sl.unsexed ?? 0);
          if (totalSl <= 0) continue;
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

      } else {
        if (sumMass > (splittingLot.mass_grams ?? 0)) {
          throw new Error("La biomasa excede la disponible en el lote padre.");
        }
        if (sumMass <= 0) throw new Error("El peso debe ser mayor a 0 g.");

        for (let i = 0; i < sublots.length; i++) {
          const sl = sublots[i];
          if (sl.mass_grams > 0 && !sl.box_id) throw new Error(`Selecciona una caja para el sublote ${i + 1}`);
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
      }

      toast.success("Lote dividido con éxito");
      setSplittingLot(null);
      qc.invalidateQueries({ queryKey: ["lots-by-box", kind] });
      qc.invalidateQueries({ queryKey: ["lots", kind] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err: any) {
      console.error("Split operation failed:", err);
      toast.error(toUserFriendlyError(err, "Error al dividir lote"));
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
      qc.invalidateQueries({ queryKey: ["lots-by-box", kind] });
      qc.invalidateQueries({ queryKey: ["lots", kind] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err: any) {
      toast.error(toUserFriendlyError(err, "Error al eliminar lote"));
    } finally {
      setSubmittingDelete(false);
    }
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Badge className="text-[10px] bg-warning text-warning-foreground cursor-pointer hover:bg-warning/80">
            Ocupada · {occupants.length} lote{occupants.length > 1 ? "s" : ""}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 bg-slate-900/90 backdrop-blur-md border border-slate-800/80">
          <div className="space-y-3">
            <h4 className="font-semibold text-xs text-muted-foreground border-b border-slate-800 pb-1.5">
              Lotes en esta caja
            </h4>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {occupants.map((lot) => {
                const totalQty = (lot.males ?? 0) + (lot.females ?? 0) + (lot.unsexed ?? 0);
                return (
                  <div key={lot.id} className="p-2 border-b border-slate-800/40 last:border-b-0 space-y-2 hover:bg-accent/10 transition-colors rounded">
                    <div className="text-xs">
                      <div className="font-mono font-bold text-foreground">
                        {lot.lot_code ?? lot.id.slice(0, 8)}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex gap-1.5 mt-0.5">
                        <span className="capitalize">{lot.lot_type}</span>
                        <span>·</span>
                        <span>
                          {kind === "rodent"
                            ? `${totalQty} ind. (M:${lot.males ?? 0} F:${lot.females ?? 0})`
                            : `${Number(lot.mass_grams ?? 0).toFixed(1)} g`}
                        </span>
                      </div>
                    </div>
                    {/* Botones de acción */}
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/40">
                      {lot.status === "active" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 font-medium" onClick={() => initSplit(lot)}>
                          Dividir
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" className="h-7 text-xs px-2.5 font-medium" onClick={() => startEdit(lot)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 font-medium text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60" onClick={() => { setPopoverOpen(false); setDeletingLot(lot); }}>
                        Eliminar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={!!editingLot} onOpenChange={(open) => !open && setEditingLot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Lote {editingLot?.lot_code ?? editingLot?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {kind === "rodent" ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Machos</Label>
                  <Input type="number" value={males} onChange={(e) => setMales(+e.target.value)} />
                </div>
                <div>
                  <Label>Hembras</Label>
                  <Input type="number" value={females} onChange={(e) => setFemales(+e.target.value)} />
                </div>
                <div>
                  <Label>Sin sexar</Label>
                  <Input type="number" value={unsexed} onChange={(e) => setUnsexed(+e.target.value)} />
                </div>
              </div>
            ) : (
              <div>
                <Label>Masa (gramos)</Label>
                <Input type="number" step="0.1" value={massGrams} onChange={(e) => setMassGrams(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas del lote" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLot(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar Cambios"}
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
              <div className="font-semibold">
                {kind === "rodent"
                  ? `Población total del lote original: ${splittingLot?.males + splittingLot?.females + splittingLot?.unsexed}`
                  : `Peso total del lote original: ${splittingLot?.mass_grams} g`}
              </div>
              {kind === "rodent" && (
                <div className="text-muted-foreground flex gap-4 mt-0.5">
                  <span>Machos: {splittingLot?.males ?? 0}</span>
                  <span>Hembras: {splittingLot?.females ?? 0}</span>
                  <span>Sin sexar: {splittingLot?.unsexed ?? 0}</span>
                </div>
              )}
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
                      <Input className="h-8 text-xs" value={sl.lot_code} onChange={(e) => updateSublot(idx, { lot_code: e.target.value })} placeholder={`${splittingLot?.lot_code ?? (kind === "rodent" ? "R" : "I")}-${String.fromCharCode(65 + idx)}`} />
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
                  {kind === "rodent" ? (
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
                        Subtotal: {(sl.males ?? 0) + (sl.females ?? 0) + (sl.unsexed ?? 0)} ind.
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-3 items-end">
                      <div className="col-span-2">
                        <Label className="text-[10px]">Masa (gramos)</Label>
                        <Input type="number" step="0.1" min={0} className="h-8 text-xs" value={sl.mass_grams} onChange={(e) => updateSublot(idx, { mass_grams: +e.target.value })} />
                      </div>
                      <div className="col-span-2 text-right text-xs font-medium text-emerald-glow pt-2">
                        Subtotal: {sl.mass_grams} g
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 bg-accent/40 rounded-md text-xs space-y-1">
              <div className="font-semibold text-emerald-glow flex justify-between">
                <span>Total asignado:</span>
                <span>{kind === "rodent" ? `${sumMales + sumFemales + sumUnsexed} ind.` : `${sumMass.toFixed(1)} g`}</span>
              </div>
              <div className="text-muted-foreground flex justify-between">
                <span>Resta en lote padre:</span>
                {kind === "rodent" ? (
                  <span className={remainingMales < 0 || remainingFemales < 0 || remainingUnsexed < 0 ? "text-destructive font-semibold" : ""}>
                    M: {remainingMales} · H: {remainingFemales} · S/S: {remainingUnsexed} ({remainingMales + remainingFemales + remainingUnsexed} ind.)
                  </span>
                ) : (
                  <span className={remainingMass < 0 ? "text-destructive font-semibold" : ""}>
                    {remainingMass.toFixed(1)} g
                  </span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplittingLot(null)}>Cancelar</Button>
            <Button onClick={handleSplitSubmit} disabled={submittingSplit || (kind === "rodent" ? (remainingMales < 0 || remainingFemales < 0 || remainingUnsexed < 0) : remainingMass < 0)}>
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
    </>
  );
}

export function BoxesView({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<any | null>(null);
  const [form, setForm] = useState({ code: "", roomRack: "", usage: "engorda", capacity: "" });

  const [filterCuarto, setFilterCuarto] = useState<string>("all");
  const [filterRack, setFilterRack] = useState<string>("all");
  const [filterUso, setFilterUso] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("all");

  const { data: boxes } = useQuery({
    queryKey: ["boxes", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from("boxes").select("*").eq("kind", kind).order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: lots } = useQuery({
    queryKey: ["lots-by-box", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("id,box_id,lot_code,males,females,unsexed,mass_grams,started_at,species_id,status,lot_type,notes")
        .eq("kind", kind).eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const { data: species } = useQuery({
    queryKey: ["species", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from("species").select("id,name,size_rules,kind").eq("kind", kind);
      if (error) throw error;
      return data;
    },
  });

  const { data: lines } = useQuery({
    queryKey: ["genetic-lines", kind],
    queryFn: async () => (await supabase.from("genetic_lines").select("id,name,species_id")).data ?? [],
  });

  // Birth dialog state
  const [birthBox, setBirthBox] = useState<any | null>(null);
  const [birthForm, setBirthForm] = useState({
    lot_code: "",
    species_id: "",
    line_id: "",
    unsexed: 0,
    notes: "",
  });
  const [submittingBirth, setSubmittingBirth] = useState(false);

  const registerBirth = async () => {
    if (!birthBox) return;
    if (!birthForm.lot_code || !birthForm.species_id || birthForm.unsexed <= 0) {
      toast.error("Código, especie y número de crías son obligatorios");
      return;
    }
    setSubmittingBirth(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { error } = await supabase.from("lots").insert({
        owner_id: user.id,
        kind: birthBox.kind,
        lot_code: birthForm.lot_code,
        lot_type: "birth",
        species_id: birthForm.species_id,
        line_id: birthForm.line_id || null,
        box_id: birthBox.id,
        males: 0,
        females: 0,
        unsexed: birthForm.unsexed,
        notes: birthForm.notes || null,
        started_at: new Date().toISOString().slice(0, 10),
        status: "active",
      } as any);

      if (error) throw error;

      toast.success(`Nacimiento registrado — ${birthForm.unsexed} crías en lote ${birthForm.lot_code}`);
      setBirthBox(null);
      setBirthForm({ lot_code: "", species_id: "", line_id: "", unsexed: 0, notes: "" });
      qc.invalidateQueries({ queryKey: ["lots", kind] });
      qc.invalidateQueries({ queryKey: ["lots-by-box", kind] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err: any) {
      toast.error(toUserFriendlyError(err));
    } finally {
      setSubmittingBirth(false);
    }
  };


  const byBox = useMemo(() => {
    const map: Record<string, any[]> = {};
    (lots ?? []).forEach((l) => { if (l.box_id) (map[l.box_id] ??= []).push(l); });
    return map;
  }, [lots]);

  const uniqueCuartos = useMemo(() => {
    const set = new Set<string>();
    (boxes ?? []).forEach((b) => {
      const { roomRack } = unpackLocation(b.location);
      // Extract "Cuarto X" or first part before "/"
      const cuartoMatch = roomRack.match(/cuarto\s+(\w+)/i);
      if (cuartoMatch) set.add(cuartoMatch[1].toUpperCase());
      else if (roomRack.includes("/")) set.add(roomRack.split("/")[0].trim());
      else if (roomRack) set.add(roomRack.trim());
    });
    return Array.from(set).sort();
  }, [boxes]);

  const uniqueRacks = useMemo(() => {
    const set = new Set<string>();
    (boxes ?? []).forEach((b) => {
      const { roomRack } = unpackLocation(b.location);
      // Extract "Mueble Y" or second part after "/"
      const muebleMatch = roomRack.match(/mueble\s+(\w+)/i);
      if (muebleMatch) set.add(muebleMatch[1].toUpperCase());
      else if (roomRack.includes("/")) set.add(roomRack.split("/")[1]?.trim() ?? "");
    });
    return Array.from(set).filter(Boolean).sort();
  }, [boxes]);

  const filteredBoxes = useMemo(() => {
    return (boxes ?? []).filter((b) => {
      const { roomRack, usage } = unpackLocation(b.location);
      const isOccupied = (byBox[b.id] ?? []).length > 0;

      // Cuarto filter
      if (filterCuarto !== "all") {
        const cuartoMatch = roomRack.match(/cuarto\s+(\w+)/i);
        const cuartoVal = cuartoMatch?.[1]?.toUpperCase() 
          ?? roomRack.split("/")[0]?.trim();
        if (cuartoVal !== filterCuarto) return false;
      }

      // Rack filter
      if (filterRack !== "all") {
        const muebleMatch = roomRack.match(/mueble\s+(\w+)/i);
        const rackVal = muebleMatch?.[1]?.toUpperCase() 
          ?? roomRack.split("/")[1]?.trim();
        if (rackVal !== filterRack) return false;
      }

      // Uso filter
      if (filterUso !== "all") {
        if (usage !== filterUso) return false;
      }

      // Estado filter
      if (filterEstado === "libre" && isOccupied) return false;
      if (filterEstado === "ocupada" && !isOccupied) return false;

      return true;
    });
  }, [boxes, byBox, filterCuarto, filterRack, filterUso, filterEstado]);

  const [searchBox, setSearchBox] = useState<string>("");

  const searchedBoxes = useMemo(() => {
    if (!searchBox.trim()) return filteredBoxes ?? [];
    const q = searchBox.trim().toLowerCase();
    return (filteredBoxes ?? []).filter(box => box.code?.toLowerCase().startsWith(q));
  }, [filteredBoxes, searchBox]);

  const feedFor = (boxId: string): number => {
    if (kind !== "rodent") return 0;
    const ls = byBox[boxId] ?? [];
    let total = 0;
    for (const l of ls) {
      const sp = species?.find((s) => s.id === l.species_id);
      const rules = (sp?.size_rules as any as RodentRule[]) ?? [];
      const ageDays = Math.floor((Date.now() - new Date(l.started_at).getTime()) / 86400000);
      const rule = rules.find((r) => ageDays >= r.min_days && ageDays <= r.max_days);
      const feed = rule?.daily_feed_g ?? 0;
      const count = (l.males ?? 0) + (l.females ?? 0) + (l.unsexed ?? 0);
      total += count * feed;
    }
    return total;
  };

  const submit = async () => {
    if (!form.code.trim() || !form.roomRack.trim()) return toast.error("Código y ubicación requeridos");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    if (editingBox) {
      const { error } = await supabase.from("boxes").update({
        code: form.code.trim(),
        location: packLocation(form.roomRack.trim(), form.usage),
        capacity: form.capacity ? +form.capacity : null,
      }).eq("id", editingBox.id);
      if (error) return toast.error(toUserFriendlyError(error));
      toast.success("Caja actualizada");
    } else {
      const { error } = await supabase.from("boxes").insert({
        owner_id: u.user.id, kind, code: form.code.trim(),
        location: packLocation(form.roomRack.trim(), form.usage),
        capacity: form.capacity ? +form.capacity : null,
      });
      if (error) return toast.error(toUserFriendlyError(error));
      toast.success("Caja registrada");
    }

    setOpen(false);
    setEditingBox(null);
    setForm({ code: "", roomRack: "", usage: "engorda", capacity: "" });
    qc.invalidateQueries({ queryKey: ["boxes", kind] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("boxes").delete().eq("id", id);
    if (error) return toast.error(toUserFriendlyError(error));
    qc.invalidateQueries({ queryKey: ["boxes", kind] });
  };

  const exportCSV = () => {
    const rows = (boxes ?? []).map((b) => {
      const { roomRack, usage } = unpackLocation(b.location);
      return { code: b.code, room_rack: roomRack, usage, capacity: b.capacity ?? "" };
    });
    downloadCSV(`cajas-${kind}.csv`, rows);
  };

  const importCSV = async () => {
    const rows = await pickCSVFile();
    if (!rows.length) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    let n = 0;
    for (const r of rows) {
      if (!r.code) continue;
      await supabase.from("boxes").insert({
        owner_id: u.user.id, kind, code: r.code,
        location: packLocation(r.room_rack ?? "", r.usage ?? ""),
        capacity: r.capacity ? +r.capacity : null,
      });
      n++;
    }
    toast.success(`${n} cajas importadas`);
    qc.invalidateQueries({ queryKey: ["boxes", kind] });
  };

  return (
    <PageShell
      title={`Cajas — ${kind === "rodent" ? "Roedores" : "Insectos"}`}
      subtitle="Inventario físico con estado de ocupación en tiempo real."
      icon={<BoxIcon className="h-6 w-6" />}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="h-4 w-4 mr-2" /> Importar</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
          <Dialog open={open} onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditingBox(null);
              setForm({ code: "", roomRack: "", usage: "engorda", capacity: "" });
            }
          }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nueva caja</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingBox ? "Editar caja" : "Nueva caja"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="C-01" /></div>
                <div><Label>Ubicación (Sala / Rack) *</Label><Input value={form.roomRack} onChange={(e) => setForm({ ...form, roomRack: e.target.value })} placeholder="Sala A / Rack 2" /></div>
                <div><Label>Uso *</Label>
                  <Select value={form.usage} onValueChange={(v) => setForm({ ...form, usage: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="engorda">Engorda</SelectItem>
                      <SelectItem value="reproductores">Reproductores</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Capacidad</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submit}>{editingBox ? "Guardar cambios" : "Registrar"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      {/* FILTER BAR */}
      {(boxes ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border/40">
          
          {/* Cuarto filter */}
          {uniqueCuartos.length > 1 && (
            <Select value={filterCuarto} onValueChange={setFilterCuarto}>
              <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
                <SelectValue placeholder="Cuarto: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cuarto: Todos</SelectItem>
                {uniqueCuartos.map((c) => (
                  <SelectItem key={c} value={c}>Cuarto {c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Rack filter */}
          {uniqueRacks.length > 1 && (
            <Select value={filterRack} onValueChange={setFilterRack}>
              <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
                <SelectValue placeholder="Mueble: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mueble: Todos</SelectItem>
                {uniqueRacks.map((r) => (
                  <SelectItem key={r} value={r}>Mueble {r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Uso filter */}
          <Select value={filterUso} onValueChange={setFilterUso}>
            <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
              <SelectValue placeholder="Uso: Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Uso: Todos</SelectItem>
              <SelectItem value="engorda">Engorda</SelectItem>
              <SelectItem value="reproductores">Reproductores</SelectItem>
            </SelectContent>
          </Select>

          {/* Estado filter */}
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
              <SelectValue placeholder="Estado: Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Estado: Todos</SelectItem>
              <SelectItem value="libre">Libre</SelectItem>
              <SelectItem value="ocupada">Ocupada</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear filters button - only shown when filters are active */}
          {(filterCuarto !== "all" || filterRack !== "all" || filterUso !== "all" || filterEstado !== "all") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setFilterCuarto("all");
                setFilterRack("all");
                setFilterUso("all");
                setFilterEstado("all");
              }}
            >
              ✕ Limpiar filtros
            </Button>
          )}

          {/* Results counter */}
          <span className="h-8 flex items-center text-xs text-muted-foreground ml-auto">
            {filteredBoxes.length} de {(boxes ?? []).length} cajas
          </span>
        </div>
      )}

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar caja por código..."
            value={searchBox}
            onChange={e => setSearchBox(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {searchBox && (
          <p className="text-xs text-muted-foreground mt-1 ml-1">
            {searchedBoxes.length} de {(boxes ?? []).length} cajas
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {searchedBoxes.length === 0 && (
          <Card className="col-span-full p-10 text-center text-muted-foreground border-dashed">
            {(boxes ?? []).length === 0
              ? "Aún no hay cajas registradas."
              : "No hay cajas con los filtros seleccionados."}
          </Card>
        )}
        {searchedBoxes.map((b) => {
          const { roomRack, usage } = unpackLocation(b.location);
          const occupants = byBox[b.id] ?? [];
          const occupied = occupants.length > 0;
          const feed = feedFor(b.id);
          return (
            <Card key={b.id} className="p-4 border-border bg-card/60 space-y-3 relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold tracking-tight text-foreground font-heading">{b.code}</span>
                    {usage && (
                      <Badge variant="secondary" className="text-[9px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-md">
                        {usage}
                      </Badge>
                    )}
                  </div>
                  <div>
                    {occupied ? (
                      <PopoverOpenableBadge occupants={occupants} kind={kind} qc={qc} boxes={boxes ?? []} />
                    ) : (
                      <Badge className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        Libre
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-rose-500 fill-rose-500/20 shrink-0" />
                    <span>{roomRack}</span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>Capacidad:</span>
                    <span className="font-semibold text-foreground">{b.capacity ?? "—"}</span>
                  </div>
                </div>

                {kind === "rodent" && occupied && (
                  <div className="flex items-center gap-2 text-xs pt-2 mt-2 border-t border-border/40">
                    <Utensils className="h-3 w-3 text-warning shrink-0" />
                    <span className="text-muted-foreground">Consumo diario:</span>
                    <span className="font-semibold text-warning">{feed.toFixed(1)} g</span>
                  </div>
                )}
              </div>

              {usage === "reproductores" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-9 text-xs gap-1.5 font-semibold border-pink-500/40 text-pink-500 hover:bg-pink-500/10 hover:text-pink-500 hover:border-pink-500/60 mt-1"
                  onClick={() => {
                    setBirthForm({ lot_code: "", species_id: "", line_id: "", unsexed: 0, notes: "" });
                    setBirthBox(b);
                  }}
                >
                  🐣 Registrar Nacimiento
                </Button>
              )}

              <div className="grid grid-cols-2 gap-1.5 pt-2.5 mt-3 border-t border-border/50 -mx-4 -mb-4 px-3 pb-3 bg-muted/30">

                <Button size="sm" variant="secondary" className="h-8 text-xs gap-1.5 px-2 font-medium" onClick={() => {
                  setEditingBox(b);
                  const unpacked = unpackLocation(b.location);
                  setForm({
                    code: b.code,
                    roomRack: unpacked.roomRack,
                    usage: unpacked.usage || "engorda",
                    capacity: b.capacity ? String(b.capacity) : "",
                  });
                  setOpen(true);
                }}>
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 px-2 font-medium text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60" onClick={() => remove(b.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!birthBox} onOpenChange={(v) => !v && setBirthBox(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>🐣 Registrar Nacimiento — Caja {birthBox?.code}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Se creará un lote de tipo <span className="font-semibold">birth</span> con fecha de hoy.
          </p>
          <div className="grid gap-4 py-2">
            <div>
              <Label className="mb-1.5 block">Código del lote *</Label>
              <Input
                value={birthForm.lot_code}
                onChange={(e) => setBirthForm({ ...birthForm, lot_code: e.target.value })}
                placeholder="Ej. N-01"
                className="h-10"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Especie *</Label>
              <Select value={birthForm.species_id} onValueChange={(v) => setBirthForm({ ...birthForm, species_id: v, line_id: "" })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona especie" /></SelectTrigger>
                <SelectContent>
                  {(species ?? [])
                    .filter((s: any) => s.kind === birthBox?.kind)
                    .map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">Línea genética <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Select value={birthForm.line_id} onValueChange={(v) => setBirthForm({ ...birthForm, line_id: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(lines ?? [])
                    .filter((l: any) => !birthForm.species_id || l.species_id === birthForm.species_id)
                    .map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">Número de crías *</Label>
              <Input
                type="number"
                min={1}
                value={birthForm.unsexed || ""}
                onChange={(e) => setBirthForm({ ...birthForm, unsexed: parseInt(e.target.value) || 0 })}
                className="h-10"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Las crías se registran como "sin sexar" — se pueden actualizar después
              </p>
            </div>

            <div>
              <Label className="mb-1.5 block">Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                value={birthForm.notes}
                onChange={(e) => setBirthForm({ ...birthForm, notes: e.target.value })}
                className="h-10"
              />
            </div>

            {birthForm.unsexed > 0 && birthForm.lot_code && (
              <div className="p-3 rounded-md bg-pink-500/10 border border-pink-500/30 text-xs">
                <p className="font-semibold text-pink-500 mb-1">Resumen del lote a crear:</p>
                <p className="text-muted-foreground">
                  Código: <span className="text-foreground font-medium">{birthForm.lot_code}</span> · Tipo: <span className="text-foreground font-medium">birth</span> · Crías: <span className="text-foreground font-medium">{birthForm.unsexed}</span> · Fecha: hoy
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBirthBox(null)}>Cancelar</Button>
            <Button onClick={registerBirth} disabled={submittingBirth}>
              {submittingBirth ? "Registrando..." : "🐣 Registrar Nacimiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>

  );
}
