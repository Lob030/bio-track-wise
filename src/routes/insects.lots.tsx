import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Bug, Plus, Scale, Layers, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/insects/lots")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "",
    mass_grams: "", parent_lot_id: "", notes: "",
  });

  const { data: lots } = useQuery({
    queryKey: ["lots", "insect"],
    queryFn: async () => (await supabase.from("lots").select("*").eq("kind", "insect").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: species } = useQuery({
    queryKey: ["species", "insect", "min"],
    queryFn: async () => (await supabase.from("species").select("id,name").eq("kind", "insect")).data ?? [],
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

  const summary = useMemo(() => {
    const active = (lots ?? []).filter((l) => l.status === "active");
    const biomass = active.reduce((s, l) => s + (Number(l.mass_grams) || 0), 0);
    const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
    const finalizedMonth = (lots ?? []).filter((l) => l.status === "finalizado" && l.finalized_at && new Date(l.finalized_at) >= monthAgo).length;
    return { active: active.length, biomass, finalizedMonth };
  }, [lots]);

  const submit = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const grams = +form.mass_grams;
    if (!grams || grams <= 0) return toast.error("Peso en gramos del lote es obligatorio");
    const { error } = await supabase.from("lots").insert({
      owner_id: u.user.id, kind: "insect",
      lot_code: form.lot_code || null, lot_type: form.lot_type as any,
      species_id: form.species_id || null, line_id: form.line_id || null, box_id: form.box_id || null,
      parent_lot_id: form.parent_lot_id || null,
      mass_grams: grams, notes: form.notes,
    });
    if (error) return toast.error(error.message.includes("TIER_LIMIT") ? "Límite del plan alcanzado." : error.message);
    toast.success("Lote de insectos creado");
    setOpen(false);
    setForm({ lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "", mass_grams: "", parent_lot_id: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["lots", "insect"] });
    qc.invalidateQueries({ queryKey: ["lots-by-box", "insect"] });
  };

  return (
    <PageShell
      title="Lotes de Insectos"
      subtitle="Biomasa en gramos por lote, sin tracking individual de sexo."
      icon={<Bug className="h-6 w-6" />}
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nuevo lote</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Nuevo lote de insectos</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Código de lote</Label><Input value={form.lot_code} onChange={(e) => setForm({ ...form, lot_code: e.target.value })} placeholder="I-01" /></div>
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
                    <SelectContent>{linesForSp.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Caja</Label>
                  <Select value={form.box_id} onValueChange={(v) => setForm({ ...form, box_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(boxes ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Peso en gramos del lote *</Label>
                <Input type="number" step="0.1" value={form.mass_grams} onChange={(e) => setForm({ ...form, mass_grams: e.target.value })} placeholder="Ej. 250" />
              </div>
              <div><Label>Lote padre (subdivisión)</Label>
                <Select value={form.parent_lot_id} onValueChange={(v) => setForm({ ...form, parent_lot_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(lots ?? []).filter((l) => l.status === "active").map((l) => <SelectItem key={l.id} value={l.id}>{l.lot_code ?? l.id.slice(0, 8)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Registrar lote</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 border-border bg-card/60"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground uppercase">Lotes activos</div><div className="text-2xl font-bold mt-1">{summary.active}</div></div><Layers className="h-6 w-6 text-emerald-glow" /></div></Card>
        <Card className="p-4 border-border bg-card/60"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground uppercase">Biomasa total</div><div className="text-2xl font-bold mt-1">{summary.biomass.toLocaleString("es-MX")} g</div></div><Scale className="h-6 w-6 text-amber-glow" /></div></Card>
        <Card className="p-4 border-border bg-card/60"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground uppercase">Finalizados (mes)</div><div className="text-2xl font-bold mt-1">{summary.finalizedMonth}</div></div><CheckCircle2 className="h-6 w-6 text-info" /></div></Card>
      </div>

      <Card className="p-0 border-border bg-card/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/30 text-[10px] uppercase text-muted-foreground">
            <tr><th className="text-left p-3">Código</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">Peso (g)</th><th className="text-left p-3">Estado</th><th className="text-left p-3">Inicio</th></tr>
          </thead>
          <tbody>
            {(lots ?? []).map((l) => (
              <tr key={l.id} className="border-t border-border hover:bg-accent/20">
                <td className="p-3 font-mono text-xs">{l.lot_code ?? l.id.slice(0, 8)}</td>
                <td className="p-3"><Badge variant="outline" className="capitalize text-[10px]">{l.lot_type}</Badge></td>
                <td className="p-3 font-bold text-emerald-glow">{(+(l.mass_grams ?? 0)).toFixed(1)} g</td>
                <td className="p-3"><Badge variant={l.status === "active" ? "default" : "secondary"} className="text-[10px]">{l.status}</Badge></td>
                <td className="p-3 text-muted-foreground text-xs">{new Date(l.started_at).toLocaleDateString("es-MX")}</td>
              </tr>
            ))}
            {(lots ?? []).length === 0 && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Sin lotes registrados.</td></tr>}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
