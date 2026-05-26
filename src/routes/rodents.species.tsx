import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Rat, Plus, Trash2, Wand2, ChevronDown, ChevronRight, Edit2 } from "lucide-react";
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
  { label: "Pinky", min_days: 0, max_days: 6, min_weight_g: 0, max_weight_g: 16, daily_feed_g: 0, price_mxn: 25 },
  { label: "Fuzzy", min_days: 7, max_days: 14, min_weight_g: 16, max_weight_g: 30, daily_feed_g: 0, price_mxn: 45 },
  { label: "Jumper", min_days: 15, max_days: 21, min_weight_g: 30, max_weight_g: 50, daily_feed_g: 4, price_mxn: 65 },
];

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<any | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rules, setRules] = useState<RodentRule[]>([{ label: "", min_days: 0, max_days: 0, min_weight_g: 0, max_weight_g: 0, daily_feed_g: 0, price_mxn: 0 }]);

  const { data: species } = useQuery({
    queryKey: ["species"],
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
    qc.invalidateQueries({ queryKey: ["species"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("species").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Eliminada");
    qc.invalidateQueries({ queryKey: ["species"] });
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
      qc.invalidateQueries({ queryKey: ["species"] });
    } else {
      await createSpecies(name.trim(), filteredRules);
    }

    setOpen(false); setEditingSpecies(null); setName(""); setRules([{ label: "", min_days: 0, max_days: 0, min_weight_g: 0, max_weight_g: 0, daily_feed_g: 0, price_mxn: 0 }]);
  };

  return (
    <PageShell
      title="Especies — Roedores"
      subtitle="Catálogo con matriz dinámica de tallas por días, peso y consumo de alimento."
      icon={<Rat className="h-6 w-6" />}
      actions={
        <>
          <Button variant="outline" className="h-10 md:h-9 min-h-10 md:min-h-9 transition-all duration-200" onClick={() => createSpecies("Rata Long Evans", LONG_EVANS)}>
            <Wand2 className="h-5 md:h-4 w-5 md:w-4 mr-2" /> Preset Long Evans
          </Button>
          <Dialog open={open} onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditingSpecies(null);
              setName("");
              setRules([{ label: "", min_days: 0, max_days: 0, min_weight_g: 0, max_weight_g: 0, daily_feed_g: 0, price_mxn: 0 }]);
            }
          }}>
            <DialogTrigger asChild>
              <Button className="h-10 md:h-9 min-h-10 md:min-h-9 transition-all duration-200">
                <Plus className="h-5 md:h-4 w-5 md:w-4 mr-2" /> Nueva especie
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl p-6 gap-6 flex flex-col max-h-[90vh]">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                  {editingSpecies ? "Editar especie de roedor" : "Nueva especie de roedor"}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-5 overflow-hidden min-h-0 flex-1">
                <div className="shrink-0">
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Nombre</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ratón ICR" className="w-full h-10 focus-visible:ring-2 focus-visible:ring-primary" />
                </div>
                <div className="flex flex-col min-h-0 flex-1">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <Label className="text-sm font-semibold text-foreground/90">Matriz de tallas</Label>
                    <Button size="sm" variant="ghost" className="h-8 transition-all hover:bg-accent" onClick={() => setRules([...rules, { label: "", min_days: 0, max_days: 0, min_weight_g: 0, max_weight_g: 0, daily_feed_g: 0, price_mxn: 0 }])}>+ Agregar fila</Button>
                  </div>
                  <div className="grid grid-cols-12 gap-2 text-[11px] uppercase text-muted-foreground/80 px-2 shrink-0 font-bold">
                    <span className="col-span-2">Talla</span><span className="col-span-1">Día min</span><span className="col-span-1">Día max</span>
                    <span className="col-span-2">Peso min (g)</span><span className="col-span-2">Peso max (g)</span><span className="col-span-1">Alim. (g/d)</span><span className="col-span-2">Precio MXN</span><span />
                  </div>
                  <div className="space-y-2 overflow-y-auto flex-1 mt-1 pr-1">
                    {rules.map((r, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <Input className="col-span-2 h-10 focus-visible:ring-2 focus-visible:ring-primary" value={r.label} onChange={(e) => { const n = [...rules]; n[i].label = e.target.value; setRules(n); }} placeholder="Pinky" />
                        <Input className="col-span-1 h-10 focus-visible:ring-2 focus-visible:ring-primary" type="number" value={r.min_days} onChange={(e) => { const n = [...rules]; n[i].min_days = +e.target.value; setRules(n); }} />
                        <Input className="col-span-1 h-10 focus-visible:ring-2 focus-visible:ring-primary" type="number" value={r.max_days} onChange={(e) => { const n = [...rules]; n[i].max_days = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2 h-10 focus-visible:ring-2 focus-visible:ring-primary" type="number" value={r.min_weight_g} onChange={(e) => { const n = [...rules]; n[i].min_weight_g = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2 h-10 focus-visible:ring-2 focus-visible:ring-primary" type="number" value={r.max_weight_g} onChange={(e) => { const n = [...rules]; n[i].max_weight_g = +e.target.value; setRules(n); }} />
                        <Input className="col-span-1 h-10 focus-visible:ring-2 focus-visible:ring-primary" type="number" value={r.daily_feed_g} onChange={(e) => { const n = [...rules]; n[i].daily_feed_g = +e.target.value; setRules(n); }} />
                        <Input className="col-span-2 h-10 focus-visible:ring-2 focus-visible:ring-primary" type="number" step="0.01" value={r.price_mxn} onChange={(e) => { const n = [...rules]; n[i].price_mxn = +e.target.value; setRules(n); }} placeholder="0" />
                        <Button size="icon" variant="ghost" className="col-span-1 h-9 w-9 text-muted-foreground hover:text-destructive transition-all" onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter className="border-t border-border/20 pt-4 flex gap-2">
                <Button variant="outline" className="h-10 transition-all duration-200" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button className="h-10 transition-all duration-200" onClick={submit}>{editingSpecies ? "Guardar cambios" : "Crear especie"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="space-y-3">
        {(species ?? []).length === 0 && (
          <Card className="p-10 text-center text-muted-foreground border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm">
            Aún no hay especies. Usa el preset Long Evans o crea una nueva.
          </Card>
        )}
        {(species ?? []).map((s) => {
          const isOpen = expanded === s.id;
          const rs = (s.size_rules as any as RodentRule[]) ?? [];
          return (
            <Card key={s.id} className="border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : s.id)} className="w-full flex items-center justify-between p-4 hover:bg-accent/15 transition-all duration-200">
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="h-4.5 w-4.5 text-muted-foreground" /> : <ChevronRight className="h-4.5 w-4.5 text-muted-foreground" />}
                  <div className="text-left">
                    <div className="font-semibold text-foreground">
                      {s.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{rs.length} tallas definidas</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-border/40 bg-accent/15">roedor</Badge>
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-primary transition-all" onClick={(e) => {
                    e.stopPropagation();
                    setEditingSpecies(s);
                    setName(s.name);
                    setRules(s.size_rules as RodentRule[] ?? []);
                    setOpen(true);
                  }}><Edit2 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive transition-all" onClick={(e) => { e.stopPropagation(); remove(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </button>
              {isOpen && <div className="p-4 pt-0 border-t border-border/30 bg-accent/5"><RodentSizeMatrix rules={rs} /></div>}
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
