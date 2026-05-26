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
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground"><Users className="h-6 w-6" /> Clientes</h1>
          <p className="text-sm text-muted-foreground">Directorio de clientes y perfiles.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-10 md:h-9 min-h-10 md:min-h-9 transition-all duration-200">
              <Plus className="h-5 md:h-4 w-5 md:w-4 mr-2" /> Nuevo cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl p-6 gap-6 max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">Nuevo cliente</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Nombre *</Label>
                <Input className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Juan Pérez" />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Celular *</Label>
                <Input className="h-10 focus-visible:ring-2 focus-visible:ring-primary" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Ej. 5512345678" />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Perfil</Label>
                <Select value={form.profile} onValueChange={(v) => setForm({ ...form, profile: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["particular","pimvs","uma","veterinaria","comercializadora","uso_propio"].map(p =>
                      <SelectItem key={p} value={p} className="capitalize">{p.replace("_"," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button className="h-10 transition-all duration-200 mt-2" onClick={create}>Registrar cliente</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/20 border-b border-border/30 text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="text-left p-3.5 pl-4 text-[11px] font-semibold uppercase text-muted-foreground">Nombre</th>
                <th className="text-left p-3.5 text-[11px] font-semibold uppercase text-muted-foreground">Celular</th>
                <th className="text-left p-3.5 pr-4 text-[11px] font-semibold uppercase text-muted-foreground">Perfil</th>
              </tr>
            </thead>
            <tbody>
              {(clients ?? []).map((c, i) => (
                <tr key={c.id} className={`border-b border-border/40 hover:bg-accent/15 transition-all duration-200 ${i % 2 === 0 ? "bg-accent/5" : ""}`}>
                  <td className="p-3.5 pl-4 text-foreground font-semibold">{c.name}</td>
                  <td className="p-3.5 font-mono text-xs text-muted-foreground font-medium">{c.phone}</td>
                  <td className="p-3.5 pr-4">
                    <Badge variant="outline" className="capitalize border-border/40 bg-accent/10">
                      {(c.profile ?? "particular").replace("_"," ")}
                    </Badge>
                  </td>
                </tr>
              ))}
              {(clients ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="p-10 text-center text-muted-foreground font-medium">Sin clientes registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
