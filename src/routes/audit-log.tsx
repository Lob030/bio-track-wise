import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, Eye, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { AdminOnly } from "@/components/role-gate";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportToCSV } from "@/lib/utils";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Bitácora operativa — BioTrack" },
      { name: "description", content: "Bitácora operativa de BioTrack." },
    ],
  }),
  component: AuditLogPage,
});

type AuditRow = Tables<"audit_log">;
type AuditAction = AuditRow["action"];

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  record_created: "Alta",
  record_updated: "Edición",
  record_deleted: "Baja",
  birth: "Nacimiento",
  mortality: "Mortalidad",
  lot_move: "Movimiento",
  lot_split: "División",
  lot_merge: "Unión",
  lot_finalize: "Finalización",
  sale_created: "Venta",
  sale_delivered: "Entrega",
  fifo_allocation: "Asignación FIFO",
  inventory_adjustment: "Ajuste de inventario",
  purchase_created: "Compra",
  role_change: "Cambio de rol",
  member_suspended: "Suspensión",
  member_reinstated: "Reactivación",
  member_revoked: "Revocación",
  invite_sent: "Invitación enviada",
  invite_accepted: "Invitación aceptada",
  invite_revoked: "Invitación revocada",
  configuration_change: "Configuración",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

function actionClass(action: string) {
  if (["record_deleted", "mortality", "member_revoked"].includes(action)) {
    return "border-red-500/35 bg-red-500/10 text-red-300";
  }
  if (["record_created", "birth", "sale_created", "purchase_created"].includes(action)) {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-300";
  }
  if (["lot_move", "lot_split", "lot_merge", "fifo_allocation"].includes(action)) {
    return "border-cyan-500/35 bg-cyan-500/10 text-cyan-300";
  }
  return "border-border bg-muted/40 text-foreground";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function jsonText(value: Json | null) {
  return value == null ? "Sin datos" : JSON.stringify(value, null, 2);
}

function AuditLogPage() {
  return (
    <AdminOnly
      fallback={
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Solo los administradores pueden consultar la bitácora.
          </p>
        </div>
      }
    >
      <AuditLogContent />
    </AdminOnly>
  );
}

function AuditLogContent() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [actor, setActor] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const { data: auditPage, isLoading } = useQuery({
    queryKey: ["audit-log", { action, entity, actor, dateFrom, dateTo, page }],
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });
      if (action !== "all") query = query.eq("action", action as AuditAction);
      if (entity !== "all") query = query.eq("target_table", entity);
      if (actor !== "all") query = query.eq("actor_user_id", actor);
      if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
      const { data, error, count } = await query.range(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const logs = useMemo(() => auditPage?.rows ?? [], [auditPage?.rows]);

  const { data: profiles } = useQuery({
    queryKey: ["audit-log-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const profileMap = useMemo(
    () => new Map((profiles ?? []).map((profile) => [profile.id, profile])),
    [profiles],
  );

  const actions = useMemo(() => [...new Set(logs.map((entry) => entry.action))].sort(), [logs]);
  const entities = useMemo(
    () => [...new Set(logs.map((entry) => entry.target_table).filter(Boolean))].sort() as string[],
    [logs],
  );
  const actors = useMemo(
    () => [...new Set(logs.map((entry) => entry.actor_user_id).filter(Boolean))] as string[],
    [logs],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return logs.filter((entry) => {
      const profile = entry.actor_user_id ? profileMap.get(entry.actor_user_id) : null;
      const searchable = [
        entry.operation,
        entry.target_table,
        entry.target_id,
        entry.origin,
        entry.reason,
        entry.request_id,
        profile?.full_name,
        profile?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es-MX");
      const timestamp = new Date(entry.created_at).getTime();

      return (
        (!term || searchable.includes(term)) &&
        (action === "all" || entry.action === action) &&
        (entity === "all" || entry.target_table === entity) &&
        (actor === "all" || entry.actor_user_id === actor) &&
        (from == null || timestamp >= from) &&
        (to == null || timestamp <= to)
      );
    });
  }, [logs, profileMap, search, action, entity, actor, dateFrom, dateTo]);

  useEffect(() => setPage(1), [search, action, entity, actor, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(auditPage?.total ? auditPage.total / PAGE_SIZE : 1));
  const visibleRows = filtered;

  const handleExport = () => {
    exportToCSV(
      `BioTrack-Bitacora-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Fecha",
        "Operación",
        "Acción",
        "Entidad",
        "Registro",
        "Usuario",
        "Correo",
        "Origen",
        "Motivo",
        "Request ID",
        "Valores anteriores",
        "Valores nuevos",
        "Hash",
      ],
      filtered.map((entry) => {
        const profile = entry.actor_user_id ? profileMap.get(entry.actor_user_id) : null;
        return [
          entry.created_at,
          entry.operation,
          actionLabel(entry.action),
          entry.target_table,
          entry.target_id,
          profile?.full_name ?? entry.actor_user_id ?? "Sistema",
          profile?.email,
          entry.origin,
          entry.reason,
          entry.request_id,
          entry.old_values == null ? null : JSON.stringify(entry.old_values),
          entry.new_values == null ? null : JSON.stringify(entry.new_values),
          entry.entry_hash,
        ];
      }),
    );
  };

  return (
    <PageShell
      title="Bitácora operativa"
      icon={<ClipboardList className="h-6 w-6" />}
      actions={
        <Button onClick={handleExport} disabled={filtered.length === 0} size="sm">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(150px,0.7fr))_repeat(2,minmax(140px,0.6fr))]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar en esta página"
              className="pl-9"
            />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger aria-label="Filtrar por operación">
              <SelectValue placeholder="Operación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las operaciones</SelectItem>
              {actions.map((value) => (
                <SelectItem key={value} value={value}>
                  {actionLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger aria-label="Filtrar por entidad">
              <SelectValue placeholder="Entidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las entidades</SelectItem>
              {entities.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger aria-label="Filtrar por usuario">
              <SelectValue placeholder="Usuario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los usuarios</SelectItem>
              {actors.map((userId) => {
                const profile = profileMap.get(userId);
                return (
                  <SelectItem key={userId} value={userId}>
                    {profile?.full_name || profile?.email || userId.slice(0, 8)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="grid gap-1">
            <Label htmlFor="audit-date-from" className="text-[11px] text-muted-foreground">
              Desde
            </Label>
            <Input
              id="audit-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="audit-date-to" className="text-[11px] text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="audit-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{(auditPage?.total ?? 0).toLocaleString("es-MX")} eventos</span>
          <span>
            Página {page} de {totalPages}
          </span>
        </div>

        <Card className="overflow-hidden border-border/60">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Fecha</TableHead>
                    <TableHead className="w-[170px]">Operación</TableHead>
                    <TableHead>Entidad</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        Sin eventos para los filtros seleccionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((entry) => {
                      const profile = entry.actor_user_id
                        ? profileMap.get(entry.actor_user_id)
                        : null;
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDate(entry.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={actionClass(entry.action)}>
                              {actionLabel(entry.action)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{entry.target_table ?? "—"}</div>
                            <div className="max-w-[210px] truncate font-mono text-[10px] text-muted-foreground">
                              {entry.target_id ?? entry.operation}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[190px] truncate text-sm">
                              {profile?.full_name || profile?.email || "Sistema"}
                            </div>
                            {entry.actor_user_id && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {entry.actor_user_id.slice(0, 8)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                            {entry.origin}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setSelected(entry)}
                              title="Ver detalle"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {totalPages > 1 && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de auditoría</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Fecha</div>
                  <div>{formatDate(selected.created_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Operación</div>
                  <div>{selected.operation}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Origen</div>
                  <div className="break-all font-mono text-xs">{selected.origin}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Registro</div>
                  <div className="break-all font-mono text-xs">{selected.target_id ?? "—"}</div>
                </div>
              </div>
              {selected.reason && (
                <div>
                  <div className="text-xs text-muted-foreground">Motivo</div>
                  <div className="text-sm">{selected.reason}</div>
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    Valores anteriores
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
                    {jsonText(selected.old_values)}
                  </pre>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    Valores nuevos
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
                    {jsonText(selected.new_values)}
                  </pre>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Huella SHA-256</div>
                <div className="break-all font-mono text-[11px]">{selected.entry_hash}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
