import { createFileRoute } from "@tanstack/react-router";
import { TierGate } from "@/components/tier-gate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Edit2, Trash2, Search, Mail, MessageSquare, Download } from "lucide-react";
import { exportToCSV } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/clients")({
  component: () => (
    <TierGate min="gold" module="Clientes">
      <Clients />
    </TierGate>
  ),
});

function Clients() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    profile: "particular",
  });

  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    profile: "particular",
  });
  const [deletingClient, setDeletingClient] = useState<any | null>(null);
  const [searchClient, setSearchClient] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const openEdit = (client: any) => {
    setEditingClient(client);
    setEditForm({
      name: client.name ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      notes: client.notes ?? "",
      profile: client.profile ?? "particular",
    });
  };

  const saveEdit = async () => {
    if (!editingClient) return;
    if (!editForm.name || !editForm.phone) {
      toast.error("Nombre y teléfono son obligatorios");
      return;
    }
    const { error } = await supabase
      .from("clients")
      .update({
        name: editForm.name,
        phone: editForm.phone,
        email: editForm.email || null,
        notes: editForm.notes || null,
        profile: editForm.profile,
      } as any)
      .eq("id", editingClient.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cliente actualizado");
    setEditingClient(null);
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  const deleteClient = async () => {
    if (!deletingClient) return;
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", deletingClient.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cliente eliminado");
    setDeletingClient(null);
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  const filteredClients = useMemo(() => {
    if (!searchClient.trim()) return clients ?? [];
    const q = searchClient.trim().toLowerCase();
    return (clients ?? []).filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
    );
  }, [clients, searchClient]);

  const create = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (!form.name || !form.phone) return toast.error("Nombre y teléfono son obligatorios");
    const { error } = await supabase.from("clients").insert({
      owner_id: u.user.id,
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      notes: form.notes || null,
      profile: form.profile,
    } as any);
    if (error) return toast.error(error.message.includes("TIER_LIMIT") ? "Límite del plan alcanzado." : error.message);
    toast.success("Cliente registrado");
    setOpen(false);
    setForm({ name: "", phone: "", email: "", notes: "", profile: "particular" });
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Users className="h-6 w-6" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Directorio de clientes y perfiles.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" className="gap-1.5 h-9"
            onClick={() => exportToCSV(
              `clientes-${new Date().toISOString().slice(0,10)}.csv`,
              ["Nombre", "Teléfono", "Email", "Perfil", "Notas"],
              (clients ?? []).map(c => [c.name, c.phone, c.email, c.profile, c.notes])
            )}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={searchClient}
              onChange={(e) => setSearchClient(e.target.value)}
              className="pl-9 h-10 w-56 focus-visible:ring-2 focus-visible:ring-primary"
            />
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
                  <Input
                    className="h-10 focus-visible:ring-2 focus-visible:ring-primary"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Celular *</Label>
                  <Input
                    className="h-10 focus-visible:ring-2 focus-visible:ring-primary"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Ej. 5512345678"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">
                    Email <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    className="h-10 focus-visible:ring-2 focus-visible:ring-primary"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Ej. juan@gmail.com"
                    type="email"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">
                    Notas <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    className="h-10 focus-visible:ring-2 focus-visible:ring-primary"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Ej. Paga puntual, requiere factura..."
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block text-foreground/90">Perfil</Label>
                  <Select value={form.profile} onValueChange={(v) => setForm({ ...form, profile: v })}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["particular", "pimvs", "uma", "veterinaria", "comercializadora", "uso_propio"].map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">
                          {p.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="h-10 transition-all duration-200 mt-2" onClick={create}>
                  Registrar cliente
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-0 border-border/50 bg-gradient-to-br from-card to-card/40 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/20 border-b border-border/30 text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="text-left p-3.5 pl-4 text-[11px] font-semibold uppercase text-muted-foreground">Nombre</th>
                <th className="text-left p-3.5 text-[11px] font-semibold uppercase text-muted-foreground">Celular</th>
                <th className="text-left p-3.5 text-[11px] font-semibold uppercase text-muted-foreground">Email</th>
                <th className="text-left p-3.5 text-[11px] font-semibold uppercase text-muted-foreground">Perfil</th>
                <th className="text-left p-3.5 pr-4 text-[11px] font-semibold uppercase text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c, i) => (
                <tr
                  key={c.id}
                  className={`border-b border-border/40 hover:bg-accent/15 transition-all duration-200 ${
                    i % 2 === 0 ? "bg-accent/5" : ""
                  }`}
                >
                  <td className="p-3.5 pl-4">
                    <p className="text-foreground font-semibold">{c.name}</p>
                    {c.notes && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {c.notes}
                      </p>
                    )}
                  </td>
                  <td className="p-3.5 font-mono text-xs text-muted-foreground font-medium">{c.phone}</td>
                  <td className="p-3.5 text-xs text-muted-foreground">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                        <Mail className="h-3 w-3" /> {c.email}
                      </a>
                    ) : (
                      <span className="text-border">—</span>
                    )}
                  </td>
                  <td className="p-3.5">
                    <Badge variant="outline" className="capitalize border-border/40 bg-accent/10">
                      {(c.profile ?? "particular").replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="p-3.5 pr-4">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary cursor-pointer"
                        onClick={() => openEdit(c)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                        onClick={() => setDeletingClient(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    {searchClient ? `Sin resultados para "${searchClient}"` : "Sin clientes registrados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editingClient} onOpenChange={(v) => !v && setEditingClient(null)}>
        <DialogContent className="max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Nombre *</Label>
              <Input
                className="h-10"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Celular *</Label>
              <Input
                className="h-10"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Email</Label>
              <Input
                className="h-10"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Notas</Label>
              <Input
                className="h-10"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Perfil</Label>
              <Select value={editForm.profile} onValueChange={(v) => setEditForm({ ...editForm, profile: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["particular", "pimvs", "uma", "veterinaria", "comercializadora", "uso_propio"].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-2 pt-4 border-t border-border/20 flex gap-2">
            <Button variant="outline" onClick={() => setEditingClient(null)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingClient} onOpenChange={(v) => !v && setDeletingClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente a <strong>{deletingClient?.name}</strong>. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={deleteClient}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
