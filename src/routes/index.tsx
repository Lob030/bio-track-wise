import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, Users, ShoppingCart, Wallet, Boxes, Bell,
  TrendingUp, FlaskConical, AlertTriangle, Check,
} from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/")({ component: Dashboard });

function KPI({ icon: Icon, label, value, sub, tone = "default" }: any) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-glow",
    warning: "text-amber-glow",
    danger: "text-red-glow",
  }[tone as string] ?? "text-foreground";
  return (
    <Card className="p-5 border-border bg-card/60 hover:bg-card transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className="h-10 w-10 rounded-lg bg-accent/40 grid place-items-center">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

/* ── helpers ── */

function pctChange(current: number, previous: number) {
  if (previous === 0 && current === 0) return { pct: 0, direction: "flat" as const };
  if (previous === 0) return { pct: 100, direction: "up" as const };
  const change = ((current - previous) / previous) * 100;
  const absPct = Math.round(Math.abs(change));
  if (absPct === 0) return { pct: 0, direction: "flat" as const };
  return change > 0
    ? { pct: absPct, direction: "up" as const }
    : { pct: absPct, direction: "down" as const };
}

function compSub(change: { pct: number; direction: "up" | "down" | "flat" }) {
  if (change.direction === "up") return `↑ ${change.pct} % vs mes anterior`;
  if (change.direction === "down") return `↓ ${change.pct} % vs mes anterior`;
  return "— sin cambio";
}

function compTone(change: { direction: "up" | "down" | "flat" }) {
  if (change.direction === "up") return "success";
  if (change.direction === "down") return "danger";
  return "default";
}

/* ── dashboard ── */

function Dashboard() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const month = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }, []);
  const prevMonth = useMemo(() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); return d; }, [month]);

  const { data } = useQuery({
    queryKey: ["dashboard", month.toISOString()],
    queryFn: async () => {
      const [
        lots, clients, orders, alerts, boxes, purchases,
        foodItems, pendingOrders, prevOrders, prevPurchases,
      ] = await Promise.all([
        supabase
          .from("lots")
          .select("id, lot_type, status, kind, started_at, lot_code, box_id, species_id, species(name)")
          .eq("status", "active"),
        supabase.from("clients").select("id, created_at").gte("created_at", month.toISOString()),
        supabase.from("orders").select("id, total_mxn, created_at, status").gte("created_at", month.toISOString()),
        supabase.from("alerts").select("id").eq("acknowledged", false),
        supabase.from("boxes").select("id"),
        supabase.from("warehouse_purchases")
          .select("id, total_cost, created_at")
          .gte("created_at", month.toISOString()),
        /* critical supplies — fetch all, filter client-side because PostgREST
           can't compare two columns directly */
        supabase.from("warehouse_food")
          .select("id, name, quantity_grams, min_stock_grams"),
        /* pending orders with client name */
        supabase.from("orders")
          .select("id, total_mxn, created_at, client_id, clients(name)")
          .eq("status", "preparando")
          .order("created_at", { ascending: true }),
        /* previous-month orders */
        supabase.from("orders")
          .select("id, total_mxn, created_at, status")
          .gte("created_at", prevMonth.toISOString())
          .lt("created_at", month.toISOString()),
        /* previous-month purchases */
        supabase.from("warehouse_purchases")
          .select("id, total_cost, created_at")
          .gte("created_at", prevMonth.toISOString())
          .lt("created_at", month.toISOString()),
      ]);

      if (lots.error) throw lots.error;
      if (clients.error) throw clients.error;
      if (orders.error) throw orders.error;
      if (alerts.error) throw alerts.error;
      if (boxes.error) throw boxes.error;
      if (purchases.error) throw purchases.error;
      if (foodItems.error) throw foodItems.error;
      if (pendingOrders.error) throw pendingOrders.error;
      if (prevOrders.error) throw prevOrders.error;
      if (prevPurchases.error) throw prevPurchases.error;

      return {
        lots: lots.data ?? [],
        clients: clients.data ?? [],
        orders: orders.data ?? [],
        alerts: alerts.data ?? [],
        boxes: boxes.data ?? [],
        purchases: purchases.data ?? [],
        foodItems: foodItems.data ?? [],
        pendingOrders: pendingOrders.data ?? [],
        prevOrders: prevOrders.data ?? [],
        prevPurchases: prevPurchases.data ?? [],
      };
    },
  });

  /* ── derived: current month ── */
  const lots = data?.lots ?? [];
  const orders = data?.orders ?? [];
  const sales = orders.reduce((a, o) => a + Number(o.total_mxn || 0), 0);
  const paidOrders = orders.filter((o) => Number(o.total_mxn || 0) > 0);
  const avgTicket = paidOrders.length > 0 ? sales / paidOrders.length : 0;
  const gastos = (data?.purchases ?? []).reduce(
    (sum, p) => sum + Number(p.total_cost || 0), 0
  );
  const breeders = lots.filter((l) => l.lot_type === "breeder").length;
  const occupiedBoxes = new Set(lots.map((l) => l.box_id).filter(Boolean)).size;
  const totalBoxes = data?.boxes.length ?? 0;
  const free = Math.max(0, totalBoxes - occupiedBoxes);
  const occupancyPct = totalBoxes > 0 ? Math.round((occupiedBoxes / totalBoxes) * 100) : 0;

  const byKind = {
    rodent: lots.filter((l) => l.kind === "rodent").length,
    insect: lots.filter((l) => l.kind === "insect").length,
  };

  /* ── gross margin ── */
  const margin = sales - gastos;

  /* ── previous month comparisons ── */
  const prevSales = (data?.prevOrders ?? []).reduce((a, o) => a + Number(o.total_mxn || 0), 0);
  const prevOrdersCount = (data?.prevOrders ?? []).length;
  const prevGastos = (data?.prevPurchases ?? []).reduce((sum, p) => sum + Number(p.total_cost || 0), 0);

  const salesChange = pctChange(sales, prevSales);
  const ordersChange = pctChange(orders.length, prevOrdersCount);
  const gastosChange = pctChange(gastos, prevGastos);

  /* ── critical supplies ── */
  const criticalFoodCount = (data?.foodItems ?? []).filter(
    (f: any) =>
      f.min_stock_grams != null &&
      Number(f.min_stock_grams) > 0 &&
      Number(f.quantity_grams ?? 0) < Number(f.min_stock_grams)
  ).length;

  /* ── pending orders ── */
  const pendingOrders = data?.pendingOrders ?? [];

  /* ── weekly sales chart ── */
  const weeklyData = useMemo(() => {
    const weeks = [
      { name: "Sem 1", total: 0 },
      { name: "Sem 2", total: 0 },
      { name: "Sem 3", total: 0 },
      { name: "Sem 4", total: 0 },
    ];
    for (const o of orders) {
      const day = new Date(o.created_at).getDate();
      const weekIdx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
      weeks[weekIdx].total += Number(o.total_mxn || 0);
    }
    return weeks;
  }, [orders]);

  /* ── species distribution for demographics ── */
  const speciesDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of lots) {
      const name = (l as any).species?.name ?? "Sin especie";
      counts[name] = (counts[name] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = lots.length || 1;
    if (sorted.length <= 5) {
      return sorted.map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }));
    }
    const top = sorted.slice(0, 4);
    const restCount = sorted.slice(4).reduce((sum, [, c]) => sum + c, 0);
    return [
      ...top.map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) })),
      { name: "Otras", count: restCount, pct: Math.round((restCount / total) * 100) },
    ];
  }, [lots]);

  /* ── deliver handler ── */
  async function handleDeliver(orderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "historial" as const, delivered_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) {
      toast.error(toUserFriendlyError(error));
      return;
    }
    toast.success("Pedido entregado");
    qc.invalidateQueries({ queryKey: ["dashboard", month.toISOString()] });
  }

  /* ──────────────────── RENDER ──────────────────── */

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Bienvenido, {profile?.full_name ?? "operador"}. Resumen operativo del mes.
          </p>
        </div>
        <Badge variant="outline" className="capitalize">Plan {profile?.tier ?? "bronze"}</Badge>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Activity} label="Lotes activos" value={lots.length} sub={`${byKind.rodent} roedores · ${byKind.insect} insectos`} tone="success" />
        <KPI icon={Users} label="Nuevos clientes (mes)" value={data?.clients.length ?? 0} />
        <KPI
          icon={ShoppingCart}
          label="Órdenes (mes)"
          value={data?.orders.length ?? 0}
          sub={compSub(ordersChange)}
          tone={compTone(ordersChange)}
        />
        <KPI
          icon={Wallet}
          label="Gastos (mes)"
          value={gastos > 0 ? `$${gastos.toLocaleString("es-MX", { maximumFractionDigits: 0 })}` : "$0"}
          sub={compSub(gastosChange)}
          tone={compTone(gastosChange)}
        />
        <KPI icon={Boxes} label="Ocupación de cajas" value={`${occupancyPct}%`} sub={`${occupiedBoxes}/${totalBoxes} ocupadas · ${free} libres`} tone={occupancyPct >= 90 ? "warning" : "default"} />
        <KPI icon={Wallet} label="Ticket promedio (mes)" value={`$${avgTicket.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`} sub={`${paidOrders.length} órdenes con venta`} tone="success" />
        <KPI icon={Bell} label="Alertas pendientes" value={data?.alerts.length ?? 0} tone={(data?.alerts.length ?? 0) > 0 ? "warning" : "default"} />
        <KPI
          icon={TrendingUp}
          label="Ventas (mes)"
          value={`$${sales.toLocaleString("es-MX")}`}
          sub={compSub(salesChange)}
          tone={compTone(salesChange)}
        />
        <KPI icon={FlaskConical} label="Lotes reproductores" value={breeders} />
        <KPI
          icon={TrendingUp}
          label="Margen bruto (mes)"
          value={`$${margin.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`}
          sub="Ingresos − Egresos"
          tone={margin >= 0 ? "success" : "danger"}
        />
        <KPI
          icon={AlertTriangle}
          label="Insumos críticos"
          value={criticalFoodCount}
          sub="alimentos bajo stock mínimo"
          tone={criticalFoodCount > 0 ? "danger" : "default"}
        />
      </div>

      {/* ── Pending orders ── */}
      <Card className="p-5 border-border bg-card/60">
        <h3 className="font-semibold mb-3">Pendientes de entrega</h3>
        {pendingOrders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay órdenes pendientes · Todo al día ✓
          </p>
        ) : (
          <div className="divide-y divide-border">
            {pendingOrders.map((o: any) => (
              <div key={o.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <span className="font-medium text-sm truncate">
                    {(o as any).clients?.name ?? "Sin cliente"}
                  </span>
                  <span className="text-emerald-400 font-semibold text-sm whitespace-nowrap">
                    ${Number(o.total_mxn ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(o.created_at).toLocaleDateString("es-MX")}
                  </span>
                </div>
                <Button size="sm" className="h-8 shrink-0" onClick={() => handleDeliver(o.id)}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Entregar
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Charts + demographics ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly sales bar chart */}
        <Card className="p-5 border-border bg-card/60 lg:col-span-2">
          <h3 className="font-semibold mb-3">Ventas del mes por semana</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: any) => [`$${Number(value).toLocaleString("es-MX")}`, "Ventas"]}
              />
              <Bar
                dataKey="total"
                fill="hsl(var(--primary))"
                stroke="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Species distribution */}
        <Card className="p-5 border-border bg-card/60">
          <h3 className="font-semibold mb-4">Distribución demográfica</h3>
          <div className="space-y-4">
            {speciesDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin lotes activos.</p>
            ) : (
              speciesDistribution.map((sp) => (
                <div key={sp.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span>{sp.name}</span>
                    <span className="text-muted-foreground">{sp.count} ({sp.pct}%)</span>
                  </div>
                  <Progress value={sp.pct} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
