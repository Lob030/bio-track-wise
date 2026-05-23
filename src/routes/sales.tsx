import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, ShoppingCart, Trash2, Check, Package } from "lucide-react";

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

function SalesPage() {
  const qc = useQueryClient();

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

  /* ── modal state ── */
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO);
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      if (!u.user) return;

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
      toast.error(err.message ?? "Error al registrar venta");
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
      toast.error(error.message);
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
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline de pedidos y entrega con vaciado FIFO de lotes.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Nueva Venta
            </Button>
          </DialogTrigger>

          {/* ─── NEW SALE MODAL ─── */}
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" /> Nueva Venta
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* date + client */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cliente</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger>
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
              <div className="space-y-2">
                <Label>Productos</Label>
                {items.map((item, idx) => {
                  const filteredSpecies = speciesForKind(item.kind);
                  const sizes = sizesForSpecies(item.species_id);
                  return (
                    <Card
                      key={idx}
                      className="border-border bg-card/60 p-3 space-y-2"
                    >
                      <div className="grid grid-cols-12 gap-2 items-end">
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
            <Card className="border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
              Sin pedidos en preparación.
            </Card>
          ) : (
            preparando.map((o: any) => (
              <Card
                key={o.id}
                className="border-border bg-card/60 p-4 flex items-center justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{o.id.slice(0, 8)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      preparando
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">
                    {(o as any).clients?.name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(o.created_at)} · {o.order_items?.length ?? 0}{" "}
                    productos
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-emerald-400">
                    {fmtMXN(o.total_mxn ?? 0)}
                  </span>
                  <Button size="sm" onClick={() => handleDeliver(o.id)}>
                    <Check className="mr-1 h-4 w-4" /> Marcar como Entregado
                  </Button>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── HISTORIAL ── */}
        <TabsContent value="historial" className="mt-4">
          {historial.length === 0 ? (
            <Card className="border-dashed border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
              Sin pedidos entregados.
            </Card>
          ) : (
            <Card className="border-border bg-card/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-accent/30">
                    <th className="text-[10px] uppercase text-muted-foreground px-4 py-2 text-left">
                      Pedido #
                    </th>
                    <th className="text-[10px] uppercase text-muted-foreground px-4 py-2 text-left">
                      Cliente
                    </th>
                    <th className="text-[10px] uppercase text-muted-foreground px-4 py-2 text-left">
                      Fecha entrega
                    </th>
                    <th className="text-[10px] uppercase text-muted-foreground px-4 py-2 text-left">
                      Items
                    </th>
                    <th className="text-[10px] uppercase text-muted-foreground px-4 py-2 text-right">
                      Total MXN
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((o: any) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">
                        #{o.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2">
                        {(o as any).clients?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {fmtDate(o.delivered_at)}
                      </td>
                      <td className="px-4 py-2">
                        {o.order_items?.length ?? 0} productos
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-400">
                        {fmtMXN(o.total_mxn ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Route = createFileRoute("/sales")({
  component: () => (
    <TierGate min="gold" module="Ventas">
      <SalesPage />
    </TierGate>
  ),
});
