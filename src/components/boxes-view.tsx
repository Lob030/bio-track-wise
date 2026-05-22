import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes as BoxIcon, Plus, Trash2, Download, Upload, Utensils } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { downloadCSV, pickCSVFile } from "@/lib/csv";
import type { RodentRule } from "@/components/size-matrix";

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

export function BoxesView({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", roomRack: "", usage: "engorda", capacity: "" });

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
      const { data, error } = await supabase.from("lots").select("id,box_id,males,females,unsexed,mass_grams,started_at,species_id,status,lot_type")
        .eq("kind", kind).eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const { data: species } = useQuery({
    queryKey: ["species", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from("species").select("id,size_rules").eq("kind", kind);
      if (error) throw error;
      return data;
    },
  });

  const byBox = useMemo(() => {
    const map: Record<string, any[]> = {};
    (lots ?? []).forEach((l) => { if (l.box_id) (map[l.box_id] ??= []).push(l); });
    return map;
  }, [lots]);

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
    const { error } = await supabase.from("boxes").insert({
      owner_id: u.user.id, kind, code: form.code.trim(),
      location: packLocation(form.roomRack.trim(), form.usage),
      capacity: form.capacity ? +form.capacity : null,
    });
    if (error) return toast.error(error.message);
    toast.success("Caja registrada");
    setOpen(false); setForm({ code: "", roomRack: "", usage: "engorda", capacity: "" });
    qc.invalidateQueries({ queryKey: ["boxes", kind] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("boxes").delete().eq("id", id);
    if (error) return toast.error(error.message);
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nueva caja</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva caja</DialogTitle></DialogHeader>
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
              <DialogFooter><Button onClick={submit}>Registrar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(boxes ?? []).length === 0 && (
          <Card className="col-span-full p-10 text-center text-muted-foreground border-dashed">Aún no hay cajas registradas.</Card>
        )}
        {(boxes ?? []).map((b) => {
          const { roomRack, usage } = unpackLocation(b.location);
          const occupants = byBox[b.id] ?? [];
          const occupied = occupants.length > 0;
          const feed = feedFor(b.id);
          return (
            <Card key={b.id} className="p-4 border-border bg-card/60 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono font-bold text-emerald-glow">{b.code}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{roomRack}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {usage && <Badge variant="outline" className="text-[10px] capitalize">{usage}</Badge>}
                {occupied
                  ? <Badge className="text-[10px] bg-warning text-warning-foreground">Ocupada · {occupants.length} lote{occupants.length > 1 ? "s" : ""}</Badge>
                  : <Badge className="text-[10px] bg-success text-success-foreground">Libre</Badge>}
                {b.capacity && <Badge variant="outline" className="text-[10px]">cap. {b.capacity}</Badge>}
              </div>
              {kind === "rodent" && occupied && (
                <div className="flex items-center gap-2 text-xs pt-2 border-t border-border">
                  <Utensils className="h-3 w-3 text-amber-glow" />
                  <span className="text-muted-foreground">Consumo diario:</span>
                  <span className="font-semibold text-amber-glow">{feed.toFixed(1)} g</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
