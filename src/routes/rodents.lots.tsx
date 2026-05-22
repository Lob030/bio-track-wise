import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Rat, Plus } from "lucide-react";
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

export const Route = createFileRoute("/rodents/lots")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "",
    males: 0, females: 0, unsexed: 0, notes: "",
  });

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

  const submit = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (total <= 0) return toast.error("La población total debe ser mayor a 0");
    const { error } = await supabase.from("lots").insert({
      owner_id: u.user.id, kind: "rodent",
      lot_code: form.lot_code || null, lot_type: form.lot_type as any,
      species_id: form.species_id || null, line_id: form.line_id || null, box_id: form.box_id || null,
      males: form.males, females: form.females, unsexed: form.unsexed, notes: form.notes,
    });
    if (error) return toast.error(error.message.includes("TIER_LIMIT") ? "Límite del plan alcanzado." : error.message);
    toast.success("Lote creado");
    setOpen(false);
    setForm({ lot_code: "", lot_type: "engorda", species_id: "", line_id: "", box_id: "", males: 0, females: 0, unsexed: 0, notes: "" });
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
              <div><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Registrar lote</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <Card className="p-0 border-border bg-card/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/30 text-[10px] uppercase text-muted-foreground">
            <tr><th className="text-left p-3">Código</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">M</th><th className="text-left p-3">H</th><th className="text-left p-3">S/S</th><th className="text-left p-3">Total</th><th className="text-left p-3">Estado</th><th className="text-left p-3">Inicio</th></tr>
          </thead>
          <tbody>
            {(lots ?? []).map((l) => {
              const t = (l.males ?? 0) + (l.females ?? 0) + (l.unsexed ?? 0);
              return (
                <tr key={l.id} className="border-t border-border hover:bg-accent/20">
                  <td className="p-3 font-mono text-xs">{l.lot_code ?? l.id.slice(0, 8)}</td>
                  <td className="p-3"><Badge variant="outline" className="capitalize text-[10px]">{l.lot_type}</Badge></td>
                  <td className="p-3">{l.males}</td><td className="p-3">{l.females}</td><td className="p-3">{l.unsexed}</td>
                  <td className="p-3 font-bold text-emerald-glow">{t}</td>
                  <td className="p-3"><Badge variant={l.status === "active" ? "default" : "secondary"} className="text-[10px]">{l.status}</Badge></td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(l.started_at).toLocaleDateString("es-MX")}</td>
                </tr>
              );
            })}
            {(lots ?? []).length === 0 && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Sin lotes registrados.</td></tr>}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
