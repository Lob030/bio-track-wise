import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
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
import { toast } from "sonner";
import { Plus, ShoppingCart, Trash2, Check, Package, Search, Download } from "lucide-react";
import { exportToCSV } from "@/lib/utils";
import { toUserFriendlyError } from "@/lib/errors";

/* ───────── types ───────── */

type LineItem = {
  kind: "rodent" | "insect";
  species_id: string;
  size_label: string;
  qty: number;
  unit_price: number;
};

type SizeRule = { label: string; [k: string]: unknown };

/* ───────── helpers ───────── */

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function fmtMXN(n: number) {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX");
}

/* ───────── component ───────── */

type SalesTab = "nueva-venta" | "pedidos-futuros";

function SalesPage() {
  const { new: autoNew } = Route.useSearch();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<SalesTab>("nueva-venta");

  const { data: futureOrders, isLoading: loadingFutureOrders } = useQuery({
    queryKey: ["future-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, clients(id, name), order_items(*, species(name, size_rules))")
        .eq("status", "preparando")
        .not("delivered_at", "is", null)
        .order("delivered_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  /* ── queries ── */
  const { data: orders } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, clients(name), order_items(id,kind,size_label,requested_qty,species_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: species } = useQuery({
    queryKey: ["species"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species")
        .select("id,name,size_rules,kind,unit_price_mxn");
      if (error) throw error;
      return data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id,name");
      if (error) throw error;
      return data;
    },
  });

  /* ── derived ── */
  const preparando = useMemo(
    () => (orders ?? []).filter((o: any) => o.status === "preparando"),
    [orders],
  );
  const historial = useMemo(
    () => (orders ?? []).filter((o: any) => o.status === "historial"),
    [orders],
  );

  const [historialSearch, setHistorialSearch] = useState("");
  const [historialMonth, setHistorialMonth] = useState("all");


  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    historial.forEach((o: any) => {
      const d = o.delivered_at ?? o.created_at;
      if (d && typeof d === "string" && d.length >= 7) {
        const monthPart = d.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(monthPart)) {
          set.add(monthPart);
        }
      }
    });
    // Sort descending (most recent first)
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [historial]);

  const filteredHistorial = useMemo(() => {
    let result = historial as any[];

    // Filter by client name (partial match, case insensitive)
    if (historialSearch.trim()) {
      const q = historialSearch.trim().toLowerCase();
      result = result.filter((o: any) =>
        (o.clients?.name ?? "").toLowerCase().includes(q)
      );
    }

    // Filter by month
    if (historialMonth !== "all") {
      result = result.filter((o: any) => {
        const d = o.delivered_at ?? o.created_at;
        return d?.startsWith(historialMonth);
      });
    }

    return result;
  }, [historial, historialSearch, historialMonth]);

  // Total of filtered results
  const filteredTotal = useMemo(
    () => filteredHistorial.reduce((sum: number, o: any) => sum + Number(o.total_mxn ?? 0), 0),
    [filteredHistorial]
  );

  /* ── modal state ── */
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO);
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (autoNew) {
      setOpen(true);
    }
  }, [autoNew]);


  function resetForm() {
    setDate(todayISO());
    setClientId("");
    setItems([]);
    setDiscount(0);
    setNotes("");
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { kind: "rodent", species_id: "", size_label: "", qty: 1, unit_price: 0 },
    ]);
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + it.qty * it.unit_price, 0),
    [items],
  );
  const total = useMemo(
    () => subtotal * (1 - discount / 100),
    [subtotal, discount],
  );

  /* ── submit sale ── */
  async function handleSubmit() {
    if (!clientId) {
      toast.error("Selecciona un cliente");
      return;
    }
    if (items.length === 0) {
      toast.error("Agrega al menos un producto");
      return;
    }
    for (const it of items) {
      if (!it.species_id || !it.size_label || it.qty <= 0) {
        toast.error("Completa todos los campos de cada producto");
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setSubmitting(false);
        return;
      }

      /* 1 ─ insert order */
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({
          owner_id: u.user.id,
          client_id: clientId,
          discount_pct: discount,
          subtotal_mxn: subtotal,
          total_mxn: total,
          notes,
          status: "preparando",
        })
        .select("id")
        .single();
      if (oErr) throw oErr;

      const unfulfilledItems: string[] = [];

      /* 2 ─ process each line item */
      for (const item of items) {
        /* a ─ fifo RPC */
        const rpcName =
          item.kind === "rodent"
            ? "fifo_consume_rodents"
            : "fifo_consume_insects";
        const rpcParams =
          item.kind === "rodent"
            ? {
                _owner: u.user.id,
                _species: item.species_id,
                _size: item.size_label,
                _qty: item.qty,
              }
            : {
                _owner: u.user.id,
                _species: item.species_id,
                _size: item.size_label,
                _grams: item.qty,
              };

        const rpcResult = await supabase.rpc(rpcName, rpcParams);
        if (rpcResult.error) throw rpcResult.error;

        /* b ─ insert order_item */
        const { data: orderItem, error: oiErr } = await supabase
          .from("order_items")
          .insert({
            owner_id: u.user.id,
            order_id: order.id,
            species_id: item.species_id,
            kind: item.kind,
            size_label: item.size_label,
            requested_qty: item.qty,
            unit_price: item.unit_price,
            line_total: item.qty * item.unit_price,
          })
          .select("id")
          .single();
        if (oiErr) throw oiErr;

        /* c ─ parse allocations */
        const result = (typeof rpcResult.data === "string"
          ? JSON.parse(rpcResult.data)
          : rpcResult.data) as {
          allocations?: Array<{
            lot_id: string;
            qty: number;
            finalized: boolean;
          }>;
          unfulfilled?: number;
        } | null;

        /* d ─ insert allocations */
        if (result?.allocations?.length) {
          const rows = result.allocations.map((alloc) => ({
            owner_id: u.user.id,
            order_item_id: orderItem.id,
            lot_id: alloc.lot_id,
            qty_taken: alloc.qty,
            finalized_lot: alloc.finalized,
          }));
          const { error: aErr } = await supabase
            .from("order_item_allocations")
            .insert(rows);
          if (aErr) throw aErr;
        }

        /* e ─ check unfulfilled */
        const unfulfilled = Number(result?.unfulfilled) || 0;
        if (unfulfilled > 0) {
          const spName =
            (species ?? []).find((s: any) => s.id === item.species_id)?.name ??
            "Especie";
          const unit = item.kind === "rodent" ? "ind." : "g";
          unfulfilledItems.push(
            `${spName} (${item.size_label}): faltaron ${unfulfilled} ${unit}`,
          );
        }
      }

      /* 3 ─ toasts */
      if (unfulfilledItems.length > 0) {
        toast.warning("Venta registrada con stock insuficiente", {
          description: `No se pudo surtir por completo: ${unfulfilledItems.join(", ")}`,
          duration: 6000,
        });
      } else {
        toast.success("Venta registrada");
      }

      /* 4 ─ invalidate */
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
      qc.invalidateQueries({ queryKey: ["lots-by-box"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });

      /* 5 ─ close */
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(toUserFriendlyError(err, "Error al registrar venta"));
    } finally {
      setSubmitting(false);
    }
  }

  /* ── deliver order ── */
  async function handleDeliver(orderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "historial", delivered_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) {
      toast.error(toUserFriendlyError(error));
      return;
    }
    toast.success("Pedido entregado");
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  /* ── species helpers ── */
  function speciesForKind(kind: "rodent" | "insect") {
    return (species ?? []).filter((s: any) => s.kind === kind);
  }

  function sizesForSpecies(speciesId: string): SizeRule[] {
    const sp = (species ?? []).find((s: any) => s.id === speciesId);
    if (!sp) return [];
    const rules = sp.size_rules as SizeRule[] | null;
    return rules ?? [];
  }

  /* ──────────────────── RENDER ──────────────────── */

  return (
    <div className="space-y-6">
      {/* tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-card w-fit mb-6 border border-border/50">
        <button
          onClick={() => setActiveTab("nueva-venta")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer
            ${activeTab === "nueva-venta"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"}`}
        >
          Nueva Venta
        </button>
        <button
          onClick={() => setActiveTab("pedidos-futuros")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5
            ${activeTab === "pedidos-futuros"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"}`}
        >
          📅 Pedidos Futuros
          {(futureOrders ?? []).length > 0 && (
            <span className="ml-1.5 bg-amber-500 text-amber-950 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {(futureOrders ?? []).length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "nueva-venta" ? (
        <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline de pedidos y entrega con vaciado FIFO de lotes.
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 h-9"
          onClick={() => exportToCSV(
            `ventas-${new Date().toISOString().slice(0,10)}.csv`,
            ["Pedido", "Cliente", "Total MXN", "Estado", "Fecha"],
            (orders ?? []).map((o: any) => [
              o.id.slice(0, 8),
              o.clients?.name ?? "—",
              o.total_mxn,
              o.status,
              new Date(o.created_at).toLocaleDateString("es-MX"),
            ])
          )}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="h-10 md:h-9 min-h-10 md:min-h-9 transition-all duration-200">
              <Plus className="mr-1 h-5 md:h-4 w-5 md:w-4" /> Nueva Venta
            </Button>
          </DialogTrigger>

          {/* ─── NEW SALE MODAL ─── */}
          <DialogContent className="max-w-4xl p-6 gap-6 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
                <ShoppingCart className="h-5 w-5" /> Nueva Venta
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* date + client */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium block text-foreground/90">Fecha</Label>
                  <Input
                    type="date"
                    className="h-10 focus-visible:ring-2 focus-visible:ring-primary"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium block text-foreground/90">Cliente</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {(clients ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* line items */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold block text-foreground/90">Productos</Label>
                {items.map((item, idx) => {
                  const filteredSpecies = speciesForKind(item.kind);
                  const sizes = sizesForSpecies(item.species_id);
                  return (
                    <Card
                      key={idx}
                      className="border-border/50 bg-gradient-to-br from-card to-card/40 p-4 space-y-3 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        {/* kind */}
                        <div className="col-span-2 space-y-1">
                          <span className="text-[10px] uppercase text-muted-foreground">
                            Tipo
                          </span>
                          <Select
                            value={item.kind}
                            onValueChange={(v: "rodent" | "insect") =>
                              updateItem(idx, {
                                kind: v,
                                species_id: "",
                                size_label: "",
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rodent">Roedor</SelectItem>
                              <SelectItem value="insect">Insecto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* species */}
                        <div className="col-span-3 space-y-1">
                          <span className="text-[10px] uppercase text-muted-foreground">
                            Especie
                          </span>
                          <Select
                            value={item.species_id}
                            onValueChange={(v) => {
                              const sp = (species ?? []).find((s: any) => s.id === v);
                              updateItem(idx, {
                                species_id: v,
                                size_label: "",
                                unit_price: sp?.unit_price_mxn ?? 0,
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Especie" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredSpecies.map((s: any) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* size */}
                        <div className="col-span-2 space-y-1">
                          <span className="text-[10px] uppercase text-muted-foreground">
                            Tamaño
                          </span>
                          <Select
                            value={item.size_label}
                            onValueChange={(v) => {
                              const sp = (species ?? []).find((s: any) => s.id === item.species_id);
                              const rules = (sp?.size_rules as any[]) ?? [];
                              const matchedRule = rules.find((r) => r.label === v);
                              const price = matchedRule?.price_mxn ?? sp?.unit_price_mxn ?? 0;
                              updateItem(idx, {
                                size_label: v,
                                unit_price: price,
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Tamaño" />
                            </SelectTrigger>
                            <SelectContent>
                              {sizes.map((r) => (
                                <SelectItem key={r.label} value={r.label}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* qty */}
                        <div className="col-span-2 space-y-1">
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {item.kind === "rodent"
                              ? "Cantidad (ind.)"
                              : "Gramos"}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-xs"
                            value={item.qty}
                            onChange={(e) =>
                              updateItem(idx, {
                                qty: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </div>

                        {/* unit price */}
                        <div className="col-span-2 space-y-1">
                          <span className="text-[10px] uppercase text-muted-foreground">
                            Precio unit.
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            className="h-8 text-xs"
                            value={item.unit_price}
                            onChange={(e) =>
                              updateItem(idx, {
                                unit_price: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </div>

                        {/* subtotal + delete */}
                        <div className="col-span-1 flex items-end gap-1">
                          <span className="text-xs font-semibold text-emerald-400 whitespace-nowrap">
                            {fmtMXN(item.qty * item.unit_price)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                  onClick={addItem}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Agregar producto
                </Button>
              </div>

              {/* discount + notes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Descuento</Label>
                  <Select
                    value={String(discount)}
                    onValueChange={(v) => setDiscount(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 5, 10, 15, 20].map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Notas (opcional)</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observaciones…"
                  />
                </div>
              </div>

              {/* totals */}
              <div className="flex items-center justify-between rounded-md bg-accent/30 px-4 py-3">
                <div className="text-sm text-muted-foreground">
                  Subtotal: {fmtMXN(subtotal)}
                  {discount > 0 && (
                    <span className="ml-2">
                      − {discount}%
                    </span>
                  )}
                </div>
                <div className="text-lg font-bold text-emerald-400">
                  Total: {fmtMXN(total)}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? "Registrando…" : "Registrar Venta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* ─── TABS ─── */}
      <Tabs defaultValue="preparando">
        <TabsList>
          <TabsTrigger value="preparando">
            <Package className="mr-1 h-4 w-4" /> Preparando
            {preparando.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {preparando.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historial">
            <ShoppingCart className="mr-1 h-4 w-4" /> Historial
          </TabsTrigger>
        </TabsList>

        {/* ── PREPARANDO ── */}
        <TabsContent value="preparando" className="space-y-3 mt-4">
          {preparando.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 p-8 text-center text-sm text-muted-foreground shadow-sm">
              Sin pedidos en preparación.
            </Card>
          ) : (
            preparando.map((o: any) => (
              <Card
                key={o.id}
                className="border-border/50 bg-gradient-to-br from-card to-card/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground font-semibold">
                      #{o.id.slice(0, 8)}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-border/40 bg-accent/10">
                      preparando
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {(o as any).clients?.name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(o.created_at)} · {o.order_items?.length ?? 0}{" "}
                    productos
                  </p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="font-bold text-emerald-400 text-base">
                    {fmtMXN(o.total_mxn ?? 0)}
                  </span>
                  <Button size="sm" className="h-10 sm:h-9 min-h-10 sm:min-h-9 transition-all duration-200" onClick={() => handleDeliver(o.id)}>
                    <Check className="mr-1.5 h-4.5 w-4.5 sm:h-4 sm:w-4" /> Marcar como Entregado
                  </Button>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── HISTORIAL ── */}
        <TabsContent value="historial" className="mt-4">
          {historial.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 p-8 text-center text-sm text-muted-foreground shadow-sm">
              Sin pedidos entregados.
            </Card>
          ) : (
            <>
              {historial.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  {/* Client search */}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por cliente..."
                      value={historialSearch}
                      onChange={e => setHistorialSearch(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>

                  {/* Month filter */}
                  <Select value={historialMonth} onValueChange={setHistorialMonth}>
                    <SelectTrigger className="h-9 w-44">
                      <SelectValue placeholder="Todos los meses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los meses</SelectItem>
                      {availableMonths.map(m => {
                        let label = m;
                        try {
                          const parts = m.split("-");
                          if (parts.length === 2) {
                            const year = parseInt(parts[0], 10);
                            const month = parseInt(parts[1], 10);
                            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                              const date = new Date(Date.UTC(year, month - 1, 15));
                              if (!isNaN(date.getTime())) {
                                label = date.toLocaleDateString("es-MX", {
                                  month: "long",
                                  year: "numeric",
                                  timeZone: "UTC",
                                });
                              }
                            }
                          }
                        } catch (e) {
                          console.error("Error formatting month:", e);
                        }
                        return (
                          <SelectItem key={m} value={m}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>

                  {/* Clear filters button — only shows when filters are active */}
                  {(historialSearch || historialMonth !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-muted-foreground"
                      onClick={() => { setHistorialSearch(""); setHistorialMonth("all"); }}
                    >
                      ✕ Limpiar
                    </Button>
                  )}

                  <Button variant="outline" size="sm" className="gap-1.5 h-9 sm:ml-auto"
                    onClick={() => exportToCSV(
                      `ventas-historial-${new Date().toISOString().slice(0,10)}.csv`,
                      ["Pedido", "Cliente", "Fecha entrega", "Items", "Total MXN"],
                      filteredHistorial.map((o: any) => [
                        o.id.slice(0, 8),
                        o.clients?.name ?? "—",
                        o.delivered_at ? new Date(o.delivered_at).toLocaleDateString("es-MX") : "—",
                        o.order_items?.length ?? 0,
                        o.total_mxn
                      ])
                    )}>
                    <Download className="h-4 w-4" /> Exportar CSV
                  </Button>
                </div>
              )}

              {historial.length > 0 && (
                <div className="flex justify-between items-center text-xs text-muted-foreground mb-2 px-1">
                  <span>
                    {filteredHistorial.length} de {historial.length} órdenes
                  </span>
                  <span className="font-semibold text-emerald-400">
                    Total: {fmtMXN(filteredTotal)}
                  </span>
                </div>
              )}

              {filteredHistorial.length === 0 ? (
                <Card className="border-dashed border-border/50 bg-gradient-to-br from-card to-card/40 p-8 text-center text-sm text-muted-foreground shadow-sm">
                  Sin resultados para los filtros aplicados.
                </Card>
              ) : (
                <Card className="border-border/50 bg-gradient-to-br from-card to-card/40 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-accent/20 border-b border-border/30">
                          <th className="text-[11px] uppercase text-muted-foreground font-semibold px-4 py-3 text-left">
                            Pedido #
                          </th>
                          <th className="text-[11px] uppercase text-muted-foreground font-semibold px-4 py-3 text-left">
                            Cliente
                          </th>
                          <th className="text-[11px] uppercase text-muted-foreground font-semibold px-4 py-3 text-left">
                            Fecha entrega
                          </th>
                          <th className="text-[11px] uppercase text-muted-foreground font-semibold px-4 py-3 text-left">
                            Items
                          </th>
                          <th className="text-[11px] uppercase text-muted-foreground font-semibold px-4 py-3 text-right">
                            Total MXN
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistorial.map((o: any, i: number) => (
                          <tr 
                            key={o.id} 
                            className={`border-b border-border/40 hover:bg-accent/15 transition-all duration-200 ${i % 2 === 0 ? "bg-accent/5" : ""}`}
                          >
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground/80">
                              #{o.id.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3 text-foreground font-medium">
                              {(o as any).clients?.name ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {fmtDate(o.delivered_at)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {o.order_items?.length ?? 0} productos
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-400">
                              {fmtMXN(o.total_mxn ?? 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
        </div>
      ) : (
        <PedidosFuturosPanel
          futureOrders={futureOrders ?? []}
          isLoading={loadingFutureOrders}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute("/sales")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === "1" ? true : undefined,
  }),
  component: () => (
    <TierGate min="gold" module="Ventas">
      <SalesPage />
    </TierGate>
  ),
});

function PedidosFuturosPanel({
  futureOrders,
  isLoading,
}: {
  futureOrders: any[];
  isLoading: boolean;
}) {
  const [newOrderDialog, setNewOrderDialog] = useState(false);
  const qc = useQueryClient();

  if (isLoading) return (
    <div className="p-8 text-center text-muted-foreground">Cargando pedidos...</div>
  );

  const markAsDelivered = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "historial", delivered_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) { toast.error("Error al marcar como entregado"); return; }
    toast.success("Pedido marcado como entregado ✓");
    qc.invalidateQueries({ queryKey: ["future-orders"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Pedidos Programados</h3>
        <Button onClick={() => setNewOrderDialog(true)}>
          + Nuevo Pedido Futuro
        </Button>
      </div>

      {futureOrders.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground border-dashed">
          No hay pedidos futuros. Crea uno para comenzar.
        </Card>
      ) : (
        <div className="grid gap-3">
          {futureOrders.map(order => {
            const daysUntil = order.delivered_at
              ? Math.ceil((new Date(order.delivered_at).getTime() - Date.now()) / 86400000)
              : null;
            const isOverdue = daysUntil !== null && daysUntil < 0;
            const isUrgent = daysUntil !== null && daysUntil <= 2 && daysUntil >= 0;

            return (
              <Card
                key={order.id}
                className={`p-4 border ${
                  isOverdue ? "border-destructive/50 bg-destructive/5"
                  : isUrgent ? "border-amber-500/50 bg-amber-500/5"
                  : "border-border/50 bg-card/45"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold">{(order.clients as any)?.name ?? "Sin cliente"}</p>
                    <p className="text-xs text-muted-foreground">{order.notes || "Sin notas"}</p>
                  </div>
                  <Badge variant={isOverdue ? "destructive" : isUrgent ? "secondary" : "outline"}>
                    {isOverdue
                      ? `⚠️ Vencido hace ${Math.abs(daysUntil!)} días`
                      : daysUntil === 0 ? "🔴 Hoy"
                      : daysUntil === 1 ? "🟡 Mañana"
                      : `📅 En ${daysUntil} días`}
                  </Badge>
                </div>

                <div className="space-y-1 mb-3 pb-3 border-b border-border/40">
                  {(order.order_items as any[])?.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.species?.name ?? "Especie"} — {item.size_label}
                      </span>
                      <span className="font-medium">
                        {item.requested_qty} unidades @ ${item.unit_price}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-bold text-emerald-400 text-lg">
                      ${order.total_mxn.toFixed(2)} MXN
                    </p>
                  </div>
                  <Button size="sm" onClick={() => markAsDelivered(order.id)}>
                    ✓ Marcar entregado
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateFutureOrderDialog open={newOrderDialog} onOpenChange={setNewOrderDialog} />
    </div>
  );
}

function CreateFutureOrderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [selectedClient, setSelectedClient] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<
    Array<{ speciesId: string; sizeLabel: string; quantity: number; unitPrice: number }>
  >([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id,name");
      if (error) throw error;
      return data;
    },
  });

  const { data: species } = useQuery({
    queryKey: ["species"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species")
        .select("id,name,size_rules,kind,unit_price_mxn");
      if (error) throw error;
      return data;
    },
  });

  const addItem = () =>
    setItems([...items, { speciesId: "", sizeLabel: "", quantity: 1, unitPrice: 0 }]);

  const removeItem = (idx: number) =>
    setItems(items.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const handleSubmit = async () => {
    if (!selectedClient || !deliveryDate || items.length === 0) {
      toast.error("Completa cliente, fecha y al menos un item");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          client_id: selectedClient,
          delivered_at: deliveryDate,
          status: "preparando",
          subtotal_mxn: total,
          total_mxn: total,
          discount_pct: 0,
          notes: notes || null,
          owner_id: user.id,
        })
        .select()
        .single();

      if (orderErr) throw orderErr;

      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(
          items.map(i => {
            const sp = (species ?? []).find(s => s.id === i.speciesId);
            const kind = sp?.kind ?? "rodent";
            return {
              owner_id: user.id,
              order_id: order.id,
              species_id: i.speciesId,
              kind: kind,
              size_label: i.sizeLabel,
              requested_qty: i.quantity,
              unit_price: i.unitPrice,
              line_total: i.quantity * i.unitPrice,
            };
          })
        );

      if (itemsErr) throw itemsErr;

      toast.success("Pedido futuro creado ✓");
      onOpenChange(false);
      setSelectedClient(""); setDeliveryDate(""); setNotes(""); setItems([]);
      qc.invalidateQueries({ queryKey: ["future-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>📅 Crear Pedido Futuro</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client */}
          <div>
            <Label>Cliente</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
              <SelectContent>
                {(clients ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Delivery date */}
          <div>
            <Label>Fecha de Entrega</Label>
            <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
          </div>

          {/* Notes */}
          <div>
            <Label>Notas (opcional)</Label>
            <Input placeholder="Instrucciones especiales..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {/* Items */}
          <div>
            <Label className="mb-2 block font-medium">Items del pedido</Label>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={item.speciesId} onValueChange={v => {
                    const sp = (species ?? []).find(s => s.id === v);
                    updateItem(idx, "speciesId", v);
                    if (sp) {
                      updateItem(idx, "unitPrice", sp.unit_price_mxn ?? 0);
                    }
                  }}>
                    <SelectTrigger className="flex-1 min-w-0">
                      <SelectValue placeholder="Especie" />
                    </SelectTrigger>
                    <SelectContent>
                      {(species ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Talla" value={item.sizeLabel}
                    onChange={e => updateItem(idx, "sizeLabel", e.target.value)}
                    className="w-24" />
                  <Input placeholder="Qty" type="number" min="1" value={item.quantity}
                    onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                    className="w-20" />
                  <Input placeholder="$Precio" type="number" step="0.01" value={item.unitPrice}
                    onChange={e => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                    className="w-24" />
                  <Button size="sm" variant="ghost"
                    className="text-destructive shrink-0"
                    onClick={() => removeItem(idx)}>✕</Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addItem} className="mt-2">
              + Agregar item
            </Button>
          </div>

          {/* Total */}
          {items.length > 0 && (
            <div className="flex justify-between p-3 rounded-lg bg-muted/50">
              <span className="font-medium">Total estimado</span>
              <span className="font-bold text-emerald-400">${total.toFixed(2)} MXN</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creando..." : "Crear Pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
