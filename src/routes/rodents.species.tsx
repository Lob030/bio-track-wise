import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Rat, Plus, Trash2, Wand2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { RodentSizeMatrix, type RodentRule } from "@/components/size-matrix";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/rodents/species")({ component: Page });

const LONG_EVANS: RodentRule[] = [
  { label: "Pinky", min_days: 0, max_days: 6, min_weight_g: 0, max_weight_g: 16, daily_feed_g: 0 },
  { label: "Fuzzy", min_days: 7, max_days: 14, min_weight_g: 16, max_weight_g: 30, daily_feed_g: 0 },
  { label: "Jumper", min_days: 15, max_days: 21, min_weight_g: 30, max_weight_g: 50, daily_feed_g: 4 },
];

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rules, setRules] = useState<RodentRule[]>([{ label: "", min_days: 0, max_days: 0, min_weight_g: 0, max_weight_g: 0, daily_feed_g: 0 }]);

  const { data: species } = useQuery({
    queryKey: ["species", "rodent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("species").select("*").eq("kind", "rodent").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const createSpecies = async (n: string, r: RodentRule[]) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("species").insert({
      owner_id: u.user.id, kind: "rodent", name: n, size_rules: r as any,
    });
    if (error) return toast.error(error.message);
    toast.success(`Especie "${n}" creada`);
    qc.invalidateQueries({ queryKey: ["species", "rodent"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("species").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Eliminada");
    qc.invalidateQueries({ queryKey: ["species", "rodent"] });
  };

  const submit = async () => {
    if (!name.trim()) return toast.error("Nombre requerido");
    await createSpecies(name.trim(), rules.filter((r) => r.label.trim()));
    setOpen(false); setName(""); setRules([{ label: "", min_days: 0, max_days: 0, min_weight_g: 0, max_weight_g: 0, daily_feed_g: 0 }]);
  };

  return (
    <PageShell
      title="Especies — Roedores"
      subtitle="Catálogo con matriz dinámica de tallas por días, peso y consumo de alimento."
      icon={<Rat className="h-6 w-6" />}
      actions={
        <>
          <Button variant="outline" onClick={() => createSpecies("Rata Long Evans", LONG_EVANS)}>
            <Wand2 className="h-4 w-4 mr-2" /> Preset Long Evans
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nueva especie</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>Nueva especie de roedor</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ratón ICR" /></div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Matriz de tallas</Label>
                    <Button size="sm" variant="ghost" onClick={() => setRules([...rules, { label: "", min_days: 0, max_days: 0, min_weight_g: 0, max_weight_g: 0, daily_feed_g: 0 }])}>+ Agregar fila</Button>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2 text-[10px] uppercase text-muted-foreground px-1">
                      <span className="col-span-3">Talla</span><span className="col-span-1">Día min</span><span className="col-span-1">Día max</span>
                      <span className="col-span-2">Peso min (g)</span><span className="col-span-2">Peso max (g)</span><span className="col-span-2">Alimento (g/día)</span><span /></div>
                    {rules.map((r, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <Input className="col-span-3" value={r.label} onChange={(e) => { const n = [...rules]; n[i].label = e.target.value; setRules(n); }} placeholder="Pinky" />
                        <Input className="col-span-1" type="number" value={r.min_days} onChange={(e) => { const n = [...rules]; n[i].min_days = +e.target.value; setRules(n); }} />
                        <Input className="col-span-1" type="number" value={r.max_days} onChange={(e) => { const n = [...rules]; n[i].max_days = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2" type="number" value={r.min_weight_g} onChange={(e) => { const n = [...rules]; n[i].min_weight_g = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2" type="number" value={r.max_weight_g} onChange={(e) => { const n = [...rules]; n[i].max_weight_g = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2" type="number" value={r.daily_feed_g} onChange={(e) => { const n = [...rules]; n[i].daily_feed_g = +e.target.value; setRules(n); }} />
                        <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={submit}>Crear especie</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="space-y-3">
        {(species ?? []).length === 0 && (
          <Card className="p-10 text-center text-muted-foreground border-dashed">
            Aún no hay especies. Usa el preset Long Evans o crea una nueva.
          </Card>
        )}
        {(species ?? []).map((s) => {
          const isOpen = expanded === s.id;
          const rs = (s.size_rules as any as RodentRule[]) ?? [];
          return (
            <Card key={s.id} className="border-border bg-card/60 overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : s.id)} className="w-full flex items-center justify-between p-4 hover:bg-accent/30 transition">
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div className="text-left">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{rs.length} tallas definidas</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">roedor</Badge>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(s.id); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </button>
              {isOpen && <div className="p-4 pt-0"><RodentSizeMatrix rules={rs} /></div>}
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
