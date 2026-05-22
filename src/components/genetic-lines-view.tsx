import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dna, Plus, Trash2, Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { downloadCSV, pickCSVFile } from "@/lib/csv";

type Kind = "rodent" | "insect";

function packMeta(date: string, origin: string, notes: string) {
  return JSON.stringify({ date, origin, notes });
}
function unpackMeta(raw: string | null) {
  if (!raw) return { date: "", origin: "", notes: "" };
  try { const o = JSON.parse(raw); return { date: o.date ?? "", origin: o.origin ?? "", notes: o.notes ?? "" }; }
  catch { return { date: "", origin: "", notes: raw }; }
}

export function GeneticLinesView({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", species_id: "", date: new Date().toISOString().slice(0, 10), origin: "", notes: "" });

  const { data: species } = useQuery({
    queryKey: ["species", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from("species").select("id,name").eq("kind", kind).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: lines } = useQuery({
    queryKey: ["lines", kind],
    queryFn: async () => {
      const ids = (species ?? []).map((s) => s.id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from("genetic_lines").select("*").in("species_id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!species,
  });

  const submit = async () => {
    if (!form.name.trim() || !form.species_id) return toast.error("Nombre y especie son requeridos");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("genetic_lines").insert({
      owner_id: u.user.id, name: form.name.trim(), species_id: form.species_id,
      notes: packMeta(form.date, form.origin, form.notes),
    });
    if (error) return toast.error(error.message);
    toast.success("Línea genética creada");
    setOpen(false);
    setForm({ name: "", species_id: "", date: new Date().toISOString().slice(0, 10), origin: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["lines", kind] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("genetic_lines").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lines", kind] });
  };

  const exportCSV = () => {
    const rows = (lines ?? []).map((l) => {
      const m = unpackMeta(l.notes);
      const sp = species?.find((s) => s.id === l.species_id);
      return { name: l.name, species: sp?.name ?? "", date: m.date, origin: m.origin, notes: m.notes };
    });
    downloadCSV(`lineas-geneticas-${kind}.csv`, rows);
  };

  const importCSV = async () => {
    const rows = await pickCSVFile();
    if (!rows.length) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    let count = 0;
    for (const r of rows) {
      const sp = species?.find((s) => s.name.toLowerCase() === (r.species ?? "").toLowerCase());
      if (!sp || !r.name) continue;
      await supabase.from("genetic_lines").insert({
        owner_id: u.user.id, name: r.name, species_id: sp.id,
        notes: packMeta(r.date ?? "", r.origin ?? "", r.notes ?? ""),
      });
      count++;
    }
    toast.success(`${count} líneas importadas`);
    qc.invalidateQueries({ queryKey: ["lines", kind] });
  };

  const title = kind === "rodent" ? "Líneas Genéticas — Roedores" : "Líneas Genéticas — Insectos";

  return (
    <PageShell
      title={title}
      subtitle="Cepas, orígenes y notas de cada línea de trabajo."
      icon={<Dna className="h-6 w-6" />}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="h-4 w-4 mr-2" /> Importar</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nueva línea</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva línea genética</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Especie *</Label>
                  <Select value={form.species_id} onValueChange={(v) => setForm({ ...form, species_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona especie" /></SelectTrigger>
                    <SelectContent>{(species ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Fecha *</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div><Label>Origen</Label><Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Proveedor / colonia origen" /></div>
                <div><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submit}>Registrar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(lines ?? []).length === 0 && (
          <Card className="col-span-full p-10 text-center text-muted-foreground border-dashed">Aún no hay líneas genéticas registradas.</Card>
        )}
        {(lines ?? []).map((l) => {
          const meta = unpackMeta(l.notes);
          const sp = species?.find((s) => s.id === l.species_id);
          return (
            <Card key={l.id} className="p-4 border-border bg-card/60 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{l.name}</div>
                  <Badge variant="outline" className="mt-1 text-[10px]">{sp?.name ?? "—"}</Badge>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(l.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
                {meta.date && <div>📅 {meta.date}</div>}
                {meta.origin && <div>📍 {meta.origin}</div>}
                {meta.notes && <div className="line-clamp-2">📝 {meta.notes}</div>}
              </div>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
