import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TierGate } from "@/components/tier-gate";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Users,
  Boxes,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  Layers,
  Utensils,
  ChevronRight,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/reports")({
  component: () => (
    <TierGate min="gold" module="Reportes">
      <ReportsPage />
    </TierGate>
  ),
});

type Timeframe = "day" | "week" | "month" | "year";

const COLORS = ["#34d399", "#22d3ee", "#818cf8", "#fbbf24", "#94a3b8"];

function ReportsPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>("month");

  /* ── Fetching Data via React Query ── */
  const { data: orders, isLoading: isLoadingOrders } = useQuery({
    queryKey: ["orders", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, clients(id, name, profile)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: clients, isLoading: isLoadingClients } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: warehouseFood, isLoading: isLoadingFood } = useQuery({
    queryKey: ["warehouse_food", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_food")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: lots, isLoading: isLoadingLots } = useQuery({
    queryKey: ["lots", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: boxes, isLoading: isLoadingBoxes } = useQuery({
    queryKey: ["boxes", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boxes")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: species, isLoading: isLoadingSpecies } = useQuery({
    queryKey: ["species", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const isLoading =
    isLoadingOrders ||
    isLoadingClients ||
    isLoadingFood ||
    isLoadingLots ||
    isLoadingBoxes ||
    isLoadingSpecies;

  /* ── Date Filtering Helpers ── */
  const filteredData = useMemo(() => {
    if (!orders || !clients || !warehouseFood) {
      return { orders: [], clients: [], food: [] };
    }

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let threshold: Date;
    if (timeframe === "day") {
      threshold = todayMidnight;
    } else if (timeframe === "week") {
      threshold = new Date(todayMidnight);
      threshold.setDate(threshold.getDate() - 7);
    } else if (timeframe === "month") {
      threshold = new Date(todayMidnight);
      threshold.setDate(threshold.getDate() - 30);
    } else {
      threshold = new Date(todayMidnight);
      threshold.setDate(threshold.getDate() - 365);
    }

    const filterItem = (item: { created_at?: string | null; audited_at?: string | null }) => {
      const dateStr = item.created_at || item.audited_at;
      if (!dateStr) return false;

      let date: Date;
      if (item.audited_at) {
        const [y, m, d] = item.audited_at.split("-").map(Number);
        date = new Date(y, m - 1, d);
      } else {
        date = new Date(dateStr);
      }

      return date.getTime() >= threshold.getTime();
    };

    return {
      orders: orders.filter(filterItem),
      clients: clients.filter(filterItem),
      food: warehouseFood.filter(filterItem),
    };
  }, [timeframe, orders, clients, warehouseFood]);

  /* ── Core KPI Calculations ── */
  const kpis = useMemo(() => {
    const historicalOrders = filteredData.orders.filter((o) => o.status === "historial");

    const totalRevenue = historicalOrders.reduce(
      (sum, o) => sum + (Number(o.total_mxn) || 0),
      0
    );

    return {
      netEarnings: totalRevenue,
      orderVolume: historicalOrders.length,
      newClients: filteredData.clients.length,
    };
  }, [filteredData]);

  /* ── Chart 1: Distribution of Sales by Client Profile ── */
  const clientProfileChartData = useMemo(() => {
    const profileRevenues: Record<string, number> = {
      particular: 0,
      pimvs: 0,
      uma: 0,
      veterinaria: 0,
      comercializadora: 0,
      uso_propio: 0,
    };

    const historicalOrders = filteredData.orders.filter((o) => o.status === "historial");

    historicalOrders.forEach((o) => {
      const client = clients?.find((c) => c.id === o.client_id);
      const profile = client?.profile ?? "particular";
      profileRevenues[profile] = (profileRevenues[profile] || 0) + (Number(o.total_mxn) || 0);
    });

    return Object.entries(profileRevenues)
      .map(([name, value]) => ({
        name: name.replace("_", " ").toUpperCase(),
        value: parseFloat(value.toFixed(2)),
      }))
      .filter((d) => d.value > 0);
  }, [filteredData, clients]);

  /* ── Chart 2: Feed Efficiency vs Material Cost ── */
  const feedCostChartData = useMemo(() => {
    if (timeframe === "day") {
      const intervals = [
        { label: "00:00 - 06:00", Alimento: 0, Ventas: 0 },
        { label: "06:00 - 12:00", Alimento: 0, Ventas: 0 },
        { label: "12:00 - 18:00", Alimento: 0, Ventas: 0 },
        { label: "18:00 - 24:00", Alimento: 0, Ventas: 0 },
      ];

      const now = new Date();
      const todayStr = now.toDateString();

      filteredData.orders.forEach((o) => {
        if (o.status !== "historial") return;
        const d = new Date(o.created_at);
        if (d.toDateString() === todayStr) {
          const hour = d.getHours();
          const idx = Math.floor(hour / 6);
          if (intervals[idx]) intervals[idx].Ventas += Number(o.total_mxn) || 0;
        }
      });

      filteredData.food.forEach((f) => {
        const d = f.audited_at
          ? new Date(
              ...((f.audited_at.split("-").map(Number) as [number, number, number]) || [0, 0, 0])
            )
          : new Date(f.created_at);
        if (d.toDateString() === todayStr) {
          const hour = d.getHours();
          const idx = Math.floor(hour / 6);
          const cost = (Number(f.quantity_grams) * (Number(f.unit_cost) || 0)) / 1000;
          if (intervals[idx]) intervals[idx].Alimento += cost;
        }
      });

      return intervals.map((i) => ({
        ...i,
        Ventas: parseFloat(i.Ventas.toFixed(2)),
        Alimento: parseFloat(i.Alimento.toFixed(2)),
      }));
    }

    if (timeframe === "week") {
      const days: { dateStr: string; label: string; Alimento: number; Ventas: number }[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        days.push({
          dateStr: d.toDateString(),
          label: d.toLocaleDateString("es-MX", { weekday: "short" }) + " " + d.getDate(),
          Alimento: 0,
          Ventas: 0,
        });
      }

      filteredData.orders.forEach((o) => {
        if (o.status !== "historial") return;
        const dStr = new Date(o.created_at).toDateString();
        const found = days.find((x) => x.dateStr === dStr);
        if (found) found.Ventas += Number(o.total_mxn) || 0;
      });

      filteredData.food.forEach((f) => {
        let d: Date;
        if (f.audited_at) {
          const [y, m, dVal] = f.audited_at.split("-").map(Number);
          d = new Date(y, m - 1, dVal);
        } else {
          d = new Date(f.created_at);
        }
        const dStr = d.toDateString();
        const found = days.find((x) => x.dateStr === dStr);
        if (found) {
          found.Alimento += (Number(f.quantity_grams) * (Number(f.unit_cost) || 0)) / 1000;
        }
      });

      return days.map((day) => ({
        label: day.label,
        Ventas: parseFloat(day.Ventas.toFixed(2)),
        Alimento: parseFloat(day.Alimento.toFixed(2)),
      }));
    }

    if (timeframe === "month") {
      const weeks = [
        { label: "Días 1-7", startDaysAgo: 30, endDaysAgo: 23, Alimento: 0, Ventas: 0 },
        { label: "Días 8-15", startDaysAgo: 22, endDaysAgo: 15, Alimento: 0, Ventas: 0 },
        { label: "Días 16-22", startDaysAgo: 14, endDaysAgo: 8, Alimento: 0, Ventas: 0 },
        { label: "Días 23-30", startDaysAgo: 7, endDaysAgo: 0, Alimento: 0, Ventas: 0 },
      ];

      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filteredData.orders.forEach((o) => {
        if (o.status !== "historial") return;
        const d = new Date(o.created_at);
        const diffDays = Math.floor(
          (todayMidnight.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
        );
        const found = weeks.find((w) => diffDays >= w.endDaysAgo && diffDays <= w.startDaysAgo);
        if (found) found.Ventas += Number(o.total_mxn) || 0;
      });

      filteredData.food.forEach((f) => {
        let d: Date;
        if (f.audited_at) {
          const [y, m, dVal] = f.audited_at.split("-").map(Number);
          d = new Date(y, m - 1, dVal);
        } else {
          d = new Date(f.created_at);
        }
        const diffDays = Math.floor(
          (todayMidnight.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
        );
        const found = weeks.find((w) => diffDays >= w.endDaysAgo && diffDays <= w.startDaysAgo);
        if (found) {
          found.Alimento += (Number(f.quantity_grams) * (Number(f.unit_cost) || 0)) / 1000;
        }
      });

      return weeks.map((w) => ({
        label: w.label,
        Ventas: parseFloat(w.Ventas.toFixed(2)),
        Alimento: parseFloat(w.Alimento.toFixed(2)),
      }));
    }

    // timeframe === "year"
    const months: { year: number; month: number; label: string; Alimento: number; Ventas: number }[] = [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }),
        Alimento: 0,
        Ventas: 0,
      });
    }

    filteredData.orders.forEach((o) => {
      if (o.status !== "historial") return;
      const d = new Date(o.created_at);
      const found = months.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
      if (found) found.Ventas += Number(o.total_mxn) || 0;
    });

    filteredData.food.forEach((f) => {
      let d: Date;
      if (f.audited_at) {
        const [y, m, dVal] = f.audited_at.split("-").map(Number);
        d = new Date(y, m - 1, dVal);
      } else {
        d = new Date(f.created_at);
      }
      const found = months.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
      if (found) {
        found.Alimento += (Number(f.quantity_grams) * (Number(f.unit_cost) || 0)) / 1000;
      }
    });

    return months.map((m) => ({
      label: m.label,
      Ventas: parseFloat(m.Ventas.toFixed(2)),
      Alimento: parseFloat(m.Alimento.toFixed(2)),
    }));
  }, [timeframe, filteredData]);

  /* ── Widget 3: Rodent Breeder Performance Table ── */
  const rodentBreederPerformance = useMemo(() => {
    if (!lots) return [];

    const rodentBirthLots = lots.filter(
      (l) => l.kind === "rodent" && l.lot_type === "birth"
    );

    const boxPerformance: Record<string, { totalOffspring: number; boxCode: string; location: string }> = {};

    rodentBirthLots.forEach((l) => {
      const boxId = l.box_id;
      if (!boxId) return;

      const count = (l.males ?? 0) + (l.females ?? 0) + (l.unsexed ?? 0);

      if (!boxPerformance[boxId]) {
        const box = boxes?.find((b) => b.id === boxId);
        boxPerformance[boxId] = {
          totalOffspring: 0,
          boxCode: box?.code ?? `Caja ${boxId.slice(0, 8)}`,
          location: box?.location ? box.location.split(" · ")[0] : "Sin ubicación",
        };
      }

      boxPerformance[boxId].totalOffspring += count;
    });

    return Object.values(boxPerformance).sort((a, b) => b.totalOffspring - a.totalOffspring);
  }, [lots, boxes]);

  /* ── Widget 4: Insect Colony Proliferation Indicator ── */
  const insectBreederPerformance = useMemo(() => {
    if (!lots) return [];

    const insectEngordaLots = lots.filter(
      (l) => l.kind === "insect" && l.lot_type === "engorda" && l.parent_lot_id !== null
    );

    const breederCounts: Record<string, { count: number; parentCode: string; speciesName: string }> = {};

    insectEngordaLots.forEach((l) => {
      const parentId = l.parent_lot_id;
      if (!parentId) return;

      if (!breederCounts[parentId]) {
        const parentLot = lots.find((pl) => pl.id === parentId);
        const speciesItem = species?.find((s) => s.id === l.species_id);

        breederCounts[parentId] = {
          count: 0,
          parentCode: parentLot?.lot_code ?? `Lote ${parentId.slice(0, 8)}`,
          speciesName: speciesItem?.name ?? "Especie desconocida",
        };
      }

      breederCounts[parentId].count += 1;
    });

    return Object.values(breederCounts).sort((a, b) => b.count - a.count);
  }, [lots, species]);

  /* ── Empty State Check ── */
  const isPeriodEmpty = useMemo(() => {
    return (
      filteredData.orders.length === 0 &&
      filteredData.clients.length === 0 &&
      filteredData.food.length === 0
    );
  }, [filteredData]);

  if (isLoading) {
    return (
      <PageShell
        title="Análisis y Reportes"
        subtitle="Cargando estadísticas en tiempo real..."
        icon={<BarChart3 className="h-6 w-6 text-emerald-glow" />}
      >
        <div className="space-y-6">
          <div className="flex justify-end">
            <div className="h-9 w-64 bg-slate-800/40 animate-pulse rounded-lg" />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="p-6 bg-slate-900/60 border-slate-800/60 space-y-3">
                <div className="h-4 w-24 bg-slate-800/40 animate-pulse rounded" />
                <div className="h-8 w-32 bg-slate-800/40 animate-pulse rounded" />
                <div className="h-3 w-16 bg-slate-800/40 animate-pulse rounded" />
              </Card>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            {[1, 2].map((n) => (
              <Card key={n} className="p-6 bg-slate-900/60 border-slate-800/60 h-80 space-y-4">
                <div className="h-5 w-48 bg-slate-800/40 animate-pulse rounded" />
                <div className="h-56 bg-slate-800/20 animate-pulse rounded-md" />
              </Card>
            ))}
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Análisis y Reportes"
      subtitle="Inteligencia de negocio, control financiero y rendimiento biológico."
      icon={<BarChart3 className="h-6 w-6 text-emerald-glow" />}
      actions={
        <div className="bg-slate-900/80 p-0.5 rounded-lg border border-slate-800 flex shadow-inner">
          {(["day", "week", "month", "year"] as const).map((t) => (
            <Button
              key={t}
              variant="ghost"
              size="sm"
              onClick={() => setTimeframe(t)}
              className={`text-xs px-3 h-8 capitalize transition-all duration-200 ${
                timeframe === t
                  ? "bg-emerald-500/10 text-emerald-glow border border-emerald-500/20 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "day" ? "Día" : t === "week" ? "Semana" : t === "month" ? "Mes" : "Año"}
            </Button>
          ))}
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── CORE KPI ROW ── */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-6 bg-slate-950/40 border-slate-800/60 flex items-center justify-between hover:border-slate-700/60 transition-all duration-300 shadow-lg">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Ganancias Netas
              </span>
              <div className="text-2xl font-black text-emerald-glow tracking-tight">
                ${kpis.netEarnings.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-glow" /> Ventas completadas en el período
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-glow shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <DollarSign className="h-5 w-5" />
            </div>
          </Card>

          <Card className="p-6 bg-slate-950/40 border-slate-800/60 flex items-center justify-between hover:border-slate-700/60 transition-all duration-300 shadow-lg">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Volumen de Pedidos
              </span>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {kpis.orderVolume} pedidos
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ShoppingBag className="h-3 w-3 text-muted-foreground" /> Estatus en historial
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-glow shadow-[0_0_15px_rgba(59,130,246,0.1)]">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </Card>

          <Card className="p-6 bg-slate-950/40 border-slate-800/60 flex items-center justify-between hover:border-slate-700/60 transition-all duration-300 shadow-lg">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Nuevos Clientes
              </span>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                +{kpis.newClients} registrados
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3 text-muted-foreground" /> Adquisición en el período elegido
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-glow shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <Users className="h-5 w-5" />
            </div>
          </Card>
        </div>

        {/* ── EMPTY STATE OR CHARTS GRID ── */}
        {isPeriodEmpty ? (
          <Card className="p-12 text-center border-dashed border-2 border-slate-800 bg-slate-950/10 rounded-xl space-y-3 max-w-xl mx-auto my-6">
            <div className="h-12 w-12 bg-slate-900/60 border border-slate-800 rounded-full flex items-center justify-center mx-auto text-muted-foreground">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">No hay datos analíticos para este período</h3>
            <p className="text-xs text-muted-foreground px-4">
              Intenta cambiar el rango de tiempo seleccionado a un período más amplio como "Mes" o "Año" para visualizar la actividad histórica de ventas y gastos.
            </p>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {/* WIDGET 1: DISTRIBUTION OF SALES BY PROFILE */}
            <Card className="p-5 bg-slate-950/40 border-slate-800/60 space-y-4 shadow-lg hover:border-slate-800 transition-all duration-200">
              <div className="flex items-center gap-2 border-b border-slate-800/40 pb-3">
                <PieChartIcon className="h-4 w-4 text-emerald-glow" />
                <h3 className="font-semibold text-sm text-foreground">Ventas por Perfil de Cliente</h3>
              </div>
              <div className="h-[280px] w-full flex items-center justify-center">
                {clientProfileChartData.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sin registros de ventas concretadas en este período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={clientProfileChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {clientProfileChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(15, 23, 42, 0.9)",
                          border: "1px solid rgba(30, 41, 59, 0.6)",
                          borderRadius: "8px",
                          color: "#e2e8f0",
                          fontSize: "11px",
                          backdropFilter: "blur(4px)",
                        }}
                        formatter={(val) => [`$${Number(val).toLocaleString()} MXN`, "Ventas"]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "10px", color: "#64748b" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* WIDGET 2: FEED COST VS SALES VALUE */}
            <Card className="p-5 bg-slate-950/40 border-slate-800/60 space-y-4 shadow-lg hover:border-slate-800 transition-all duration-200">
              <div className="flex items-center justify-between border-b border-slate-800/40 pb-3">
                <div className="flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-emerald-glow" />
                  <h3 className="font-semibold text-sm text-foreground">Costo de Alimento vs Ventas</h3>
                </div>
                <Badge variant="outline" className="text-[10px] text-muted-foreground uppercase tracking-widest border-slate-800">
                  {timeframe === "day" ? "24 Horas" : timeframe === "week" ? "Semanal" : timeframe === "month" ? "Mensual" : "Anual"}
                </Badge>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={feedCostChartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(15, 23, 42, 0.9)",
                        border: "1px solid rgba(30, 41, 59, 0.6)",
                        borderRadius: "8px",
                        color: "#e2e8f0",
                        fontSize: "11px",
                        backdropFilter: "blur(4px)",
                      }}
                      formatter={(val, name) => [`$${Number(val).toLocaleString()} MXN`, name]}
                    />
                    <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: "10px" }} />
                    <Bar dataKey="Ventas" name="Venta Comercial" fill="#34d399" radius={[4, 4, 0, 0]} opacity={0.85} />
                    <Line type="monotone" dataKey="Alimento" name="Costo de Alimento" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* ── BIOLOGICAL BREEDER PERFORMANCE SECTION ── */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* WIDGET 3: RODENT BREEDER BOX PERFORMANCE */}
          <Card className="bg-slate-950/40 border-slate-800/60 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-slate-800/60 bg-accent/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-emerald-glow" />
                <h3 className="font-semibold text-sm text-foreground">Rendimiento de Cajas (Roedores)</h3>
              </div>
              <Badge variant="outline" className="text-[9px] border-emerald-500/20 text-emerald-glow bg-emerald-500/5">
                Cunas de Nacimiento
              </Badge>
            </div>
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="bg-slate-950 text-[10px] uppercase text-muted-foreground sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="text-left p-3">Caja Reproductora</th>
                    <th className="text-left p-3">Ubicación</th>
                    <th className="text-right p-3">Total Crías Producidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {rodentBreederPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-muted-foreground">
                        No hay registros de nacimiento biológico en cunas de reproducción.
                      </td>
                    </tr>
                  ) : (
                    rodentBreederPerformance.map((box, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-emerald-glow flex items-center gap-1.5">
                          <span className="w-4 text-[9px] text-muted-foreground">#{idx + 1}</span>
                          {box.boxCode}
                        </td>
                        <td className="p-3 text-muted-foreground">{box.location}</td>
                        <td className="p-3 text-right font-black text-foreground">
                          {box.totalOffspring} <span className="text-[10px] font-normal text-muted-foreground">ind.</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* WIDGET 4: INSECT COLONY PROLIFERATION INDICATOR */}
          <Card className="bg-slate-950/40 border-slate-800/60 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-slate-800/60 bg-accent/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-glow" />
                <h3 className="font-semibold text-sm text-foreground">Desempeño de Lotes Insectos</h3>
              </div>
              <Badge variant="outline" className="text-[9px] border-amber-500/20 text-amber-glow bg-amber-500/5">
                Proliferación de Colonias
              </Badge>
            </div>
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead className="bg-slate-950 text-[10px] uppercase text-muted-foreground sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="text-left p-3">Lote Reproductor Origen</th>
                    <th className="text-left p-3">Especie</th>
                    <th className="text-right p-3">Sub-lotes de Engorda Generados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {insectBreederPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-muted-foreground">
                        No hay registros de subdivisión de colonias en este período.
                      </td>
                    </tr>
                  ) : (
                    insectBreederPerformance.map((parent, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-amber-glow flex items-center gap-1.5">
                          <span className="w-4 text-[9px] text-muted-foreground">#{idx + 1}</span>
                          {parent.parentCode}
                        </td>
                        <td className="p-3 text-muted-foreground">{parent.speciesName}</td>
                        <td className="p-3 text-right font-black text-foreground flex items-center justify-end gap-1.5">
                          {parent.count}
                          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-55" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
