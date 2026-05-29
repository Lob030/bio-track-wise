import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TierGate } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Warehouse, DollarSign } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Route export                                                       */
/* ------------------------------------------------------------------ */
export const Route = createFileRoute("/warehouse")({
  component: () => (
    <TierGate min="gold" module="Almacén">
      <WarehousePage />
    </TierGate>
  ),
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const fmtMXN = (v: number) =>
  v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("es-MX") : "—";

const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
function WarehousePage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Almacén</h1>
        <p className="text-sm text-muted-foreground">
          Inventario operativo en 5 categorías.
        </p>
      </div>

      <Tabs defaultValue="alimento">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="alimento">Alimento</TabsTrigger>
          <TabsTrigger value="limpieza">Limpieza</TabsTrigger>
          <TabsTrigger value="herramientas">Herramientas</TabsTrigger>
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="ejemplares">Ejemplares</TabsTrigger>
        </TabsList>

        <TabsContent value="alimento">
          <FoodTab />
        </TabsContent>
        <TabsContent value="limpieza">
          <CleaningTab />
        </TabsContent>
        <TabsContent value="herramientas">
          <ToolsTab />
        </TabsContent>
        <TabsContent value="entregas">
          <PackagingTab />
        </TabsContent>
        <TabsContent value="ejemplares">
          <PurchasesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ================================================================== */
/*  TAB 1 — Alimento                                                   */
/* ================================================================== */
function FoodTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    quantity_grams: "",
    unit_cost: "",
    min_stock_grams: "",
    notes: "",
    audited_at: today(),
  });

  const { data } = useQuery({
    queryKey: ["warehouse_food"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_food")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Active rodent lots + species rules for feed projection
  const { data: activeLots } = useQuery({
    queryKey: ["lots-for-feed"],
    queryFn: async () =>
      (await supabase
        .from("lots")
        .select("id, species_id, males, females, unsexed, started_at, kind")
        .eq("status", "active")
        .eq("kind", "rodent")).data ?? [],
  });

  const { data: allSpecies } = useQuery({
    queryKey: ["species-for-feed"],
    queryFn: async () =>
      (await supabase.from("species").select("id, size_rules")).data ?? [],
  });

  const totalValue = useMemo(() => {
    if (!data) return 0;
    return data.reduce((sum, r) => {
      const qty = Number(r.quantity_grams) || 0;
      const cost = Number(r.unit_cost) || 0;
      return sum + (qty * cost) / 1000;
    }, 0);
  }, [data]);

  const feedProjection = useMemo(() => {
    let dailyGrams = 0;
    (activeLots ?? []).forEach((lot: any) => {
      const sp = (allSpecies ?? []).find((s: any) => s.id === lot.species_id);
      const rules = (sp?.size_rules as any[]) ?? [];
      const ageToday = Math.floor(
        (Date.now() - new Date(lot.started_at).getTime()) / 86400000,
      );
      const rule = rules.find(
        (r: any) => ageToday >= r.min_days && ageToday <= r.max_days,
      );
      const count = (lot.males ?? 0) + (lot.females ?? 0) + (lot.unsexed ?? 0);
      dailyGrams += (rule?.daily_feed_g ?? 0) * count;
    });
    const totalFoodGrams = (data ?? []).reduce(
      (sum, f) => sum + (Number(f.quantity_grams) ?? 0),
      0,
    );
    const daysRemaining =
      dailyGrams > 0 ? Math.floor(totalFoodGrams / dailyGrams) : null;
    return { dailyGrams, totalFoodGrams, daysRemaining };
  }, [activeLots, allSpecies, data]);


  const handleSave = async () => {
    if (!form.name || !form.quantity_grams) {
      toast.error("Nombre y gramos son obligatorios.");
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("warehouse_food").insert({
      owner_id: u.user.id,
      name: form.name,
      quantity_grams: Number(form.quantity_grams),
      unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
      min_stock_grams: form.min_stock_grams ? Number(form.min_stock_grams) : null,
      notes: form.notes || null,
      audited_at: form.audited_at || today(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Alimento registrado.");
    qc.invalidateQueries({ queryKey: ["warehouse_food"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setForm({ name: "", quantity_grams: "", unit_cost: "", min_stock_grams: "", notes: "", audited_at: today() });
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("warehouse_food").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registro eliminado.");
    qc.invalidateQueries({ queryKey: ["warehouse_food"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div className="space-y-4">
      {/* KPI */}
      <Card className="border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex items-center gap-3">
        <div className="rounded-md bg-emerald-500/20 p-2">
          <DollarSign className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">
            Valor total del inventario
          </p>
          <p className="text-xl font-bold">{fmtMXN(totalValue)}</p>
        </div>
      </Card>

      {/* Add button + Dialog */}
      <div className="flex justify-between items-center">
        <p className="text-xs italic text-muted-foreground">
          El stock se actualiza manualmente mediante auditoría física del costal
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Registrar Alimento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Alimento</DialogTitle>
              <DialogDescription>Añade un producto al inventario de alimento.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Gramos actuales *</Label>
                <Input type="number" value={form.quantity_grams} onChange={(e) => setForm({ ...form, quantity_grams: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Costo por kg MXN</Label>
                <Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Stock mínimo (g)</Label>
                <Input type="number" value={form.min_stock_grams} onChange={(e) => setForm({ ...form, min_stock_grams: e.target.value })} placeholder="Ej. 5000" />
                <p className="text-[11px] text-muted-foreground">Recibirás una alerta cuando el stock baje de este nivel.</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Notas</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Fecha de auditoría</Label>
                <Input type="date" value={form.audited_at} onChange={(e) => setForm({ ...form, audited_at: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      {!data || data.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 text-muted-foreground shadow-sm">
          Sin alimentos registrados.
        </Card>
      ) : (
        <div className="grid gap-2">
          {data.map((r) => (
            <Card key={r.id} className="border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="font-medium text-sm">{r.name}</p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{((Number(r.quantity_grams) || 0) / 1000).toFixed(1)} kg</span>
                  {r.unit_cost && <span>{fmtMXN(Number(r.unit_cost))}/kg</span>}
                  <span>Auditoría: {fmtDate(r.audited_at)}</span>
                </div>
                {r.notes && <p className="text-xs text-muted-foreground italic">{r.notes}</p>}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                    <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(r.id)}>Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  TAB 2 — Limpieza                                                   */
/* ================================================================== */
function CleaningTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    quantity: "",
    unit: "ml",
    expiry_date: "",
    cost: "",
  });

  const { data } = useQuery({
    queryKey: ["warehouse_cleaning"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_cleaning")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleSave = async () => {
    if (!form.name || !form.quantity) {
      toast.error("Nombre y cantidad son obligatorios.");
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("warehouse_cleaning").insert({
      owner_id: u.user.id,
      name: form.name,
      quantity: Number(form.quantity),
      unit: form.unit,
      expiry_date: form.expiry_date || null,
      cost: form.cost ? Number(form.cost) : null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Producto registrado.");
    qc.invalidateQueries({ queryKey: ["warehouse_cleaning"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setForm({ name: "", quantity: "", unit: "ml", expiry_date: "", cost: "" });
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("warehouse_cleaning").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registro eliminado.");
    qc.invalidateQueries({ queryKey: ["warehouse_cleaning"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const getExpiryBadge = (expiryDateStr: string | null) => {
    if (!expiryDateStr) return null;
    const expiry = new Date(expiryDateStr + "T00:00:00");
    if (isNaN(expiry.getTime())) return null;

    const today = new Date();
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const expiryMidnight = new Date(
      expiry.getFullYear(),
      expiry.getMonth(),
      expiry.getDate()
    );

    const diffTime = expiryMidnight.getTime() - todayMidnight.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-[10px]">
          ⚠ Caducado
        </Badge>
      );
    }
    if (diffDays <= 30) {
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px]">
          ⚠ Vence pronto ({diffDays} d)
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Registrar Producto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Producto de Limpieza</DialogTitle>
              <DialogDescription>Añade un producto al inventario de limpieza.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Cantidad *</Label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Unidad</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Fecha de caducidad</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Costo MXN</Label>
                <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!data || data.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 text-muted-foreground shadow-sm">
          Sin productos de limpieza registrados.
        </Card>
      ) : (
        <div className="grid gap-2">
          {data.map((r) => (
            <Card key={r.id} className="border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{r.name}</p>
                  {getExpiryBadge(r.expiry_date)}
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{r.quantity} {r.unit}</span>
                  {r.cost && <span>{fmtMXN(Number(r.cost))}</span>}
                  {r.expiry_date && <span>Caduca: {fmtDate(r.expiry_date)}</span>}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                    <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(r.id)}>Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  TAB 3 — Herramientas                                               */
/* ================================================================== */
const conditionStyles: Record<string, string> = {
  nuevo: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  bueno: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  regular: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  malo: "bg-red-500/20 text-red-400 border-red-500/40",
  reparacion: "bg-orange-500/20 text-orange-400 border-orange-500/40",
};

function ToolsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    value: "",
    condition: "bueno",
    notes: "",
  });

  const { data } = useQuery({
    queryKey: ["warehouse_tools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_tools")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleSave = async () => {
    if (!form.name) {
      toast.error("Nombre es obligatorio.");
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("warehouse_tools").insert({
      owner_id: u.user.id,
      name: form.name,
      value: form.value ? Number(form.value) : 0,
      condition: form.condition as "bueno" | "malo" | "nuevo" | "regular" | "reparacion",
      notes: form.notes || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Herramienta registrada.");
    qc.invalidateQueries({ queryKey: ["warehouse_tools"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setForm({ name: "", value: "", condition: "bueno", notes: "" });
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("warehouse_tools").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registro eliminado.");
    qc.invalidateQueries({ queryKey: ["warehouse_tools"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Registrar Herramienta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Herramienta</DialogTitle>
              <DialogDescription>Añade una herramienta al inventario.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Valor MXN</Label>
                <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Condición</Label>
                <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nuevo">Nuevo</SelectItem>
                    <SelectItem value="bueno">Bueno</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="malo">Malo</SelectItem>
                    <SelectItem value="reparacion">Reparación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Notas</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!data || data.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 text-muted-foreground shadow-sm">
          Sin herramientas registradas.
        </Card>
      ) : (
        <div className="grid gap-2">
          {data.map((r) => (
            <Card key={r.id} className="border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{r.name}</p>
                  <Badge variant="outline" className={conditionStyles[r.condition ?? "bueno"]}>
                    {r.condition}
                  </Badge>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {r.value != null && Number(r.value) > 0 && <span>{fmtMXN(Number(r.value))}</span>}
                </div>
                {r.notes && <p className="text-xs text-muted-foreground italic">{r.notes}</p>}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                    <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(r.id)}>Eliminar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  TAB 4 — Entregas (Packaging)                                       */
/* ================================================================== */
function PackagingTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    units: "",
    unit_cost: "",
  });

  const { data } = useQuery({
    queryKey: ["warehouse_packaging"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_packaging")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleSave = async () => {
    if (!form.name || !form.units) {
      toast.error("Nombre y unidades son obligatorios.");
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("warehouse_packaging").insert({
      owner_id: u.user.id,
      name: form.name,
      units: Number(form.units),
      unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Insumo registrado.");
    qc.invalidateQueries({ queryKey: ["warehouse_packaging"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setForm({ name: "", units: "", unit_cost: "" });
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("warehouse_packaging").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registro eliminado.");
    qc.invalidateQueries({ queryKey: ["warehouse_packaging"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Registrar Insumo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Insumo de Entrega</DialogTitle>
              <DialogDescription>Añade un insumo de empaque al inventario.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Unidades *</Label>
                <Input type="number" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Costo unitario MXN</Label>
                <Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!data || data.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 text-muted-foreground shadow-sm">
          Sin insumos de entrega registrados.
        </Card>
      ) : (
        <div className="grid gap-2">
          {data.map((r) => {
            const total = (Number(r.units) || 0) * (Number(r.unit_cost) || 0);
            return (
              <Card key={r.id} className="border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 p-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-medium text-sm">{r.name}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{r.units} unidades</span>
                    {r.unit_cost != null && <span>{fmtMXN(Number(r.unit_cost))}/u</span>}
                    {total > 0 && <span>Total: {fmtMXN(total)}</span>}
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(r.id)}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  TAB 5 — Ejemplares / Genética (Purchases)                         */
/* ================================================================== */
function PurchasesTab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lotDialogOpen, setLotDialogOpen] = useState(false);
  const [savedKind, setSavedKind] = useState<"rodent" | "insect">("rodent");

  const [form, setForm] = useState({
    invoice_id: "",
    kind: "rodent" as "rodent" | "insect",
    species_id: "",
    line_id: "",
    population: "",
    males: "",
    females: "",
    mass_grams: "",
    total_cost: "",
    provider: "",
    notes: "",
  });

  /* Main data */
  const { data } = useQuery({
    queryKey: ["warehouse_purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_purchases")
        .select("*, species(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  /* Species lookup */
  const { data: speciesList } = useQuery({
    queryKey: ["species"],
    queryFn: async () => {
      const { data, error } = await supabase.from("species").select("id,name,kind");
      if (error) throw error;
      return data;
    },
  });

  /* Genetic lines lookup */
  const { data: linesList } = useQuery({
    queryKey: ["genetic_lines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("genetic_lines").select("id,name,species_id");
      if (error) throw error;
      return data;
    },
  });

  const filteredSpecies = useMemo(
    () => (speciesList ?? []).filter((s) => s.kind === form.kind),
    [speciesList, form.kind],
  );

  const filteredLines = useMemo(
    () => (linesList ?? []).filter((l) => l.species_id === form.species_id),
    [linesList, form.species_id],
  );

  const totalInvestment = useMemo(() => {
    if (!data) return 0;
    return data.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);
  }, [data]);

  const resetForm = () =>
    setForm({
      invoice_id: "",
      kind: "rodent",
      species_id: "",
      line_id: "",
      population: "",
      males: "",
      females: "",
      mass_grams: "",
      total_cost: "",
      provider: "",
      notes: "",
    });

  const handleSave = async () => {
    if (!form.total_cost) {
      toast.error("El costo total es obligatorio.");
      return;
    }
    if (form.kind === "rodent" && !form.population) {
      toast.error("La población es obligatoria para roedores.");
      return;
    }
    if (form.kind === "insect" && !form.mass_grams) {
      toast.error("El peso es obligatorio para insectos.");
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const payload: Record<string, unknown> = {
      owner_id: u.user.id,
      kind: form.kind,
      total_cost: Number(form.total_cost),
      invoice_id: form.invoice_id || null,
      species_id: form.species_id || null,
      line_id: form.line_id || null,
      provider: form.provider || null,
      notes: form.notes || null,
    };
    if (form.kind === "rodent") {
      payload.population = Number(form.population);
      payload.mass_grams = null;
    } else {
      payload.mass_grams = Number(form.mass_grams);
      payload.population = null;
    }

    const { error } = await supabase.from("warehouse_purchases").insert(payload as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Adquisición registrada.");
    qc.invalidateQueries({ queryKey: ["warehouse_purchases"] });
    qc.invalidateQueries({ queryKey: ["lots"] });
    qc.invalidateQueries({ queryKey: ["species"] });
    qc.invalidateQueries({ queryKey: ["genetic_lines"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setSavedKind(form.kind);
    resetForm();
    setOpen(false);
    setLotDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("warehouse_purchases").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registro eliminado.");
    qc.invalidateQueries({ queryKey: ["warehouse_purchases"] });
    qc.invalidateQueries({ queryKey: ["lots"] });
    qc.invalidateQueries({ queryKey: ["species"] });
    qc.invalidateQueries({ queryKey: ["genetic_lines"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div className="space-y-4">
      {/* KPI */}
      <Card className="border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 p-4 flex items-center gap-3">
        <div className="rounded-md bg-emerald-500/20 p-2">
          <DollarSign className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">
            Inversión total en adquisiciones
          </p>
          <p className="text-xl font-bold">{fmtMXN(totalInvestment)}</p>
        </div>
      </Card>

      {/* Add dialog */}
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Registrar Adquisición
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registrar Adquisición</DialogTitle>
              <DialogDescription>Registra la compra de ejemplares.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Folio/Factura</Label>
                <Input value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })} />
              </div>

              <div className="grid gap-1.5">
                <Label>Tipo *</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) =>
                    setForm({ ...form, kind: v as "rodent" | "insect", species_id: "", line_id: "" })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rodent">Roedores</SelectItem>
                    <SelectItem value="insect">Insectos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>Especie</Label>
                <Select
                  value={form.species_id}
                  onValueChange={(v) => setForm({ ...form, species_id: v, line_id: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar especie" /></SelectTrigger>
                  <SelectContent>
                    {filteredSpecies.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filteredLines.length > 0 && (
                <div className="grid gap-1.5">
                  <Label>Línea genética</Label>
                  <Select value={form.line_id} onValueChange={(v) => setForm({ ...form, line_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar línea" /></SelectTrigger>
                    <SelectContent>
                      {filteredLines.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.kind === "rodent" ? (
                <>
                  <div className="grid gap-1.5">
                    <Label>Población *</Label>
                    <Input type="number" value={form.population} onChange={(e) => setForm({ ...form, population: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Machos</Label>
                      <Input type="number" value={form.males} onChange={(e) => setForm({ ...form, males: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Hembras</Label>
                      <Input type="number" value={form.females} onChange={(e) => setForm({ ...form, females: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid gap-1.5">
                  <Label>Peso aprox. en gramos *</Label>
                  <Input type="number" step="0.01" value={form.mass_grams} onChange={(e) => setForm({ ...form, mass_grams: e.target.value })} />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label>Costo total MXN *</Label>
                <Input type="number" step="0.01" value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Proveedor / PIMVS</Label>
                <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Notas</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Post-save: lot creation dialog */}
      <AlertDialog open={lotDialogOpen} onOpenChange={setLotDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Deseas activar estos ejemplares como un nuevo lote ahora?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Puedes crear el lote de producción ahora o solo registrar el gasto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, solo registrar gasto</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                navigate({
                  to: savedKind === "rodent" ? "/rodents/lots" : "/insects/lots",
                })
              }
            >
              Sí, crear lote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table list */}
      {!data || data.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 text-muted-foreground shadow-sm">
          Sin adquisiciones registradas.
        </Card>
      ) : (
        <Card className="border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-accent/20 border-b border-border/30">
                <TableRow>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground px-4 py-3">Folio</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground px-4 py-3">Especie</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground px-4 py-3">Proveedor</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground px-4 py-3">Costo</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground px-4 py-3">Fecha</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase text-muted-foreground px-4 py-3 w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r, i) => (
                  <TableRow key={r.id} className={`border-b border-border/40 hover:bg-accent/15 transition-all duration-200 ${i % 2 === 0 ? "bg-accent/5" : ""}`}>
                    <TableCell className="text-sm px-4 py-3 font-medium text-foreground">{r.invoice_id || "—"}</TableCell>
                    <TableCell className="text-sm px-4 py-3 text-foreground">
                      {(r as any).species?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm px-4 py-3 text-muted-foreground">{r.provider || "—"}</TableCell>
                    <TableCell className="text-sm px-4 py-3 font-semibold text-emerald-400">{fmtMXN(Number(r.total_cost) || 0)}</TableCell>
                    <TableCell className="text-sm px-4 py-3 text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="px-4 py-3">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive transition-all">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(r.id)}>Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
