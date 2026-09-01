import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, PackagePlus, Plus, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTransactionRequest } from "@/hooks/use-transaction-request";
import { toUserFriendlyError } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Kind = "rodent" | "insect";

const emptyTypeForm = {
  code: "",
  name: "",
  length_cm: "",
  width_cm: "",
  height_cm: "",
  material: "",
  capacity: "",
  life_stages: "",
  ventilation: "",
  lid_type: "",
  temperature_min_c: "",
  temperature_max_c: "",
  humidity_min_pct: "",
  humidity_max_pct: "",
  cleaning_interval_days: "",
  useful_life_days: "",
  substrate_id: "none",
  setup_grams: "",
  replacement_grams: "",
  replacement_interval_days: "",
  waste_pct: "0",
  notes: "",
};

const numericOrNull = (value: string) => (value.trim() ? Number(value) : null);

export function BoxCatalogDialog({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [typeForm, setTypeForm] = useState(emptyTypeForm);
  const [substrateForm, setSubstrateForm] = useState({
    code: "",
    name: "",
    minimum_stock_grams: "0",
    supplier: "",
    notes: "",
  });
  const [stockForm, setStockForm] = useState({
    substrate_id: "",
    grams: "",
    total_cost: "",
    reference_id: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: types = [] } = useQuery({
    queryKey: ["box-types", kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("box_types")
        .select("*")
        .eq("kind", kind)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: substrates = [] } = useQuery({
    queryKey: ["substrates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("substrates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: rules = [] } = useQuery({
    queryKey: ["box-substrate-rules", kind],
    queryFn: async () => {
      const { data, error } = await supabase.from("box_substrate_rules").select("*");
      if (error) throw error;
      return data;
    },
  });

  const saveType = async () => {
    const capacity = numericOrNull(typeForm.capacity);
    if (!typeForm.code.trim() || !typeForm.name.trim() || !capacity || capacity <= 0) {
      toast.error("Código, nombre y capacidad máxima son obligatorios.");
      return;
    }
    setSaving(true);
    const operation = `box-type:create:${kind}`;
    try {
      const setup = Number(typeForm.setup_grams || 0);
      const replacement = Number(typeForm.replacement_grams || 0);
      if (typeForm.substrate_id !== "none" && setup <= 0 && replacement <= 0) {
        throw new Error("Configura gramos de preparación o reposición.");
      }
      const { error } = await supabase.rpc("create_box_type_tx", {
        _request_id: getRequestId(operation),
        _data: {
          code: typeForm.code.trim(),
          name: typeForm.name.trim(),
          kind,
          length_cm: numericOrNull(typeForm.length_cm),
          width_cm: numericOrNull(typeForm.width_cm),
          height_cm: numericOrNull(typeForm.height_cm),
          material: typeForm.material.trim() || null,
          max_population: kind === "rodent" ? capacity : null,
          max_biomass_grams: kind === "insect" ? capacity : null,
          life_stages: typeForm.life_stages
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          ventilation: typeForm.ventilation.trim() || null,
          lid_type: typeForm.lid_type.trim() || null,
          temperature_min_c: numericOrNull(typeForm.temperature_min_c),
          temperature_max_c: numericOrNull(typeForm.temperature_max_c),
          humidity_min_pct: numericOrNull(typeForm.humidity_min_pct),
          humidity_max_pct: numericOrNull(typeForm.humidity_max_pct),
          cleaning_interval_days: numericOrNull(typeForm.cleaning_interval_days),
          useful_life_days: numericOrNull(typeForm.useful_life_days),
          notes: typeForm.notes.trim() || null,
          substrate_id: typeForm.substrate_id === "none" ? null : typeForm.substrate_id,
          setup_grams: setup,
          replacement_grams: replacement,
          replacement_interval_days: numericOrNull(typeForm.replacement_interval_days),
          waste_pct: Number(typeForm.waste_pct || 0),
        },
      });
      if (error) throw error;
      resetRequestId(operation);
      setTypeForm(emptyTypeForm);
      await qc.invalidateQueries({ queryKey: ["box-types", kind] });
      await qc.invalidateQueries({ queryKey: ["box-substrate-rules", kind] });
      toast.success("Tipo de caja registrado.");
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const saveSubstrate = async () => {
    if (!substrateForm.code.trim() || !substrateForm.name.trim()) {
      toast.error("Código y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("substrates").insert({
        code: substrateForm.code.trim(),
        name: substrateForm.name.trim(),
        minimum_stock_grams: Number(substrateForm.minimum_stock_grams || 0),
        supplier: substrateForm.supplier.trim() || null,
        notes: substrateForm.notes.trim() || null,
      });
      if (error) throw error;
      setSubstrateForm({ code: "", name: "", minimum_stock_grams: "0", supplier: "", notes: "" });
      await qc.invalidateQueries({ queryKey: ["substrates"] });
      toast.success("Sustrato registrado.");
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const addStock = async () => {
    if (
      !stockForm.substrate_id ||
      Number(stockForm.grams) <= 0 ||
      Number(stockForm.total_cost) < 0
    ) {
      toast.error("Selecciona un sustrato e indica gramos y costo válidos.");
      return;
    }
    setSaving(true);
    const operation = "substrate:stock-in";
    try {
      const { error } = await supabase.rpc("register_substrate_stock_tx", {
        _request_id: getRequestId(operation),
        _substrate_id: stockForm.substrate_id,
        _grams: Number(stockForm.grams),
        _total_cost: Number(stockForm.total_cost),
        _reference_type: stockForm.reference_id ? "purchase" : null,
        _reference_id: stockForm.reference_id.trim() || null,
      });
      if (error) throw error;
      resetRequestId(operation);
      setStockForm({ substrate_id: "", grams: "", total_cost: "", reference_id: "" });
      await qc.invalidateQueries({ queryKey: ["substrates"] });
      toast.success("Entrada de inventario registrada.");
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" /> Catálogos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tipos de caja y sustratos</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="types">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="types">
              <Boxes className="mr-2 h-4 w-4" /> Tipos de caja
            </TabsTrigger>
            <TabsTrigger value="substrates">
              <PackagePlus className="mr-2 h-4 w-4" /> Sustratos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="types" className="space-y-5 pt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Código *">
                <Input
                  value={typeForm.code}
                  onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })}
                  placeholder="TP-01"
                />
              </Field>
              <Field label="Nombre *">
                <Input
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="Caja mediana"
                />
              </Field>
              <Field label={kind === "rodent" ? "Población máxima *" : "Biomasa máxima (g) *"}>
                <Input
                  type="number"
                  min="1"
                  value={typeForm.capacity}
                  onChange={(e) => setTypeForm({ ...typeForm, capacity: e.target.value })}
                />
              </Field>
              <Field label="Material">
                <Input
                  value={typeForm.material}
                  onChange={(e) => setTypeForm({ ...typeForm, material: e.target.value })}
                  placeholder="Policarbonato"
                />
              </Field>
              <Field label="Largo (cm)">
                <Input
                  type="number"
                  min="0"
                  value={typeForm.length_cm}
                  onChange={(e) => setTypeForm({ ...typeForm, length_cm: e.target.value })}
                />
              </Field>
              <Field label="Ancho (cm)">
                <Input
                  type="number"
                  min="0"
                  value={typeForm.width_cm}
                  onChange={(e) => setTypeForm({ ...typeForm, width_cm: e.target.value })}
                />
              </Field>
              <Field label="Alto (cm)">
                <Input
                  type="number"
                  min="0"
                  value={typeForm.height_cm}
                  onChange={(e) => setTypeForm({ ...typeForm, height_cm: e.target.value })}
                />
              </Field>
              <Field label="Etapas / tamaños">
                <Input
                  value={typeForm.life_stages}
                  onChange={(e) => setTypeForm({ ...typeForm, life_stages: e.target.value })}
                  placeholder="Cría, juvenil, adulto"
                />
              </Field>
              <Field label="Ventilación">
                <Input
                  value={typeForm.ventilation}
                  onChange={(e) => setTypeForm({ ...typeForm, ventilation: e.target.value })}
                />
              </Field>
              <Field label="Tipo de tapa">
                <Input
                  value={typeForm.lid_type}
                  onChange={(e) => setTypeForm({ ...typeForm, lid_type: e.target.value })}
                />
              </Field>
              <Field label="Limpieza cada (días)">
                <Input
                  type="number"
                  min="1"
                  value={typeForm.cleaning_interval_days}
                  onChange={(e) =>
                    setTypeForm({ ...typeForm, cleaning_interval_days: e.target.value })
                  }
                />
              </Field>
              <Field label="Vida útil (días)">
                <Input
                  type="number"
                  min="1"
                  value={typeForm.useful_life_days}
                  onChange={(e) => setTypeForm({ ...typeForm, useful_life_days: e.target.value })}
                />
              </Field>
              <Field label="Temperatura mín. °C">
                <Input
                  type="number"
                  value={typeForm.temperature_min_c}
                  onChange={(e) => setTypeForm({ ...typeForm, temperature_min_c: e.target.value })}
                />
              </Field>
              <Field label="Temperatura máx. °C">
                <Input
                  type="number"
                  value={typeForm.temperature_max_c}
                  onChange={(e) => setTypeForm({ ...typeForm, temperature_max_c: e.target.value })}
                />
              </Field>
              <Field label="Humedad mín. %">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={typeForm.humidity_min_pct}
                  onChange={(e) => setTypeForm({ ...typeForm, humidity_min_pct: e.target.value })}
                />
              </Field>
              <Field label="Humedad máx. %">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={typeForm.humidity_max_pct}
                  onChange={(e) => setTypeForm({ ...typeForm, humidity_max_pct: e.target.value })}
                />
              </Field>
            </div>
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">Regla de sustrato (opcional)</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Field label="Sustrato">
                  <Select
                    value={typeForm.substrate_id}
                    onValueChange={(value) => setTypeForm({ ...typeForm, substrate_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No usa sustrato</SelectItem>
                      {substrates
                        .filter((s) => s.active)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Preparación (g)">
                  <Input
                    type="number"
                    min="0"
                    value={typeForm.setup_grams}
                    onChange={(e) => setTypeForm({ ...typeForm, setup_grams: e.target.value })}
                    disabled={typeForm.substrate_id === "none"}
                  />
                </Field>
                <Field label="Reposición (g)">
                  <Input
                    type="number"
                    min="0"
                    value={typeForm.replacement_grams}
                    onChange={(e) =>
                      setTypeForm({ ...typeForm, replacement_grams: e.target.value })
                    }
                    disabled={typeForm.substrate_id === "none"}
                  />
                </Field>
                <Field label="Cada (días)">
                  <Input
                    type="number"
                    min="1"
                    value={typeForm.replacement_interval_days}
                    onChange={(e) =>
                      setTypeForm({ ...typeForm, replacement_interval_days: e.target.value })
                    }
                    disabled={typeForm.substrate_id === "none"}
                  />
                </Field>
                <Field label="Merma %">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={typeForm.waste_pct}
                    onChange={(e) => setTypeForm({ ...typeForm, waste_pct: e.target.value })}
                    disabled={typeForm.substrate_id === "none"}
                  />
                </Field>
              </div>
            </div>
            <Field label="Notas sanitarias">
              <Textarea
                value={typeForm.notes}
                onChange={(e) => setTypeForm({ ...typeForm, notes: e.target.value })}
              />
            </Field>
            <Button onClick={saveType} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" /> Registrar tipo
            </Button>
            <div className="divide-y rounded-md border">
              {types.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No hay tipos registrados.</p>
              )}
              {types.map((type) => {
                const rule = rules.find((r) => r.box_type_id === type.id);
                const substrate = substrates.find((s) => s.id === rule?.substrate_id);
                return (
                  <div
                    key={type.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                  >
                    <div>
                      <span className="font-medium">
                        {type.code} · {type.name}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {type.length_cm && type.width_cm && type.height_cm
                          ? `${type.length_cm} × ${type.width_cm} × ${type.height_cm} cm · `
                          : ""}
                        {type.kind === "rodent"
                          ? `${type.max_population} animales`
                          : `${type.max_biomass_grams} g`}
                        {substrate
                          ? ` · ${rule?.setup_grams} g de ${substrate.name}`
                          : " · sin sustrato"}
                      </p>
                    </div>
                    <Badge variant={type.active ? "secondary" : "outline"}>
                      {type.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="substrates" className="space-y-5 pt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Código *">
                <Input
                  value={substrateForm.code}
                  onChange={(e) => setSubstrateForm({ ...substrateForm, code: e.target.value })}
                />
              </Field>
              <Field label="Nombre *">
                <Input
                  value={substrateForm.name}
                  onChange={(e) => setSubstrateForm({ ...substrateForm, name: e.target.value })}
                  placeholder="Viruta de álamo"
                />
              </Field>
              <Field label="Stock mínimo (g)">
                <Input
                  type="number"
                  min="0"
                  value={substrateForm.minimum_stock_grams}
                  onChange={(e) =>
                    setSubstrateForm({ ...substrateForm, minimum_stock_grams: e.target.value })
                  }
                />
              </Field>
              <Field label="Proveedor">
                <Input
                  value={substrateForm.supplier}
                  onChange={(e) => setSubstrateForm({ ...substrateForm, supplier: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Notas">
              <Textarea
                value={substrateForm.notes}
                onChange={(e) => setSubstrateForm({ ...substrateForm, notes: e.target.value })}
              />
            </Field>
            <Button onClick={saveSubstrate} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" /> Registrar sustrato
            </Button>
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">Entrada de inventario</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Sustrato">
                  <Select
                    value={stockForm.substrate_id}
                    onValueChange={(value) => setStockForm({ ...stockForm, substrate_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      {substrates
                        .filter((s) => s.active)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Cantidad (g)">
                  <Input
                    type="number"
                    min="0"
                    value={stockForm.grams}
                    onChange={(e) => setStockForm({ ...stockForm, grams: e.target.value })}
                  />
                </Field>
                <Field label="Costo total">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={stockForm.total_cost}
                    onChange={(e) => setStockForm({ ...stockForm, total_cost: e.target.value })}
                  />
                </Field>
                <Field label="Factura / referencia">
                  <Input
                    value={stockForm.reference_id}
                    onChange={(e) => setStockForm({ ...stockForm, reference_id: e.target.value })}
                  />
                </Field>
              </div>
              <Button className="mt-3" onClick={addStock} disabled={saving}>
                <PackagePlus className="mr-2 h-4 w-4" /> Agregar existencias
              </Button>
            </div>
            <div className="divide-y rounded-md border">
              {substrates.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No hay sustratos registrados.</p>
              )}
              {substrates.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      {item.code} · {item.name}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Costo promedio: ${Number(item.average_cost_per_kg).toFixed(2)}/kg
                    </p>
                  </div>
                  <Badge
                    variant={
                      item.stock_grams <= item.minimum_stock_grams ? "destructive" : "secondary"
                    }
                  >
                    {Number(item.stock_grams).toLocaleString()} g
                  </Badge>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
