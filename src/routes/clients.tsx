import { createFileRoute } from "@tanstack/react-router";
import { TierGate } from "@/components/tier-gate";
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
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/clients")({
  component: () => <TierGate min="gold" module="Clientes"><Clients /></TierGate>,
});

function Clients() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", profile: "particular" });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (!form.name || !form.phone) return toast.error("Nombre y teléfono son obligatorios");
    const { error } = await supabase.from("clients").insert({ owner_id: u.user.id, ...form } as any);
    if (error) return toast.error(error.message.includes("TIER_LIMIT") ? "Límite del plan alcanzado." : error.message);
    toast.success("Cliente registrado");
    setOpen(false);
    setForm({ name: "", phone: "", profile: "particular" });
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" /> Clientes</h1>
          <p className="text-sm text-muted-foreground">Directorio de clientes y perfiles.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nuevo cliente</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Celular</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Perfil</Label>
                <Select value={form.profile} onValueChange={(v) => setForm({ ...form, profile: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["particular","pimvs","uma","veterinaria","comercializadora","uso_propio"].map(p =>
                      <SelectItem key={p} value={p} className="capitalize">{p.replace("_"," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={create}>Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 border-border bg-card/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/30 text-xs uppercase text-muted-foreground">
            <tr><th className="text-left p-3">Nombre</th><th className="text-left p-3">Celular</th><th className="text-left p-3">Perfil</th></tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 font-mono text-xs">{c.phone}</td>
                <td className="p-3"><Badge variant="outline" className="capitalize">{(c.profile ?? "particular").replace("_"," ")}</Badge></td>
              </tr>
            ))}
            {(clients ?? []).length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Sin clientes.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
