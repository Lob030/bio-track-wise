import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TierGate } from "@/components/tier-gate";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/calendar")({
  component: () => (
    <TierGate min="gold" module="Calendario">
      <CalendarPage />
    </TierGate>
  ),
});

type CalendarEvent = {
  date: string; // YYYY-MM-DD
  type: "transition" | "ready_to_sell" | "order_due";
  title: string;
  lotCode: string;
  size?: string;
  color: string;
};

function CalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Fetch active lots
  const { data: lots } = useQuery({
    queryKey: ["lots-calendar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id, lot_code, started_at, species_id, kind, males, females, unsexed, status")
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  // Fetch species with size_rules
  const { data: species } = useQuery({
    queryKey: ["species-calendar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species")
        .select("id, name, size_rules, kind");
      if (error) throw error;
      return data;
    },
  });

  // Fetch orders with delivery dates
  const { data: orders } = useQuery({
    queryKey: ["orders-calendar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, delivered_at, notes, clients(name)")
        .eq("status", "preparando")
        .not("delivered_at", "is", null);
      if (error) throw error;
      return data;
    },
  });

  // Generate events from lot growth projections
  const events = useMemo((): CalendarEvent[] => {
    const evts: CalendarEvent[] = [];

    (lots ?? []).forEach(lot => {
      const sp = (species ?? []).find(s => s.id === lot.species_id);
      const rules = (sp?.size_rules as any[]) ?? [];
      const startDate = new Date(lot.started_at);

      rules.forEach((rule: any) => {
        // Size transition event
        const transitionDate = new Date(startDate);
        transitionDate.setDate(transitionDate.getDate() + rule.min_days);
        evts.push({
          date: transitionDate.toISOString().split("T")[0],
          type: "transition",
          title: `${lot.lot_code} → ${rule.label}`,
          lotCode: lot.lot_code ?? "",
          size: rule.label,
          color: "#14b8a6",
        });

        // Ready to sell event
        if (rule.price_mxn > 0) {
          evts.push({
            date: transitionDate.toISOString().split("T")[0],
            type: "ready_to_sell",
            title: `Vender ${lot.lot_code} (${rule.label} $${rule.price_mxn})`,
            lotCode: lot.lot_code ?? "",
            size: rule.label,
            color: "#10b981",
          });
        }
      });
    });

    // Order due dates
    (orders ?? []).forEach((order: any) => {
      if (order.delivered_at) {
        evts.push({
          date: order.delivered_at.split("T")[0],
          type: "order_due",
          title: `Entrega: ${(order.clients as any)?.name ?? "Cliente"}`,
          lotCode: "",
          color: "#f59e0b",
        });
      }
    });

    return evts;
  }, [lots, species, orders]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  // Calendar grid generation
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const monthName = new Date(currentYear, currentMonth).toLocaleString('es-MX', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <PageShell
      title="📅 Calendario de Producción"
      subtitle="Proyección de tallas, ventas y entregas en tiempo real."
      icon={<CalendarDays className="h-6 w-6" />}
    >
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <h2 className="text-lg font-semibold capitalize">{monthName}</h2>
              <Button variant="ghost" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2">
              {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => (
                <div key={d} className="text-center text-xs text-muted-foreground py-1 font-semibold">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const dayEvents = eventsByDate[dateStr] ?? [];
                const isToday = dateStr === today.toISOString().split("T")[0];
                const isSelected = dateStr === selectedDate;

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`
                      relative min-h-[56px] p-1 rounded-lg text-left transition-all cursor-pointer
                      ${isToday ? "ring-2 ring-primary" : ""}
                      ${isSelected ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted/50"}
                    `}
                  >
                    <span className={`text-xs font-medium ${isToday ? "text-primary" : "text-foreground"}`}>{day}</span>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {dayEvents.slice(0, 2).map((e, idx) => (
                        <div key={idx}
                          className="text-[9px] leading-tight px-1 rounded-sm truncate"
                          style={{ backgroundColor: `${e.color}25`, color: e.color }}>
                          {e.type === "order_due" ? "📦" : e.type === "ready_to_sell" ? "💰" : "📈"} {e.size ?? e.title.split(" ")[1]}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 2}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-3 mt-4 pt-3 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#14b8a6" }} />
                Transición de talla
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#10b981" }} />
                Listo para vender
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />
                Entrega programada
              </div>
            </div>
          </Card>
        </div>

        {/* Event detail panel */}
        <div className="space-y-3">
          {selectedDate ? (
            <Card className="p-4">
              <h3 className="font-semibold mb-3 text-sm">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin eventos este día.</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg border border-border/50" style={{ backgroundColor: `${e.color}10` }}>
                      <span>{e.type === "order_due" ? "📦" : e.type === "ready_to_sell" ? "💰" : "📈"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: e.color }}>{e.title}</p>
                        {e.lotCode && <p className="text-xs text-muted-foreground">Lote: {e.lotCode}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground text-center py-4">Selecciona un día para ver sus eventos</p>
            </Card>
          )}

          {/* Upcoming events (next 7 days) */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3 text-sm">Próximos 7 días</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Array.from({ length: 7 }).map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() + i);
                const dateStr = d.toISOString().split("T")[0];
                const dayEvts = eventsByDate[dateStr] ?? [];
                if (dayEvts.length === 0) return null;
                return (
                  <div key={dateStr}>
                    <p className="text-xs text-muted-foreground font-medium">{i === 0 ? "🔴 Hoy" : i === 1 ? "🟡 Mañana" : d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })}</p>
                    {dayEvts.slice(0, 2).map((e, j) => (
                      <p key={j} className="text-xs font-medium truncate" style={{ color: e.color }}>{e.title}</p>
                    ))}
                    {dayEvts.length > 2 && <p className="text-xs text-muted-foreground">+{dayEvts.length-2} más</p>}
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
