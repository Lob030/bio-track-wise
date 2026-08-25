import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toUserFriendlyError } from "@/lib/errors";
import { useTransactionRequest } from "@/hooks/use-transaction-request";

export const Route = createFileRoute("/reproduction")({
  head: () => ({
    meta: [
      { title: "Reproduccion - BioTrack" },
      { name: "description", content: "Registro de eventos reproductivos del bioterio." },
    ],
  }),
  component: ReproductionPage,
});

const EVENT_LABELS: Record<string, string> = {
  mating: "Apareamiento",
  separation: "Separacion",
  gestation_confirmed: "Gestacion confirmada",
  birth: "Nacimiento",
  hatch: "Eclosion",
  failed: "Evento fallido",
};

function ReproductionPage() {
  const queryClient = useQueryClient();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    event_type: "mating",
    primary_lot_id: "",
    secondary_lot_id: "none",
    offspring_lot_id: "none",
    event_at: new Date().toISOString().slice(0, 16),
    quantity: "",
    mass_grams: "",
    cause: "",
    observations: "",
    evidence_url: "",
    reference_id: "",
  });

  const { data: lots } = useQuery({
    queryKey: ["lots", "reproduction"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id, lot_code, kind, lot_type, status, species_id, line_id, box_id")
        .order("lot_code");
      if (error) throw error;
      return data;
    },
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["reproduction-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reproduction_events")
        .select("*")
        .order("event_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const breederLots = useMemo(
    () => (lots ?? []).filter((lot) => lot.status === "active" && lot.lot_type === "breeder"),
    [lots],
  );
  const primary = breederLots.find((lot) => lot.id === form.primary_lot_id);
  const compatibleSecondary = breederLots.filter(
    (lot) =>
      lot.id !== primary?.id &&
      lot.kind === primary?.kind &&
      lot.species_id === primary?.species_id &&
      lot.line_id === primary?.line_id,
  );
  const compatibleOffspring = (lots ?? []).filter(
    (lot) =>
      lot.id !== primary?.id &&
      lot.kind === primary?.kind &&
      lot.species_id === primary?.species_id &&
      lot.line_id === primary?.line_id,
  );

  const lotLabel = (id: string) => {
    const lot = lots?.find((item) => item.id === id);
    return lot?.lot_code ?? id.slice(0, 8);
  };

  const submit = async () => {
    if (!primary) return toast.error("Selecciona un lote reproductor principal");
    if (
      form.event_type === "mating" &&
      primary.kind === "rodent" &&
      form.secondary_lot_id === "none"
    ) {
      return toast.error("El apareamiento de roedores requiere dos lotes reproductores");
    }
    if (form.evidence_url && !/^https?:\/\//i.test(form.evidence_url)) {
      return toast.error("La evidencia debe ser una URL http o https valida");
    }

    setSubmitting(true);
    const operation = "reproduction:create";
    try {
      const { error } = await supabase.rpc("register_reproduction_event_tx", {
        _request_id: getRequestId(operation),
        _event_type: form.event_type as
          | "mating"
          | "separation"
          | "gestation_confirmed"
          | "birth"
          | "hatch"
          | "failed",
        _primary_lot_id: primary.id,
        _secondary_lot_id: form.secondary_lot_id === "none" ? null : form.secondary_lot_id,
        _offspring_lot_id: form.offspring_lot_id === "none" ? null : form.offspring_lot_id,
        _event_at: new Date(form.event_at).toISOString(),
        _quantity: form.quantity ? Number(form.quantity) : null,
        _mass_grams: form.mass_grams ? Number(form.mass_grams) : null,
        _cause: form.cause || null,
        _observations: form.observations || null,
        _evidence_url: form.evidence_url || null,
        _reference_type: form.reference_id ? "external" : null,
        _reference_id: form.reference_id || null,
      });
      if (error) throw error;
      resetRequestId(operation);
      toast.success("Evento reproductivo registrado");
      setForm((current) => ({
        ...current,
        secondary_lot_id: "none",
        offspring_lot_id: "none",
        quantity: "",
        mass_grams: "",
        cause: "",
        observations: "",
        evidence_url: "",
        reference_id: "",
      }));
      await queryClient.invalidateQueries({ queryKey: ["reproduction-events"] });
    } catch (error) {
      toast.error(toUserFriendlyError(error, "No se pudo registrar el evento reproductivo"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="Reproduccion"
      subtitle="Apareamientos, resultados y descendencia de lotes reproductores."
      icon={<Activity className="h-6 w-6" />}
    >
      <div className="space-y-6">
        <section className="border-y border-border/50 py-5">
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Evento</Label>
              <Select
                value={form.event_type}
                onValueChange={(event_type) => setForm({ ...form, event_type })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lote principal</Label>
              <Select
                value={form.primary_lot_id}
                onValueChange={(primary_lot_id) =>
                  setForm({
                    ...form,
                    primary_lot_id,
                    secondary_lot_id: "none",
                    offspring_lot_id: "none",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {breederLots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lotLabel(lot.id)} - {lot.kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Segundo reproductor</Label>
              <Select
                value={form.secondary_lot_id}
                onValueChange={(secondary_lot_id) => setForm({ ...form, secondary_lot_id })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No aplica</SelectItem>
                  {compatibleSecondary.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lotLabel(lot.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha efectiva</Label>
              <Input
                type="datetime-local"
                value={form.event_at}
                max={new Date().toISOString().slice(0, 16)}
                onChange={(event) => setForm({ ...form, event_at: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Lote descendiente</Label>
              <Select
                value={form.offspring_lot_id}
                onValueChange={(offspring_lot_id) => setForm({ ...form, offspring_lot_id })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pendiente o no aplica</SelectItem>
                  {compatibleOffspring.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lotLabel(lot.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Biomasa (g)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.mass_grams}
                onChange={(event) => setForm({ ...form, mass_grams: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Causa o resultado</Label>
              <Input
                value={form.cause}
                onChange={(event) => setForm({ ...form, cause: event.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Observaciones</Label>
              <Textarea
                value={form.observations}
                onChange={(event) => setForm({ ...form, observations: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Evidencia (URL)</Label>
              <Input
                type="url"
                value={form.evidence_url}
                onChange={(event) => setForm({ ...form, evidence_url: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Referencia externa</Label>
              <Input
                value={form.reference_id}
                onChange={(event) => setForm({ ...form, reference_id: event.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={submitting}>
              <Plus className="h-4 w-4" /> Registrar evento
            </Button>
          </div>
        </section>

        <section className="overflow-x-auto border border-border/50 rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-accent/20 text-muted-foreground">
              <tr>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">Evento</th>
                <th className="text-left p-3">Principal</th>
                <th className="text-left p-3">Segundo / descendiente</th>
                <th className="text-left p-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Cargando eventos...
                  </td>
                </tr>
              ) : !events?.length ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Sin eventos reproductivos.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td className="p-3 whitespace-nowrap">
                      {new Date(event.event_at).toLocaleString("es-MX")}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">
                        {EVENT_LABELS[event.event_type] ?? event.event_type}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono">{lotLabel(event.primary_lot_id)}</td>
                    <td className="p-3 font-mono">
                      {event.secondary_lot_id
                        ? lotLabel(event.secondary_lot_id)
                        : event.offspring_lot_id
                          ? lotLabel(event.offspring_lot_id)
                          : "-"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {event.cause ?? event.observations ?? "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </PageShell>
  );
}
