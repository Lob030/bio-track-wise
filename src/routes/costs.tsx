import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, CircleDollarSign, Factory, Plus, Utensils } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTransactionRequest } from "@/hooks/use-transaction-request";
import { allocateCostByWeight, monthlyStraightLineDepreciation } from "@/lib/cost-allocation";
import { toUserFriendlyError } from "@/lib/errors";
import { PageShell } from "@/components/page-shell";
import { AdminOnly } from "@/components/role-gate";
import { TierGate } from "@/components/tier-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/costs")({
  head: () => ({ meta: [{ title: "Costos y rentabilidad — BioTrack" }] }),
  component: () => (
    <AdminOnly
      fallback={
        <PageShell title="Acceso restringido" subtitle="Solo administradores pueden ver costos.">
          <Card className="p-6 text-sm text-muted-foreground">
            Tu rol no tiene acceso a la información financiera del bioterio.
          </Card>
        </PageShell>
      }
    >
      <TierGate min="gold" module="Costos">
        <CostsPage />
      </TierGate>
    </AdminOnly>
  ),
});

type CostLot = {
  id: string;
  lot_code: string | null;
  kind: "rodent" | "insect";
  males: number;
  females: number;
  unsexed: number;
  mass_grams: number;
  started_at: string;
};

const currency = (value: number) =>
  value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const firstOfMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

const CATEGORY_LABELS: Record<string, string> = {
  labor: "Mano de obra",
  veterinary: "Veterinaria y medicamentos",
  cleaning: "Limpieza y desinfección",
  utilities: "Agua, energía y climatización",
  packaging: "Empaque",
  transport: "Transporte",
  other: "Otro",
};

function CostsPage() {
  const { data: lots = [] } = useQuery({
    queryKey: ["costs", "active-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id,lot_code,kind,males,females,unsexed,mass_grams,started_at")
        .eq("status", "active")
        .order("started_at");
      if (error) throw error;
      return data as CostLot[];
    },
  });

  return (
    <PageShell
      title="Costos y rentabilidad"
      subtitle="Costo real consumido, inventario vivo y margen por lote."
      icon={<CircleDollarSign className="h-6 w-6" />}
    >
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="cost">Registrar costo</TabsTrigger>
          <TabsTrigger value="feed">Alimento</TabsTrigger>
          <TabsTrigger value="assets">Activos</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <FinancialSummary />
        </TabsContent>
        <TabsContent value="cost">
          <ManualCostForm lots={lots} />
        </TabsContent>
        <TabsContent value="feed">
          <FeedConsumptionForm lots={lots} />
        </TabsContent>
        <TabsContent value="assets">
          <AssetsPanel lots={lots} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function FinancialSummary() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["lot-financial-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lot_financial_summary")
        .select("*")
        .order("lot_code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const totals = useMemo(
    () =>
      data.reduce(
        (result, row) => ({
          cost: result.cost + Number(row.total_cost ?? 0),
          revenue: result.revenue + Number(row.revenue ?? 0),
          cogs: result.cogs + Number(row.recognized_cogs ?? 0),
          inventory: result.inventory + Number(row.inventory_value ?? 0),
          mortality: result.mortality + Number(row.mortality_loss ?? 0),
          margin: result.margin + Number(row.gross_margin ?? 0),
        }),
        { cost: 0, revenue: 0, cogs: 0, inventory: 0, mortality: 0, margin: 0 },
      ),
    [data],
  );

  if (isLoading)
    return <p className="py-12 text-center text-sm text-muted-foreground">Calculando costos…</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Metric label="Costo acumulado" value={currency(totals.cost)} />
        <Metric label="Ingresos" value={currency(totals.revenue)} />
        <Metric label="Costo vendido" value={currency(totals.cogs)} />
        <Metric label="Inventario vivo" value={currency(totals.inventory)} />
        <Metric
          label="Pérdida mortalidad"
          value={currency(totals.mortality)}
          danger={totals.mortality > 0}
        />
        <Metric label="Margen bruto" value={currency(totals.margin)} danger={totals.margin < 0} />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lote</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Costo/u</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead className="text-right">Mortalidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.lot_id}>
                <TableCell className="font-medium">
                  {row.lot_code || row.lot_id?.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.kind === "rodent" ? "Roedor" : "Insecto"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {currency(Number(row.total_cost ?? 0))}
                </TableCell>
                <TableCell className="text-right">
                  {currency(Number(row.cost_per_unit ?? 0))}
                </TableCell>
                <TableCell className="text-right">{currency(Number(row.revenue ?? 0))}</TableCell>
                <TableCell
                  className={`text-right font-semibold ${Number(row.gross_margin ?? 0) < 0 ? "text-destructive" : "text-emerald-500"}`}
                >
                  {currency(Number(row.gross_margin ?? 0))}
                </TableCell>
                <TableCell className="text-right">
                  {currency(Number(row.mortality_loss ?? 0))}
                </TableCell>
              </TableRow>
            ))}
            {!data.length && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No hay costos asignados todavía.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${danger ? "text-destructive" : ""}`}>{value}</p>
    </Card>
  );
}

function ManualCostForm({ lots }: { lots: CostLot[] }) {
  const qc = useQueryClient();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({
    category: "labor",
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    vendor: "",
    reference: "",
    notes: "",
    evidence: "",
    basis: "equal",
  });

  const submit = async () => {
    const amount = Number(form.amount);
    if (!form.description.trim() || amount <= 0 || !selected.length)
      return toast.error("Indica descripción, monto y al menos un lote.");
    const weighted = selected.map((id) => ({
      lot_id: id,
      weight: weightFor(lots.find((lot) => lot.id === id)!, form.basis),
    }));
    if (weighted.some((item) => item.weight <= 0))
      return toast.error("La base seleccionada no aplica a uno de los lotes.");
    setSaving(true);
    const operation = "cost:manual";
    try {
      const { error } = await supabase.rpc("register_lot_cost_tx", {
        _request_id: getRequestId(operation),
        _category: form.category,
        _description: form.description.trim(),
        _total_amount: amount,
        _allocations: allocateCostByWeight(amount, weighted),
        _allocation_basis: form.basis,
        _incurred_at: new Date(`${form.date}T12:00:00`).toISOString(),
        _vendor: form.vendor.trim() || null,
        _reference_type: form.reference ? "document" : null,
        _reference_id: form.reference.trim() || null,
        _notes: form.notes.trim() || null,
        _evidence_url: form.evidence.trim() || null,
      });
      if (error) throw error;
      resetRequestId(operation);
      setForm({
        category: "labor",
        description: "",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        vendor: "",
        reference: "",
        notes: "",
        evidence: "",
        basis: "equal",
      });
      setSelected([]);
      await qc.invalidateQueries({ queryKey: ["lot-financial-summary"] });
      toast.success("Costo registrado y distribuido.");
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoría">
            <Select
              value={form.category}
              onValueChange={(category) => setForm({ ...form, category })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Monto total *">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Descripción *">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Fecha">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Proveedor / responsable">
            <Input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </Field>
          <Field label="Factura / referencia">
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Evidencia URL">
          <Input
            type="url"
            value={form.evidence}
            onChange={(e) => setForm({ ...form, evidence: e.target.value })}
          />
        </Field>
        <Field label="Notas">
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </div>
      <div className="space-y-4">
        <AllocationSelector
          lots={lots}
          selected={selected}
          onChange={setSelected}
          basis={form.basis}
          onBasisChange={(basis) => setForm({ ...form, basis })}
        />
        <Button onClick={submit} disabled={saving}>
          <Plus className="mr-2 h-4 w-4" />
          {saving ? "Registrando…" : "Registrar costo"}
        </Button>
      </div>
    </div>
  );
}

function FeedConsumptionForm({ lots }: { lots: CostLot[] }) {
  const qc = useQueryClient();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [form, setForm] = useState({ foodId: "", lotId: "", grams: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const { data: food = [] } = useQuery({
    queryKey: ["warehouse_food"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_food")
        .select("id,name,quantity_grams,unit_cost")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const selectedFood = food.find((item) => item.id === form.foodId);
  const estimated = (Number(form.grams || 0) * Number(selectedFood?.unit_cost ?? 0)) / 1000;

  const submit = async () => {
    if (!form.foodId || !form.lotId || Number(form.grams) <= 0)
      return toast.error("Selecciona alimento, lote y gramos.");
    setSaving(true);
    const operation = "feed:consume";
    try {
      const { error } = await supabase.rpc("consume_feed_tx", {
        _request_id: getRequestId(operation),
        _food_id: form.foodId,
        _allocations: [{ lot_id: form.lotId, grams: Number(form.grams) }],
        _observations: form.notes.trim() || null,
      });
      if (error) throw error;
      resetRequestId(operation);
      setForm({ foodId: "", lotId: "", grams: "", notes: "" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["warehouse_food"] }),
        qc.invalidateQueries({ queryKey: ["lot-financial-summary"] }),
      ]);
      toast.success("Consumo y costo de alimento registrados.");
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Field label="Alimento">
          <Select value={form.foodId} onValueChange={(foodId) => setForm({ ...form, foodId })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {food.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} · {Number(item.quantity_grams).toLocaleString()} g
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Lote">
          <Select value={form.lotId} onValueChange={(lotId) => setForm({ ...form, lotId })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {lots.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {lot.lot_code || lot.id.slice(0, 8)} ·{" "}
                  {lot.kind === "rodent" ? "roedor" : "insecto"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Consumo (g)">
          <Input
            type="number"
            min="0"
            value={form.grams}
            onChange={(e) => setForm({ ...form, grams: e.target.value })}
          />
        </Field>
        <Field label="Observaciones">
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <Button onClick={submit} disabled={saving}>
          <Utensils className="mr-2 h-4 w-4" />
          Registrar consumo
        </Button>
      </div>
      <div className="space-y-3">
        <Metric
          label="Stock disponible"
          value={`${Number(selectedFood?.quantity_grams ?? 0).toLocaleString()} g`}
        />
        <Metric label="Costo estimado" value={currency(estimated)} />
        <p className="text-sm text-muted-foreground">
          El descuento de almacén, evento de consumo y costo del lote se guardan en una sola
          transacción.
        </p>
      </div>
    </div>
  );
}

function AssetsPanel({ lots }: { lots: CostLot[] }) {
  const qc = useQueryClient();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [selected, setSelected] = useState<string[]>([]);
  const [assetId, setAssetId] = useState("");
  const [period, setPeriod] = useState(firstOfMonth());
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "equipment",
    cost: "",
    residual: "0",
    months: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const { data: assets = [] } = useQuery({
    queryKey: ["cost-assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_assets")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const chosen = assets.find((asset) => asset.id === assetId);
  const monthly = chosen
    ? monthlyStraightLineDepreciation(
        Number(chosen.acquisition_cost),
        Number(chosen.residual_value),
        chosen.useful_life_months,
      )
    : 0;

  const createAsset = async () => {
    if (
      !form.code.trim() ||
      !form.name.trim() ||
      Number(form.cost) <= 0 ||
      Number(form.months) <= 0
    )
      return toast.error("Completa código, nombre, costo y vida útil.");
    const { error } = await supabase.from("cost_assets").insert({
      code: form.code.trim(),
      name: form.name.trim(),
      asset_type: form.type,
      acquisition_cost: Number(form.cost),
      residual_value: Number(form.residual || 0),
      useful_life_months: Number(form.months),
      in_service_date: form.date,
      notes: form.notes.trim() || null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    setForm({
      code: "",
      name: "",
      type: "equipment",
      cost: "",
      residual: "0",
      months: "",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    await qc.invalidateQueries({ queryKey: ["cost-assets"] });
    toast.success("Activo registrado.");
  };
  const post = async () => {
    if (!chosen || !selected.length) return toast.error("Selecciona activo y lotes.");
    const operation = `asset:depreciate:${chosen.id}:${period}`;
    try {
      const allocations = allocateCostByWeight(
        monthly,
        selected.map((lot_id) => ({ lot_id, weight: 1 })),
      );
      const { error } = await supabase.rpc("post_asset_depreciation_tx", {
        _request_id: getRequestId(operation),
        _asset_id: chosen.id,
        _period_start: period,
        _allocations: allocations,
        _allocation_basis: "equal",
      });
      if (error) throw error;
      resetRequestId(operation);
      setSelected([]);
      await qc.invalidateQueries({ queryKey: ["lot-financial-summary"] });
      toast.success("Depreciación contabilizada.");
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Código">
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Tipo">
          <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="box">Caja</SelectItem>
              <SelectItem value="equipment">Equipo</SelectItem>
              <SelectItem value="facility">Instalación</SelectItem>
              <SelectItem value="vehicle">Vehículo</SelectItem>
              <SelectItem value="other">Otro</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Costo de adquisición">
          <Input
            type="number"
            min="0"
            value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
          />
        </Field>
        <Field label="Valor residual">
          <Input
            type="number"
            min="0"
            value={form.residual}
            onChange={(e) => setForm({ ...form, residual: e.target.value })}
          />
        </Field>
        <Field label="Vida útil (meses)">
          <Input
            type="number"
            min="1"
            value={form.months}
            onChange={(e) => setForm({ ...form, months: e.target.value })}
          />
        </Field>
        <Field label="En servicio desde">
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </Field>
        <Button className="self-end" onClick={createAsset}>
          <Factory className="mr-2 h-4 w-4" />
          Registrar activo
        </Button>
      </div>
      <div className="border-t pt-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Activo">
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.code} · {asset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Periodo">
              <Input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </Field>
            <Metric label="Depreciación mensual" value={currency(monthly)} />
          </div>
          <div className="space-y-4">
            <AllocationSelector
              lots={lots}
              selected={selected}
              onChange={setSelected}
              basis="equal"
              onBasisChange={() => undefined}
              hideBasis
            />
            <Button onClick={post}>
              <Calculator className="mr-2 h-4 w-4" />
              Contabilizar mes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AllocationSelector({
  lots,
  selected,
  onChange,
  basis,
  onBasisChange,
  hideBasis = false,
}: {
  lots: CostLot[];
  selected: string[];
  onChange: (ids: string[]) => void;
  basis: string;
  onBasisChange: (basis: string) => void;
  hideBasis?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Label>Lotes que absorben el costo</Label>
          <p className="text-xs text-muted-foreground">Selecciona uno o varios lotes activos.</p>
        </div>
        {!hideBasis && (
          <div className="w-44">
            <Select value={basis} onValueChange={onBasisChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equal">Partes iguales</SelectItem>
                <SelectItem value="population">Por población</SelectItem>
                <SelectItem value="biomass">Por biomasa</SelectItem>
                <SelectItem value="active_days">Por días activos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
        {lots.map((lot) => (
          <label
            key={lot.id}
            className="flex cursor-pointer items-center gap-3 p-3 text-sm hover:bg-muted/40"
          >
            <Checkbox
              checked={selected.includes(lot.id)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...selected, lot.id] : selected.filter((id) => id !== lot.id))
              }
            />
            <span className="flex-1 font-medium">{lot.lot_code || lot.id.slice(0, 8)}</span>
            <span className="text-xs text-muted-foreground">
              {lot.kind === "rodent"
                ? `${lot.males + lot.females + lot.unsexed} animales`
                : `${lot.mass_grams} g`}
            </span>
          </label>
        ))}
        {!lots.length && <p className="p-4 text-sm text-muted-foreground">No hay lotes activos.</p>}
      </div>
    </div>
  );
}

function weightFor(lot: CostLot, basis: string) {
  if (basis === "population")
    return lot.kind === "rodent" ? lot.males + lot.females + lot.unsexed : 0;
  if (basis === "biomass") return lot.kind === "insect" ? lot.mass_grams : 0;
  if (basis === "active_days")
    return Math.max(1, Math.floor((Date.now() - new Date(lot.started_at).getTime()) / 86_400_000));
  return 1;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
