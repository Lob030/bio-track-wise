import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Rat } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/rodents/lots")({ component: RodentLots });

function RodentLots() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ lot_code: "", lot_type: "engorda", males: 0, females: 0, unsexed: 0, notes: "" });

  const { data: lots } = useQuery({
    queryKey: ["rodent-lots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lots").select("*").eq("kind", "rodent").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("lots").insert({
      owner_id: u.user.id, kind: "rodent",
      lot_code: form.lot_code || null, lot_type: form.lot_type as any,
      males: form.males, females: form.females, unsexed: form.unsexed, notes: form.notes,
    });
    if (error) return toast.error(error.message.includes("TIER_LIMIT") ? "Límite del plan alcanzado. Actualiza tu suscripción." : error.message);
    toast.success("Lote creado");
    setOpen(false);
    setForm({ lot_code: "", lot_type: "engorda", males: 0, females: 0, unsexed: 0, notes: "" });
    qc.invalidateQueries({ queryKey: ["rodent-lots"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Rat className="h-6 w-6" /> Lotes de Roedores</h1>
          <p className="text-sm text-muted-foreground">Control individual de machos, hembras y sin sexar.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nuevo lote</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo lote de roedores</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Código de lote</Label><Input value={form.lot_code} onChange={(e) => setForm({ ...form, lot_code: e.target.value })} placeholder="R-01" /></div>
              <div><Label>Tipo</Label>
                <Select value={form.lot_type} onValueChange={(v) => setForm({ ...form, lot_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breeder">Reproductor</SelectItem>
                    <SelectItem value="engorda">Engorda</SelectItem>
                    <SelectItem value="birth">Nacimiento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Machos</Label><Input type="number" value={form.males} onChange={(e) => setForm({ ...form, males: +e.target.value })} /></div>
                <div><Label>Hembras</Label><Input type="number" value={form.females} onChange={(e) => setForm({ ...form, females: +e.target.value })} /></div>
                <div><Label>Sin sexar</Label><Input type="number" value={form.unsexed} onChange={(e) => setForm({ ...form, unsexed: +e.target.value })} /></div>
              </div>
              <div><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={create}>Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 border-border bg-card/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/30 text-xs uppercase text-muted-foreground">
            <tr><th className="text-left p-3">Código</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">M</th><th className="text-left p-3">H</th><th className="text-left p-3">S/S</th><th className="text-left p-3">Estado</th><th className="text-left p-3">Inicio</th></tr>
          </thead>
          <tbody>
            {(lots ?? []).map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{l.lot_code ?? l.id.slice(0, 8)}</td>
                <td className="p-3"><Badge variant="outline" className="capitalize text-[10px]">{l.lot_type}</Badge></td>
                <td className="p-3">{l.males}</td>
                <td className="p-3">{l.females}</td>
                <td className="p-3">{l.unsexed}</td>
                <td className="p-3"><Badge variant={l.status === "active" ? "default" : "secondary"} className="text-[10px]">{l.status}</Badge></td>
                <td className="p-3 text-muted-foreground text-xs">{new Date(l.started_at).toLocaleDateString("es-MX")}</td>
              </tr>
            ))}
            {(lots ?? []).length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sin lotes registrados.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
