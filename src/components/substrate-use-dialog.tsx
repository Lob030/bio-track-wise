import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTransactionRequest } from "@/hooks/use-transaction-request";
import { toUserFriendlyError } from "@/lib/errors";
import { recommendedSubstrateGrams, substrateUsageCost } from "@/lib/substrate-cost";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";

type BoxSummary = { id: string; code: string; box_type_id: string | null };
type LotSummary = { id: string; lot_code: string | null };

export function SubstrateUseDialog({
  box,
  lots,
  disabled = false,
}: {
  box: BoxSummary;
  lots: LotSummary[];
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    substrate_id: "",
    event_type: "setup" as "setup" | "replacement",
    grams: "",
    lot_id: "none",
    observations: "",
    evidence_url: "",
  });

  const { data: substrates = [] } = useQuery({
    queryKey: ["substrates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("substrates")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: rules = [] } = useQuery({
    queryKey: ["box-substrate-rules", box.box_type_id],
    queryFn: async () => {
      if (!box.box_type_id) return [];
      const { data, error } = await supabase
        .from("box_substrate_rules")
        .select("*")
        .eq("box_type_id", box.box_type_id);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const rule = useMemo(
    () => rules.find((item) => item.substrate_id === form.substrate_id),
    [form.substrate_id, rules],
  );
  const selectedSubstrate = substrates.find((item) => item.id === form.substrate_id);
  const estimatedCost =
    Number(form.grams) > 0 && selectedSubstrate
      ? substrateUsageCost(Number(form.grams), Number(selectedSubstrate.average_cost_per_kg))
      : 0;

  useEffect(() => {
    if (!open || !rules.length || form.substrate_id) return;
    const firstRule = rules[0];
    setForm((current) => ({
      ...current,
      substrate_id: firstRule.substrate_id,
      grams: String(recommendedSubstrateGrams(current.event_type, firstRule) ?? ""),
    }));
  }, [form.substrate_id, open, rules]);

  const setEventType = (eventType: "setup" | "replacement") => {
    setForm((current) => ({
      ...current,
      event_type: eventType,
      grams: String(recommendedSubstrateGrams(eventType, rule) ?? current.grams),
    }));
  };

  const setSubstrate = (substrateId: string) => {
    const nextRule = rules.find((item) => item.substrate_id === substrateId);
    setForm((current) => ({
      ...current,
      substrate_id: substrateId,
      grams: String(recommendedSubstrateGrams(current.event_type, nextRule) ?? ""),
    }));
  };

  const submit = async () => {
    if (!form.substrate_id || Number(form.grams) <= 0) {
      toast.error("Selecciona el sustrato e indica una cantidad mayor a cero.");
      return;
    }
    setSaving(true);
    const operation = `substrate:consume:${box.id}`;
    try {
      const { data, error } = await supabase.rpc("consume_box_substrate_tx", {
        _request_id: getRequestId(operation),
        _box_id: box.id,
        _substrate_id: form.substrate_id,
        _event_type: form.event_type,
        _grams: Number(form.grams),
        _lot_id: form.lot_id === "none" ? null : form.lot_id,
        _event_at: new Date().toISOString(),
        _observations: form.observations.trim() || null,
        _evidence_url: form.evidence_url.trim() || null,
      });
      if (error) throw error;
      resetRequestId(operation);
      const result = data as { cost?: number } | null;
      toast.success(
        `Consumo registrado. Costo histórico: $${Number(result?.cost ?? estimatedCost).toFixed(2)}`,
      );
      setOpen(false);
      setForm({
        substrate_id: "",
        event_type: "setup",
        grams: "",
        lot_id: "none",
        observations: "",
        evidence_url: "",
      });
      await qc.invalidateQueries({ queryKey: ["substrates"] });
      await qc.invalidateQueries({ queryKey: ["substrate-events"] });
      await qc.invalidateQueries({ queryKey: ["lot-production-costs"] });
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={disabled}>
          <Layers3 className="mr-1.5 h-3.5 w-3.5" /> Sustrato
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar sustrato · {box.code}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Operación</Label>
              <Select
                value={form.event_type}
                onValueChange={(value) => setEventType(value as "setup" | "replacement")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setup">Preparación</SelectItem>
                  <SelectItem value="replacement">Reposición</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sustrato</Label>
              <Select value={form.substrate_id} onValueChange={setSubstrate}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {substrates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {Number(item.stock_grams).toLocaleString()} g
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cantidad usada (g)</Label>
              <Input
                type="number"
                min="0"
                value={form.grams}
                onChange={(e) => setForm({ ...form, grams: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lote que absorbe el costo</Label>
              <Select
                value={form.lot_id}
                onValueChange={(value) => setForm({ ...form, lot_id: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar a lote</SelectItem>
                  {lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.lot_code || lot.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Costo estimado: </span>
            <strong>${estimatedCost.toFixed(2)}</strong>
            {rule?.replacement_interval_days && form.event_type === "replacement" ? (
              <span className="ml-2 text-xs text-muted-foreground">
                Frecuencia recomendada: {rule.replacement_interval_days} días
              </span>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea
              value={form.observations}
              onChange={(e) => setForm({ ...form, observations: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Evidencia (URL opcional)</Label>
            <Input
              type="url"
              value={form.evidence_url}
              onChange={(e) => setForm({ ...form, evidence_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Registrando..." : "Registrar consumo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
