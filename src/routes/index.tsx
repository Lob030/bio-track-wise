import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Users, ShoppingCart, Wallet, Boxes, Bell, TrendingUp, FlaskConical
} from "lucide-react";
import { useProfile } from "@/hooks/use-profile";

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

function Dashboard() {
  const { data: profile } = useProfile();
  const month = new Date(); month.setDate(1);

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [lots, clients, orders, alerts, boxes] = await Promise.all([
        supabase.from("lots").select("id, lot_type, status, kind, started_at, lot_code, box_id").eq("status", "active"),
        supabase.from("clients").select("id, created_at").gte("created_at", month.toISOString()),
        supabase.from("orders").select("id, total_mxn, created_at, status").gte("created_at", month.toISOString()),
        supabase.from("alerts").select("id").eq("acknowledged", false),
        supabase.from("boxes").select("id"),
      ]);
      return {
        lots: lots.data ?? [],
        clients: clients.data ?? [],
        orders: orders.data ?? [],
        alerts: alerts.data ?? [],
        boxes: boxes.data ?? [],
      };
    },
  });

  const lots = data?.lots ?? [];
  const sales = (data?.orders ?? []).reduce((a, o) => a + Number(o.total_mxn || 0), 0);
  const breeders = lots.filter((l) => l.lot_type === "breeder").length;
  const occupiedBoxes = new Set(lots.map((l) => l.box_id).filter(Boolean)).size;
  const totalBoxes = data?.boxes.length ?? 0;
  const free = Math.max(0, totalBoxes - occupiedBoxes);

  const byKind = {
    rodent: lots.filter((l) => l.kind === "rodent").length,
    insect: lots.filter((l) => l.kind === "insect").length,
  };
  const total = byKind.rodent + byKind.insect || 1;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Activity} label="Lotes activos" value={lots.length} sub={`${byKind.rodent} roedores · ${byKind.insect} insectos`} tone="success" />
        <KPI icon={Users} label="Nuevos clientes (mes)" value={data?.clients.length ?? 0} />
        <KPI icon={ShoppingCart} label="Órdenes (mes)" value={data?.orders.length ?? 0} />
        <KPI icon={Wallet} label="Gastos (mes)" value={"—"} sub="Sin registros" />
        <KPI icon={Boxes} label="Ocupación de cajas" value={`${occupiedBoxes}/${totalBoxes}`} sub={`${free} libres`} />
        <KPI icon={Bell} label="Alertas pendientes" value={data?.alerts.length ?? 0} tone={(data?.alerts.length ?? 0) > 0 ? "warning" : "default"} />
        <KPI icon={TrendingUp} label="Ventas (mes)" value={`$${sales.toLocaleString("es-MX")}`} sub="MXN" tone="success" />
        <KPI icon={FlaskConical} label="Lotes reproductores" value={breeders} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 border-border bg-card/60 lg:col-span-2">
          <h3 className="font-semibold mb-3">Lotes activos recientes</h3>
          <div className="divide-y divide-border">
            {lots.slice(0, 8).map((l) => (
              <div key={l.id} className="py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${l.kind === "rodent" ? "bg-emerald-glow" : "bg-amber-glow"}`} />
                  <span className="font-mono text-xs text-muted-foreground">{l.lot_code ?? l.id.slice(0, 8)}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{l.lot_type}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(l.started_at).toLocaleDateString("es-MX")}</span>
              </div>
            ))}
            {lots.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin lotes activos todavía.</p>}
          </div>
        </Card>

        <Card className="p-5 border-border bg-card/60">
          <h3 className="font-semibold mb-4">Distribución demográfica</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span>Roedores</span>
                <span className="text-muted-foreground">{byKind.rodent}</span>
              </div>
              <Progress value={(byKind.rodent / total) * 100} />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span>Insectos</span>
                <span className="text-muted-foreground">{byKind.insect}</span>
              </div>
              <Progress value={(byKind.insect / total) * 100} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
