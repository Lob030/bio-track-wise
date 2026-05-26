import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bug, Plus, Trash2, Wand2, ChevronDown, ChevronRight, Edit2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { InsectSizeMatrix, type InsectRule } from "@/components/size-matrix";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/insects/species")({ component: Page });

const TENEBRIOS: InsectRule[] = [
  { label: "Huevo", min_days: 0, max_days: 14, individuals_per_gram: 50000, price_mxn: 8 },
  { label: "1 Semana", min_days: 15, max_days: 21, individuals_per_gram: 6000, price_mxn: 12 },
  { label: "2 Semana", min_days: 22, max_days: 28, individuals_per_gram: 800, price_mxn: 18 },
  { label: "3 Semana", min_days: 29, max_days: 35, individuals_per_gram: 200, price_mxn: 25 },
];

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<any | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rules, setRules] = useState<InsectRule[]>([{ label: "", min_days: 0, max_days: 0, individuals_per_gram: 0, price_mxn: 0 }]);

  const { data: species } = useQuery({
    queryKey: ["species"],
    queryFn: async () => {
      const { data, error } = await supabase.from("species").select("*").eq("kind", "insect").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const create = async (n: string, r: InsectRule[]) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("species").insert({
      owner_id: u.user.id, kind: "insect", name: n, size_rules: r as any,
    });
    if (error) return toast.error(error.message);
    toast.success(`Especie "${n}" creada`);
    qc.invalidateQueries({ queryKey: ["species", "insect"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("species").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["species", "insect"] });
  };

  const submit = async () => {
    if (!name.trim()) return toast.error("Nombre requerido");
    const filteredRules = rules.filter((r) => r.label.trim());

    if (editingSpecies) {
      const { error } = await supabase.from("species").update({
        name: name.trim(), size_rules: filteredRules as any,
      }).eq("id", editingSpecies.id);
      if (error) return toast.error(error.message);
      toast.success("Especie actualizada");
      qc.invalidateQueries({ queryKey: ["species", "insect"] });
    } else {
      await create(name.trim(), filteredRules);
    }

    setOpen(false); setEditingSpecies(null); setName(""); setRules([{ label: "", min_days: 0, max_days: 0, individuals_per_gram: 0, price_mxn: 0 }]);
  };

  return (
    <PageShell
      title="Especies — Insectos"
      subtitle="Catálogo con métrica de individuos por gramo por etapa cronológica."
      icon={<Bug className="h-6 w-6" />}
      actions={
        <>
          <Button variant="outline" onClick={() => create("Tenebrios", TENEBRIOS)}>
            <Wand2 className="h-4 w-4 mr-2" /> Preset Tenebrios
          </Button>
          <Dialog open={open} onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditingSpecies(null);
              setName("");
              setRules([{ label: "", min_days: 0, max_days: 0, individuals_per_gram: 0, price_mxn: 0 }]);
            }
          }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nueva especie</Button></DialogTrigger>
            <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
              <DialogHeader><DialogTitle>{editingSpecies ? "Editar especie de insecto" : "Nueva especie de insecto"}</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-4 overflow-hidden min-h-0 flex-1">
                <div className="shrink-0">
                  <Label>Nombre</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Grillos" className="w-full" />
                </div>
                <div className="flex flex-col min-h-0 flex-1">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <Label>Matriz de etapas</Label>
                    <Button size="sm" variant="ghost" onClick={() => setRules([...rules, { label: "", min_days: 0, max_days: 0, individuals_per_gram: 0, price_mxn: 0 }])}>+ Agregar fila</Button>
                  </div>
                  <div className="grid grid-cols-12 gap-2 text-[10px] uppercase text-muted-foreground px-1 shrink-0">
                    <span className="col-span-3">Etapa</span><span className="col-span-2">Día min</span><span className="col-span-2">Día max</span><span className="col-span-2">Ind. / 1g</span><span className="col-span-2">Precio MXN</span><span />
                  </div>
                  <div className="space-y-2 overflow-y-auto flex-1 mt-1 pr-1">
                    {rules.map((r, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <Input className="col-span-3" value={r.label} onChange={(e) => { const n = [...rules]; n[i].label = e.target.value; setRules(n); }} placeholder="Huevo" />
                        <Input className="col-span-2" type="number" value={r.min_days} onChange={(e) => { const n = [...rules]; n[i].min_days = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2" type="number" value={r.max_days} onChange={(e) => { const n = [...rules]; n[i].max_days = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2" type="number" value={r.individuals_per_gram} onChange={(e) => { const n = [...rules]; n[i].individuals_per_gram = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2" type="number" step="0.01" value={r.price_mxn} onChange={(e) => { const n = [...rules]; n[i].price_mxn = +e.target.value; setRules(n); }} placeholder="0" />
                        <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={submit}>{editingSpecies ? "Guardar cambios" : "Crear especie"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="space-y-3">
        {(species ?? []).length === 0 && (
          <Card className="p-10 text-center text-muted-foreground border-dashed">
            Aún no hay especies. Carga el preset de Tenebrios o registra una nueva.
          </Card>
        )}
        {(species ?? []).map((s) => {
          const isOpen = expanded === s.id;
          const rs = (s.size_rules as any as InsectRule[]) ?? [];
          return (
            <Card key={s.id} className="border-border bg-card/60 overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : s.id)} className="w-full flex items-center justify-between p-4 hover:bg-accent/30 transition">
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div className="text-left">
                    <div className="font-semibold">
                      {s.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{rs.length} etapas</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">insecto</Badge>
                  <Button size="icon" variant="ghost" onClick={(e) => {
                    e.stopPropagation();
                    setEditingSpecies(s);
                    setName(s.name);
                    setRules(s.size_rules as InsectRule[] ?? []);
                    setOpen(true);
                  }}><Edit2 className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(s.id); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </button>
              {isOpen && <div className="p-4 pt-0"><InsectSizeMatrix rules={rs} /></div>}
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
