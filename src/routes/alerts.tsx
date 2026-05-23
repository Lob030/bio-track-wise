import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Bell, Plus, Trash2, Check, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/alerts")({ component: Page });

type RuleForm = {
  scope: "all" | "lot";
  lot_id: string;
  lot_type: "birth" | "engorda" | "breeder";
  metric: "age_days" | "days_active" | "weight";
  operator: ">" | "<" | "=";
  threshold: number;
  priority: "high" | "medium";
  frequency: "once" | "recurrent";
  frequency_days: number;
  animal_kind: "rodent" | "insect" | "both";
  species_id: string;
};

const METRIC_LABEL: Record<string, string> = { age_days: "edad en días", days_active: "días activo", weight: "peso" };
const TYPE_LABEL: Record<string, string> = { birth: "nacimiento", engorda: "engorda", breeder: "reproductor" };
const SCOPE_LABEL: Record<string, string> = { all: "todos los lotes", lot: "el lote específico" };

const DEFAULT_FORM: RuleForm = {
  scope: "all", lot_id: "", lot_type: "engorda", metric: "age_days",
  operator: ">", threshold: 21, priority: "medium", frequency: "once", frequency_days: 0,
  animal_kind: "both", species_id: "",
};

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RuleForm>(DEFAULT_FORM);

  const { data: rules } = useQuery({
    queryKey: ["alert_rules"],
    queryFn: async () => (await supabase.from("alert_rules").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => (await supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });
  const { data: lots } = useQuery({
    queryKey: ["lots", "all", "min"],
    queryFn: async () => (await supabase.from("lots").select("id,lot_code,kind,lot_type,species_id").eq("status", "active")).data ?? [],
  });
  const { data: species } = useQuery({
    queryKey: ["species"],
    queryFn: async () => (await supabase.from("species").select("id,name,kind")).data ?? [],
  });

  const handleAnimalKindChange = (kind: "rodent" | "insect" | "both") => {
    setForm((prev) => ({
      ...prev,
      animal_kind: kind,
      species_id: "",
      lot_id: "",
    }));
  };

  const handleSpeciesChange = (spId: string) => {
    setForm((prev) => ({
      ...prev,
      species_id: spId,
      lot_id: "",
    }));
  };

  const handleScopeChange = (scope: "all" | "lot") => {
    setForm((prev) => ({
      ...prev,
      scope,
      lot_id: "",
    }));
  };

  const filteredLots = useMemo(() => {
    const activeLots = lots ?? [];
    if (form.animal_kind !== "both" && form.species_id) {
      return activeLots.filter((l: any) => l.species_id === form.species_id);
    }
    if (form.animal_kind === "rodent") {
      return activeLots.filter((l: any) => l.kind === "rodent");
    }
    if (form.animal_kind === "insect") {
      return activeLots.filter((l: any) => l.kind === "insect");
    }
    return activeLots;
  }, [lots, form.animal_kind, form.species_id]);

  const template = useMemo(() => {
    const selectedSpecies = species?.find((s: any) => s.id === form.species_id);
    const speciesName = selectedSpecies ? selectedSpecies.name : "";

    let animalDesc = "";
    if (form.animal_kind === "both") {
      animalDesc = "Todos los animales (Roedores e Insectos)";
    } else if (form.animal_kind === "rodent") {
      if (!form.species_id) {
        animalDesc = "Todos los roedores (Todas las especies)";
      } else {
        animalDesc = `Roedores de la especie ${speciesName || "desconocida"}`;
      }
    } else if (form.animal_kind === "insect") {
      if (!form.species_id) {
        animalDesc = "Todos los insectos (Todas las especies)";
      } else {
        animalDesc = `Insectos de la especie ${speciesName || "desconocida"}`;
      }
    }

    const selectedLot = lots?.find((l: any) => l.id === form.lot_id);
    const lotLabel = selectedLot ? selectedLot.lot_code : form.lot_id;

    const scopeText = form.scope === "all"
      ? `${animalDesc} de tipo ${TYPE_LABEL[form.lot_type] || form.lot_type}`
      : `El lote específico ${lotLabel || "desconocido"} (${animalDesc}) de tipo ${TYPE_LABEL[form.lot_type] || form.lot_type}`;

    return `${scopeText}: ${METRIC_LABEL[form.metric] || form.metric} ${form.operator} ${form.threshold}`;
  }, [form, species, lots]);

  const submit = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("alert_rules").insert({
      owner_id: u.user.id,
      scope: form.scope,
      lot_id: form.scope === "lot" ? form.lot_id || null : null,
      lot_type: form.lot_type,
      metric: form.metric,
      operator: form.operator,
      threshold: form.threshold,
      priority: form.priority,
      frequency_days: form.frequency === "once" ? 0 : form.frequency_days,
      template_text: template,
      animal_kind: form.animal_kind,
      species_id: form.animal_kind !== "both" && form.species_id ? form.species_id : null,
    });
    if (error) return toast.error(error.message);
    toast.success("Regla creada");
    setOpen(false); setForm(DEFAULT_FORM);
    qc.invalidateQueries({ queryKey: ["alert_rules"] });
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await supabase.from("alert_rules").update({ enabled }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alert_rules"] });
  };
  const deleteRule = async (id: string) => {
    await supabase.from("alert_rules").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["alert_rules"] });
  };
  const ack = async (id: string) => {
    await supabase.from("alerts").update({ acknowledged: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alerts"] });
  };

  return (
    <PageShell
      title="Alertas"
      subtitle="Motor IF/THEN con generador visual tipo 'completa la oración' y vista previa en vivo."
      icon={<Bell className="h-6 w-6" />}
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nueva Regla de Alerta</Button></DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>Construye tu regla</DialogTitle></DialogHeader>
            <div className="grid lg:grid-cols-[1fr_320px] gap-4">
              <div className="space-y-3">
                <Card className="p-4 border-border bg-card/40">
                  <p className="text-xs uppercase text-muted-foreground mb-3">Completa la oración</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm leading-loose">
                    <Pill>SI la categoría es</Pill>
                    <PillSelect value={form.animal_kind} onChange={(v) => handleAnimalKindChange(v as any)}
                      options={[{ v: "both", l: "Ambos (Roedores e Insectos)" }, { v: "rodent", l: "Roedores" }, { v: "insect", l: "Insectos" }]} />

                    {form.animal_kind !== "both" && (
                      <>
                        <Pill>y de la especie</Pill>
                        <PillSelect value={form.species_id} onChange={handleSpeciesChange}
                          options={[
                            { v: "", l: form.animal_kind === "rodent" ? "Todas las especies de roedores" : "Todas las especies de insectos" },
                            ...(species ?? []).filter((s: any) => s.kind === form.animal_kind).map((s: any) => ({ v: s.id, l: s.name }))
                          ]} />
                      </>
                    )}

                    <Pill>para</Pill>
                    <PillSelect value={form.scope} onChange={(v) => handleScopeChange(v as any)}
                      options={[{ v: "all", l: "todos los lotes" }, { v: "lot", l: "un lote específico" }]} />

                    {form.scope === "lot" && (
                      <PillSelect value={form.lot_id} onChange={(v) => setForm({ ...form, lot_id: v })}
                        options={filteredLots.map((l: any) => ({ v: l.id, l: l.lot_code ?? l.id.slice(0, 8) }))} placeholder="elige lote" />
                    )}

                    <Pill>de tipo</Pill>
                    <PillSelect value={form.lot_type} onChange={(v) => setForm({ ...form, lot_type: v as any })}
                      options={[{ v: "birth", l: "nacimiento" }, { v: "engorda", l: "engorda" }, { v: "breeder", l: "reproductor" }]} />
                    <Pill>cumple condición</Pill>
                    <PillSelect value={form.metric} onChange={(v) => setForm({ ...form, metric: v as any })}
                      options={[{ v: "age_days", l: "edad en días" }, { v: "days_active", l: "días activo" }, { v: "weight", l: "peso" }]} />
                    <PillSelect value={form.operator} onChange={(v) => setForm({ ...form, operator: v as any })}
                      options={[{ v: ">", l: ">" }, { v: "<", l: "<" }, { v: "=", l: "=" }]} />
                    <Input type="number" className="h-7 w-20 inline-flex" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: +e.target.value })} />
                    <Pill>ENTONCES</Pill>
                    <Pill>generar alerta con prioridad</Pill>
                    <PillSelect value={form.priority} onChange={(v) => setForm({ ...form, priority: v as any })}
                      options={[{ v: "high", l: "Alta (Rojo)" }, { v: "medium", l: "Media (Ámbar)" }]} />
                    <Pill>y frecuencia</Pill>
                    <PillSelect value={form.frequency} onChange={(v) => setForm({ ...form, frequency: v as any })}
                      options={[{ v: "once", l: "una sola vez" }, { v: "recurrent", l: "recurrente cada X días" }]} />
                    {form.frequency === "recurrent" && (
                      <>
                        <Input type="number" className="h-7 w-20 inline-flex" value={form.frequency_days} onChange={(e) => setForm({ ...form, frequency_days: +e.target.value })} />
                        <Pill>días</Pill>
                      </>
                    )}
                  </div>
                </Card>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Vista previa</Label>
                <AlertPreview priority={form.priority} text={template} frequency={form.frequency === "once" ? "Una sola vez" : `Cada ${form.frequency_days} días`} />
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Crear regla</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Reglas configuradas</h2>
          <div className="space-y-2">
            {(rules ?? []).length === 0 && <Card className="p-8 text-center text-muted-foreground border-dashed">Aún no hay reglas.</Card>}
            {(rules ?? []).map((r) => (
              <Card key={r.id} className="p-3 border-border bg-card/60 flex items-center gap-3">
                <AlertDot priority={r.priority as any} />
                <div className="flex-1">
                  <div className="text-sm">{r.template_text}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {r.frequency_days > 0 ? `Recurrente cada ${r.frequency_days} días` : "Una sola vez"} · prioridad {r.priority}
                  </div>
                </div>
                <Switch checked={r.enabled} onCheckedChange={(v) => toggleEnabled(r.id, v)} />
                <Button size="icon" variant="ghost" onClick={() => deleteRule(r.id)}><Trash2 className="h-3 w-3" /></Button>
              </Card>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Alertas activas</h2>
          <div className="space-y-2">
            {(alerts ?? []).length === 0 && <Card className="p-8 text-center text-muted-foreground border-dashed">Sin alertas recientes.</Card>}
            {(alerts ?? []).map((a) => (
              <Card key={a.id} className="p-3 border-border bg-card/60 flex items-center gap-3">
                <AlertDot priority={a.priority as any} />
                <div className="flex-1">
                  <div className="text-sm">{a.message}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString("es-MX")}</div>
                </div>
                {a.acknowledged
                  ? <Badge variant="outline" className="text-[10px]">✓ vista</Badge>
                  : <Button size="sm" variant="ghost" onClick={() => ack(a.id)}><Check className="h-3 w-3 mr-1" />Marcar</Button>}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function PillSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-auto inline-flex gap-1 border-emerald-glow/40 bg-emerald-glow/10 text-emerald-glow font-medium">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function AlertDot({ priority }: { priority: "high" | "medium" | "low" }) {
  const color = priority === "high" ? "bg-destructive" : priority === "medium" ? "bg-warning" : "bg-info";
  return <span className={`h-2.5 w-2.5 rounded-full ${color} shrink-0`} />;
}

function AlertPreview({ priority, text, frequency }: { priority: "high" | "medium"; text: string; frequency: string }) {
  const ring = priority === "high" ? "border-destructive/50 bg-destructive/10" : "border-warning/50 bg-warning/10";
  const dotCol = priority === "high" ? "bg-destructive" : "bg-warning";
  return (
    <Card className={`p-4 border-2 ${ring}`}>
      <div className="flex items-start gap-3">
        <div className="relative mt-1">
          <span className={`absolute inset-0 ${dotCol} rounded-full animate-ping opacity-40`} />
          <span className={`relative block h-3 w-3 rounded-full ${dotCol}`} />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider mb-1 font-semibold">
            {priority === "high" ? "Alerta crítica" : "Alerta media"}
          </div>
          <div className="text-sm">{text}</div>
          <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <Power className="h-3 w-3" /> {frequency}
          </div>
        </div>
      </div>
    </Card>
  );
}
