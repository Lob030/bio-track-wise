import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  Printer,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { AdminOnly } from "@/components/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTransactionRequest } from "@/hooks/use-transaction-request";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { operationsDb } from "@/lib/operations-client";
import { pickCSVFile } from "@/lib/csv";
import { toUserFriendlyError } from "@/lib/errors";

export const Route = createFileRoute("/professional")({
  head: () => ({ meta: [{ title: "Control profesional - BioTrack" }] }),
  component: ProfessionalPage,
});

const money = (value: unknown) =>
  Number(value ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

function ProfessionalPage() {
  const { data: role, isLoading } = useRole();
  if (isLoading) {
    return (
      <PageShell title="Control profesional" subtitle="Cargando permisos...">
        <div />
      </PageShell>
    );
  }
  if (!role) {
    return (
      <PageShell title="Acceso restringido" subtitle="Se requiere una membresía activa.">
        <div />
      </PageShell>
    );
  }
  const isAdmin = role === "admin";
  return (
    <PageShell
      title="Control profesional"
      subtitle="Excepciones, finanzas, mantenimiento, etiquetas, importación y acceso por sede."
      icon={<ShieldCheck className="h-6 w-6" />}
    >
      <Tabs defaultValue={isAdmin ? "control" : "maintenance"} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          {isAdmin && <TabsTrigger value="control">Control</TabsTrigger>}
          {isAdmin && <TabsTrigger value="finance">Rentabilidad</TabsTrigger>}
          <TabsTrigger value="maintenance">Mantenimiento</TabsTrigger>
          <TabsTrigger value="labels">Etiquetas</TabsTrigger>
          {isAdmin && <TabsTrigger value="import">Importar</TabsTrigger>}
          {isAdmin && <TabsTrigger value="sites">Sedes</TabsTrigger>}
        </TabsList>
        {isAdmin && (
          <TabsContent value="control">
            <ControlPanel />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="finance">
            <FinancePanel />
          </TabsContent>
        )}
        <TabsContent value="maintenance">
          <MaintenancePanel isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="labels">
          <LabelsPanel />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="import">
            <ImportPanel />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="sites">
            <SitesPanel />
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  );
}

function useProfessionalRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["professional"] });
}

function ControlPanel() {
  const refresh = useProfessionalRefresh();
  const [decisionNotes, setDecisionNotes] = useState("Verificado contra conteo físico");
  const { data } = useQuery({
    queryKey: ["professional", "control"],
    queryFn: async () => {
      const [reconciliation, exceptions, approvals] = await Promise.all([
        operationsDb.from("operational_reconciliation").select("*").limit(300),
        operationsDb
          .from("operational_exceptions")
          .select("*")
          .order("occurred_at", { ascending: false })
          .limit(300),
        operationsDb
          .from("adjustment_approval_requests")
          .select("id,quantity_delta,reason,status,created_at,supply_items(name,unit)")
          .eq("status", "pending")
          .order("created_at"),
      ]);
      for (const result of [reconciliation, exceptions, approvals])
        if (result.error) throw result.error;
      return {
        reconciliation: reconciliation.data ?? [],
        exceptions: exceptions.data ?? [],
        approvals: approvals.data ?? [],
      };
    },
  });
  const decide = async (id: string, approved: boolean) => {
    const { error } = await operationsDb.rpc("decide_supply_adjustment_tx", {
      _approval_id: id,
      _approved: approved,
      _notes: decisionNotes,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success(approved ? "Ajuste aprobado y aplicado." : "Ajuste rechazado.");
    await refresh();
  };
  const reconciliation = data?.reconciliation ?? [];
  const exceptions = data?.exceptions ?? [];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Diferencias" value={reconciliation.length} tone="danger" />
        <Metric label="Excepciones activas" value={exceptions.length} tone="warning" />
        <Metric label="Aprobaciones pendientes" value={(data?.approvals ?? []).length} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <ClipboardCheck className="h-4 w-4" /> Conciliación
          </h3>
          <IssueTable rows={reconciliation} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Excepciones
          </h3>
          <IssueTable rows={exceptions} />
        </Card>
      </div>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Aprobaciones de inventario</h3>
          <Input
            className="max-w-sm"
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
            placeholder="Justificación de la decisión"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Insumo</TableHead>
              <TableHead>Diferencia</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Decisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.approvals ?? []).map((row: any) => (
              <TableRow key={row.id}>
                <TableCell>{row.supply_items?.name ?? "Insumo"}</TableCell>
                <TableCell>
                  {row.quantity_delta} {row.supply_items?.unit}
                </TableCell>
                <TableCell>{row.reason}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" onClick={() => decide(row.id, true)}>
                    Aprobar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide(row.id, false)}>
                    Rechazar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function IssueTable({ rows }: { rows: any[] }) {
  return (
    <div className="max-h-80 overflow-auto">
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sin incidencias.</p>
      ) : (
        rows.map((row) => (
          <div
            key={`${row.issue_type ?? row.exception_type}:${row.entity_id}`}
            className="flex items-start justify-between gap-3 border-b py-2"
          >
            <div>
              <p className="text-sm font-medium">{row.message}</p>
              <p className="text-xs text-muted-foreground">
                {row.issue_type ?? row.exception_type}
              </p>
            </div>
            <Badge variant={row.severity === "critical" ? "destructive" : "outline"}>
              {row.severity}
            </Badge>
          </div>
        ))
      )}
    </div>
  );
}

function FinancePanel() {
  const [dimension, setDimension] = useState("lot");
  const { data } = useQuery({
    queryKey: ["professional", "finance"],
    queryFn: async () => {
      const [profit, procurement] = await Promise.all([
        operationsDb
          .from("profitability_dimensions")
          .select("*")
          .order("margin", { ascending: true })
          .limit(500),
        operationsDb
          .from("professional_procurement_forecast")
          .select("*")
          .order("net_order_quantity", { ascending: false })
          .limit(500),
      ]);
      if (profit.error) throw profit.error;
      if (procurement.error) throw procurement.error;
      return { profit: profit.data ?? [], procurement: procurement.data ?? [] };
    },
  });
  const profit = (data?.profit ?? []).filter((row: any) => row.dimension_type === dimension);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <BadgeDollarSign className="h-5 w-5" /> Rentabilidad real
        </h3>
        <Select value={dimension} onValueChange={setDimension}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lot">Por lote</SelectItem>
            <SelectItem value="species">Por especie</SelectItem>
            <SelectItem value="line">Por línea</SelectItem>
            <SelectItem value="client">Por cliente</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dimensión</TableHead>
            <TableHead>Ingreso</TableHead>
            <TableHead>Costo reconocido</TableHead>
            <TableHead>Margen</TableHead>
            <TableHead>%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profit.map((row: any) => (
            <TableRow key={`${row.dimension_type}:${row.dimension_id}`}>
              <TableCell className="font-medium">{row.dimension_name}</TableCell>
              <TableCell>{money(row.revenue)}</TableCell>
              <TableCell>{money(row.cost)}</TableCell>
              <TableCell
                className={Number(row.margin) < 0 ? "text-destructive" : "text-emerald-500"}
              >
                {money(row.margin)}
              </TableCell>
              <TableCell>{row.margin_pct ?? "-"}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Card className="p-4">
        <h3 className="mb-3 font-semibold">Pronóstico de abastecimiento</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Insumo</TableHead>
              <TableHead>Cobertura</TableHead>
              <TableHead>Pedido abierto</TableHead>
              <TableHead>Por caducar</TableHead>
              <TableHead>Compra neta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.procurement ?? []).map((row: any) => (
              <TableRow key={row.supply_item_id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.coverage_days ?? "-"} días</TableCell>
                <TableCell>
                  {row.open_order_quantity} {row.unit}
                </TableCell>
                <TableCell>
                  {row.expiring_quantity} {row.unit}
                </TableCell>
                <TableCell className="font-semibold">
                  {row.net_order_quantity} {row.unit}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function MaintenancePanel({ isAdmin }: { isAdmin: boolean }) {
  const refresh = useProfessionalRefresh();
  const { user } = useAuth();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "equipment",
    title: "Mantenimiento preventivo",
    frequency: "30",
    due: new Date().toISOString().slice(0, 10),
    location: "none",
    assignee: "none",
    instructions: "",
  });
  const [completion, setCompletion] = useState({
    outcome: "completed",
    notes: "",
    cost: "",
    evidence: "",
  });
  const { data } = useQuery({
    queryKey: ["professional", "maintenance"],
    queryFn: async () => {
      const [plans, members, locations] = await Promise.all([
        operationsDb
          .from("maintenance_plans")
          .select(
            "id,title,frequency_days,next_due_on,assigned_user_id,maintenance_assets(code,name,asset_type,location_id)",
          )
          .eq("active", true)
          .order("next_due_on"),
        operationsDb
          .from("user_roles")
          .select("user_id,role,profiles(email,full_name)")
          .eq("status", "active"),
        operationsDb
          .from("facility_locations")
          .select("id,name,code,location_type")
          .eq("active", true)
          .order("name"),
      ]);
      for (const result of [plans, members, locations]) if (result.error) throw result.error;
      return {
        plans: plans.data ?? [],
        members: members.data ?? [],
        locations: locations.data ?? [],
      };
    },
  });
  const create = async () => {
    if (!form.code.trim() || !form.name.trim() || Number(form.frequency) <= 0)
      return toast.error("Código, nombre y frecuencia válida son obligatorios.");
    const op = `maintenance:create:${form.code}`;
    const { error } = await operationsDb.rpc("create_maintenance_plan_tx", {
      _request_id: getRequestId(op),
      _asset: {
        code: form.code,
        name: form.name,
        asset_type: form.type,
        location_id: form.location === "none" ? null : form.location,
      },
      _plan: {
        title: form.title,
        frequency_days: Number(form.frequency),
        next_due_on: form.due,
        assigned_user_id: form.assignee === "none" ? null : form.assignee,
        instructions: form.instructions || null,
      },
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    setForm({ ...form, code: "", name: "", instructions: "" });
    toast.success("Activo y plan creados.");
    await refresh();
  };
  const complete = async (id: string) => {
    if (!completion.notes.trim()) return toast.error("Describe el trabajo realizado o el motivo.");
    if (completion.cost && Number(completion.cost) < 0)
      return toast.error("El costo no puede ser negativo.");
    const op = `maintenance:complete:${id}`;
    const { error } = await operationsDb.rpc("complete_maintenance_tx", {
      _request_id: getRequestId(op),
      _plan_id: id,
      _outcome: completion.outcome,
      _notes: completion.notes,
      _cost: completion.cost ? Number(completion.cost) : null,
      _evidence_url: completion.evidence || null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    setCompletion({ outcome: "completed", notes: "", cost: "", evidence: "" });
    toast.success("Mantenimiento registrado.");
    await refresh();
  };
  const plans = data?.plans ?? [];
  return (
    <div className={`grid gap-5 ${isAdmin ? "xl:grid-cols-[380px_1fr]" : ""}`}>
      <AdminOnly>
        <Card className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <Wrench className="h-4 w-4" /> Nuevo activo
          </h3>
          <Input
            placeholder="Código"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["equipment", "rack", "box", "sensor", "hvac", "vehicle", "other"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Plan"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min="1"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            />
            <Input
              type="date"
              value={form.due}
              onChange={(e) => setForm({ ...form, due: e.target.value })}
            />
          </div>
          <Select
            value={form.location}
            onValueChange={(location) => setForm({ ...form, location })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Ubicación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin ubicación fija</SelectItem>
              {(data?.locations ?? []).map((location: any) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={form.assignee}
            onValueChange={(assignee) => setForm({ ...form, assignee })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Equipo compartido</SelectItem>
              {(data?.members ?? []).map((member: any) => {
                const profile = Array.isArray(member.profiles)
                  ? member.profiles[0]
                  : member.profiles;
                return (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {profile?.full_name ?? profile?.email ?? member.user_id.slice(0, 8)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Instrucciones"
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
          <Button onClick={create}>Crear plan</Button>
        </Card>
      </AdminOnly>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select
            value={completion.outcome}
            onValueChange={(outcome) => setCompletion({ ...completion, outcome })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completed">Completado</SelectItem>
              <SelectItem value="failed">Falló</SelectItem>
              <SelectItem value="rescheduled">Reprogramado</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Costo opcional"
            type="number"
            min="0"
            step="0.01"
            value={completion.cost}
            onChange={(e) => setCompletion({ ...completion, cost: e.target.value })}
          />
          <Input
            placeholder="URL de evidencia"
            type="url"
            value={completion.evidence}
            onChange={(e) => setCompletion({ ...completion, evidence: e.target.value })}
          />
          <Textarea
            placeholder="Trabajo realizado u observaciones"
            value={completion.notes}
            onChange={(e) => setCompletion({ ...completion, notes: e.target.value })}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Activo</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Próximo</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((row: any) => {
              const member = (data?.members ?? []).find(
                (item: any) => item.user_id === row.assigned_user_id,
              );
              const profile = Array.isArray(member?.profiles)
                ? member.profiles[0]
                : member?.profiles;
              const canComplete =
                isAdmin || !row.assigned_user_id || row.assigned_user_id === user?.id;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.maintenance_assets?.code} · {row.maintenance_assets?.name}
                  </TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.next_due_on < new Date().toISOString().slice(0, 10)
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {row.next_due_on}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {profile?.full_name ??
                      profile?.email ??
                      (row.assigned_user_id ? "Asignado" : "Compartido")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canComplete}
                      onClick={() => complete(row.id)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Completar
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LabelsPanel() {
  const [entity, setEntity] = useState("box");
  const [selected, setSelected] = useState<string[]>([]);
  const { data: entities = [] } = useQuery({
    queryKey: ["professional", "labels", entity],
    queryFn: async () => {
      const query =
        entity === "box"
          ? operationsDb.from("boxes").select("id,code,kind").limit(200)
          : entity === "lot"
            ? operationsDb.from("lots").select("id,lot_code,kind").limit(200)
            : operationsDb
                .from("facility_locations")
                .select("id,code,name,location_type")
                .limit(200);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const chosen = entities.filter((row: any) => selected.includes(row.id));
  const origin = typeof window === "undefined" ? "https://biotrack.local" : window.location.origin;
  const print = async () => {
    if (!selected.length) return toast.error("Selecciona al menos una etiqueta.");
    const { error } = await operationsDb.rpc("record_label_print_job_tx", {
      _entity_type: entity,
      _entity_ids: selected,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    window.print();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Select
          value={entity}
          onValueChange={(value) => {
            setEntity(value);
            setSelected([]);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="box">Cajas</SelectItem>
            <SelectItem value="lot">Lotes</SelectItem>
            <SelectItem value="location">Ubicaciones</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={print}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir {selected.length}
        </Button>
      </div>
      <div className="qr-print-area grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {entities.map((row: any) => {
          const label = row.code ?? row.lot_code ?? row.name;
          const url = `${origin}/operate?${entity}=${row.id}`;
          const checked = selected.includes(row.id);
          return (
            <Card
              key={row.id}
              className={`qr-label relative flex items-center gap-4 p-4 ${checked ? "border-primary" : ""} ${checked ? "" : "print:hidden"}`}
            >
              <Checkbox
                className="absolute right-3 top-3 print:hidden"
                checked={checked}
                onCheckedChange={() =>
                  setSelected(
                    checked ? selected.filter((id) => id !== row.id) : [...selected, row.id],
                  )
                }
              />
              <QRCodeSVG value={url} size={96} level="M" />
              <div className="min-w-0">
                <p className="truncate font-bold">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {entity} · {row.kind ?? row.location_type ?? "BioTrack"}
                </p>
                <p className="mt-2 break-all text-[9px] text-muted-foreground">{row.id}</p>
              </div>
            </Card>
          );
        })}
      </div>
      {chosen.length === 0 && (
        <p className="text-center text-sm text-muted-foreground print:hidden">
          Selecciona registros para preparar las etiquetas.
        </p>
      )}
    </div>
  );
}

function ImportPanel() {
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [entity, setEntity] = useState("supply_items");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [job, setJob] = useState<{ id: string; errors: any[] } | null>(null);
  const choose = async () => {
    try {
      setRows(await pickCSVFile());
      setJob(null);
    } catch {
      toast.error("El CSV no tiene un formato válido.");
    }
  };
  const validate = async () => {
    if (!rows.length) return toast.error("Selecciona un CSV.");
    const op = `import:validate:${crypto.randomUUID()}`;
    const { data, error } = await operationsDb.rpc("validate_import_job_tx", {
      _request_id: getRequestId(op),
      _entity_type: entity,
      _source_name: "import.csv",
      _rows: rows,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    const result = data as any;
    setJob({ id: result.job_id, errors: result.errors ?? [] });
    toast.success(result.valid ? "Archivo validado." : "La vista previa contiene errores.");
  };
  const apply = async () => {
    if (!job || job.errors.length) return;
    const op = `import:apply:${job.id}`;
    const { data, error } = await operationsDb.rpc("apply_import_job_tx", {
      _request_id: getRequestId(op),
      _job_id: job.id,
    });
    if (error) return toast.error(`${toUserFriendlyError(error)} No se guardó ninguna fila.`);
    resetRequestId(op);
    toast.success(`${Number((data as any)?.applied ?? 0)} filas importadas.`);
    setRows([]);
    setJob(null);
  };
  const headers = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Entidad">
          <Select
            value={entity}
            onValueChange={(v) => {
              setEntity(v);
              setRows([]);
              setJob(null);
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="supply_items">Insumos</SelectItem>
              <SelectItem value="clients">Clientes</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Button variant="outline" onClick={choose}>
          <FileUp className="mr-2 h-4 w-4" /> Seleccionar CSV
        </Button>
        <Button disabled={!rows.length} onClick={validate}>
          Validar {rows.length} filas
        </Button>
        <Button disabled={!job || job.errors.length > 0} onClick={apply}>
          Aplicar importación
        </Button>
      </Card>
      {job?.errors.map((error) => (
        <Card key={`${error.row}:${error.message}`} className="border-destructive p-3 text-sm">
          Fila {error.row}: {error.message}
        </Card>
      ))}
      {rows.length > 0 && (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 50).map((row, i) => (
                <TableRow key={i}>
                  {headers.map((h) => (
                    <TableCell key={h}>{row[h]}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SitesPanel() {
  const refresh = useProfessionalRefresh();
  const [form, setForm] = useState({ user: "", location: "" });
  const { data } = useQuery({
    queryKey: ["professional", "sites"],
    queryFn: async () => {
      const [locations, users, access] = await Promise.all([
        operationsDb
          .from("facility_locations")
          .select("id,code,name,location_type,parent_id")
          .order("name"),
        operationsDb
          .from("user_roles")
          .select("user_id,role,profiles(email,full_name)")
          .eq("status", "active"),
        operationsDb.from("facility_user_access").select("user_id,location_id,can_operate"),
      ]);
      for (const r of [locations, users, access]) if (r.error) throw r.error;
      return {
        locations: locations.data ?? [],
        users: users.data ?? [],
        access: access.data ?? [],
      };
    },
  });
  const grant = async (granted: boolean) => {
    if (!form.user || !form.location) return toast.error("Selecciona usuario y ubicación.");
    const { error } = await operationsDb.rpc("set_facility_user_access_tx", {
      _user_id: form.user,
      _location_id: form.location,
      _granted: granted,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success(granted ? "Acceso concedido." : "Acceso retirado.");
    await refresh();
  };
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <Select value={form.user} onValueChange={(user) => setForm({ ...form, user })}>
          <SelectTrigger>
            <SelectValue placeholder="Usuario" />
          </SelectTrigger>
          <SelectContent>
            {(data?.users ?? []).map((u: any) => {
              const p = Array.isArray(u.profiles) ? u.profiles[0] : u.profiles;
              return (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {p?.full_name ?? p?.email ?? u.user_id.slice(0, 8)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select value={form.location} onValueChange={(location) => setForm({ ...form, location })}>
          <SelectTrigger>
            <SelectValue placeholder="Sede o ubicación" />
          </SelectTrigger>
          <SelectContent>
            {(data?.locations ?? []).map((l: any) => (
              <SelectItem key={l.id} value={l.id}>
                {l.location_type} · {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => grant(true)}>Conceder</Button>
        <Button variant="outline" onClick={() => grant(false)}>
          Retirar
        </Button>
      </Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead>Ubicación autorizada</TableHead>
            <TableHead>Operación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.access ?? []).map((a: any) => {
            const u = (data?.users ?? []).find((x: any) => x.user_id === a.user_id);
            const p = Array.isArray(u?.profiles) ? u.profiles[0] : u?.profiles;
            const l = (data?.locations ?? []).find((x: any) => x.id === a.location_id);
            return (
              <TableRow key={`${a.user_id}:${a.location_id}`}>
                <TableCell>{p?.full_name ?? p?.email ?? a.user_id.slice(0, 8)}</TableCell>
                <TableCell>{l?.name ?? a.location_id.slice(0, 8)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{a.can_operate ? "Permitida" : "Lectura"}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-bold ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-500" : ""}`}
      >
        {value}
      </p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
