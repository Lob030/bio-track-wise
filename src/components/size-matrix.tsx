import { Card } from "@/components/ui/card";

export type RodentRule = { label: string; min_days: number; max_days: number; min_weight_g?: number; max_weight_g?: number; daily_feed_g?: number; price_mxn?: number };
export type InsectRule = { label: string; min_days: number; max_days: number; individuals_per_gram?: number; price_mxn?: number };

export function RodentSizeMatrix({ rules }: { rules: RodentRule[] }) {
  if (!rules?.length) return <p className="text-xs text-muted-foreground italic">Sin matriz definida.</p>;
  return (
    <Card className="overflow-hidden border-border bg-card/40 p-0">
      <table className="w-full text-sm">
        <thead className="bg-accent/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-2.5">Talla</th>
            <th className="text-left p-2.5">Días</th>
            <th className="text-left p-2.5">Peso</th>
            <th className="text-left p-2.5">Consumo alimento</th>
            <th className="text-left p-2.5">Precio (MXN)</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="p-2.5 font-medium text-emerald-glow">{r.label}</td>
              <td className="p-2.5 text-muted-foreground">{r.min_days}–{r.max_days} d</td>
              <td className="p-2.5">{(r.min_weight_g ?? 0)}–{(r.max_weight_g ?? 0)} g</td>
              <td className="p-2.5">{(r.daily_feed_g ?? 0)} g/día</td>
              <td className="p-2.5 font-semibold text-emerald-400">{r.price_mxn != null ? `$${r.price_mxn}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function InsectSizeMatrix({ rules }: { rules: InsectRule[] }) {
  if (!rules?.length) return <p className="text-xs text-muted-foreground italic">Sin matriz definida.</p>;
  return (
    <Card className="overflow-hidden border-border bg-card/40 p-0">
      <table className="w-full text-sm">
        <thead className="bg-accent/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-2.5">Etapa</th>
            <th className="text-left p-2.5">Días</th>
            <th className="text-left p-2.5">Cantidad de individuos por 1 gramo</th>
            <th className="text-left p-2.5">Precio (MXN)</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="p-2.5 font-medium text-emerald-glow">{r.label}</td>
              <td className="p-2.5 text-muted-foreground">{r.min_days}–{r.max_days} d</td>
              <td className="p-2.5">{(r.individuals_per_gram ?? 0).toLocaleString("es-MX")}</td>
              <td className="p-2.5 font-semibold text-emerald-400">{r.price_mxn != null ? `$${r.price_mxn}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
