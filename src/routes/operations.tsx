import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Clock3,
  ClipboardCheck,
  HeartPulse,
  MapPinned,
  PackageCheck,
  Plus,
  RefreshCw,
  Settings2,
  Users2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { QrScannerDialog } from "@/components/qr-scanner-dialog";
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
import { useOfflineRpcQueue } from "@/hooks/use-offline-rpc-queue";
import { useIsAdmin } from "@/hooks/use-role";
import { toUserFriendlyError } from "@/lib/errors";
import {
  operationsDb,
  type OperationalTask,
  type SimpleBox,
  type SimpleLot,
} from "@/lib/operations-client";

export const Route = createFileRoute("/operations")({
  head: () => ({ meta: [{ title: "Centro operativo - BioTrack" }] }),
  component: OperationsPage,
});

const dateTimeLocal = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
const dateOnly = () => new Date().toISOString().slice(0, 10);

function OperationsPage() {
  const isAdmin = useIsAdmin();
  return (
    <PageShell
      title="Centro operativo"
      subtitle="Trabajo diario, instalaciones, sanidad, reproducción y abastecimiento."
      icon={<Activity className="h-6 w-6" />}
    >
      <Tabs defaultValue="day" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="day">Jornada</TabsTrigger>
          <TabsTrigger value="locations">Ubicaciones</TabsTrigger>
          <TabsTrigger value="protocols">Protocolos</TabsTrigger>
          <TabsTrigger value="shifts">Turnos</TabsTrigger>
          <TabsTrigger value="health">Sanidad</TabsTrigger>
          <TabsTrigger value="breeding">Reproducción</TabsTrigger>
          <TabsTrigger value="planning">Planeación</TabsTrigger>
          <TabsTrigger value="supplies">Compras</TabsTrigger>
        </TabsList>
        <TabsContent value="day">
          <DailyWork />
        </TabsContent>
        <TabsContent value="locations">
          <Locations isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="protocols">
          <Protocols isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="shifts">
          <ShiftManagement isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="health">
          <Health isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="breeding">
          <Breeding isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="planning">
          <Planning />
        </TabsContent>
        <TabsContent value="supplies">
          <Supplies isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function useOperationsRefresh() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ["operations"] }), [qc]);
}

function useLotsAndBoxes() {
  return useQuery({
    queryKey: ["operations", "targets"],
    queryFn: async () => {
      const [lots, boxes] = await Promise.all([
        operationsDb
          .from("lots")
          .select("id,lot_code,kind,box_id,species_id,started_at")
          .eq("status", "active")
          .limit(1000),
        operationsDb
          .from("boxes")
          .select("id,code,kind,location_id")
          .eq("status", "active")
          .limit(1000),
      ]);
      if (lots.error) throw lots.error;
      if (boxes.error) throw boxes.error;
      return { lots: (lots.data ?? []) as SimpleLot[], boxes: (boxes.data ?? []) as SimpleBox[] };
    },
  });
}

function DailyWork() {
  const refresh = useOperationsRefresh();
  const { online, pending, queueRpc } = useOfflineRpcQueue(refresh);
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["operations", "tasks"],
    queryFn: async () => {
      const { data, error } = await operationsDb
        .from("operational_tasks")
        .select("id,title,task_type,due_at,priority,status,instructions,lot_id,box_id")
        .in("status", ["pending", "in_progress"])
        .order("due_at")
        .limit(300);
      if (error) throw error;
      return (data ?? []) as OperationalTask[];
    },
  });
  const overdue = tasks.filter((task) => new Date(task.due_at) < new Date()).length;

  const generate = async () => {
    const { data, error } = await operationsDb.rpc("generate_operational_tasks", {
      _for_date: dateOnly(),
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success(`${Number((data as { created?: number })?.created ?? 0)} tareas generadas.`);
    await refresh();
  };
  const complete = async (task: OperationalTask, outcome: "completed" | "skipped") => {
    const operation = `task:${task.id}:${outcome}`;
    const args = {
      _request_id: getRequestId(operation),
      _task_id: task.id,
      _outcome: outcome,
      _notes: notes[task.id]?.trim() || null,
      _labor_minutes: minutes[task.id] ? Number(minutes[task.id]) : null,
    };
    if (!online) {
      queueRpc("complete_operational_task_tx", args);
      toast.success("Tarea guardada para sincronizar al recuperar conexión.");
      return;
    }
    setSaving(task.id);
    try {
      const { error } = await operationsDb.rpc("complete_operational_task_tx", args);
      if (error) throw error;
      resetRequestId(operation);
      toast.success(outcome === "completed" ? "Tarea completada." : "Tarea omitida con registro.");
      await refresh();
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Badge variant="outline">{tasks.length} pendientes</Badge>
          <Badge variant={overdue ? "destructive" : "secondary"}>{overdue} vencidas</Badge>
          {!online && (
            <Badge variant="destructive">
              <WifiOff className="mr-1 h-3 w-3" /> Sin conexión
            </Badge>
          )}
          {pending > 0 && <Badge variant="outline">{pending} por sincronizar</Badge>}
        </div>
        <AdminOnly>
          <Button variant="outline" onClick={generate}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Generar jornada
          </Button>
        </AdminOnly>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando jornada...</p>
      ) : tasks.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No hay tareas pendientes para esta jornada.
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {tasks.map((task) => (
            <Card key={task.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{task.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(task.due_at).toLocaleString("es-MX")}
                  </p>
                </div>
                <Badge variant={task.priority === "critical" ? "destructive" : "outline"}>
                  {task.priority}
                </Badge>
              </div>
              {task.instructions && (
                <p className="text-sm text-muted-foreground">{task.instructions}</p>
              )}
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <Input
                  placeholder="Observaciones"
                  value={notes[task.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [task.id]: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Minutos"
                  value={minutes[task.id] ?? ""}
                  onChange={(e) => setMinutes({ ...minutes, [task.id]: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={saving === task.id}
                  onClick={() => complete(task, "completed")}
                >
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Completar
                </Button>
                <Button
                  variant="outline"
                  disabled={saving === task.id || !notes[task.id]?.trim()}
                  onClick={() => complete(task, "skipped")}
                >
                  Omitir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftManagement({ isAdmin }: { isAdmin: boolean }) {
  const refresh = useOperationsRefresh();
  const [shift, setShift] = useState({ name: "", start: "07:00", end: "15:00" });
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [memberAssignment, setMemberAssignment] = useState({ shift: "", user: "" });
  const [taskAssignment, setTaskAssignment] = useState({
    task: "",
    targetType: "shift",
    target: "",
  });
  const { data } = useQuery({
    queryKey: ["operations", "shift-management"],
    queryFn: async () => {
      const [shifts, members, tasks] = await Promise.all([
        operationsDb
          .from("operational_shifts")
          .select("id,name,start_time,end_time,weekdays")
          .eq("active", true)
          .order("start_time"),
        operationsDb
          .from("user_roles")
          .select("user_id,role,status,profiles(email,full_name)")
          .eq("status", "active"),
        operationsDb
          .from("operational_tasks")
          .select("id,title,due_at,assigned_user_id,shift_id")
          .in("status", ["pending", "in_progress"])
          .order("due_at")
          .limit(200),
      ]);
      for (const result of [shifts, members, tasks]) if (result.error) throw result.error;
      return { shifts: shifts.data ?? [], members: members.data ?? [], tasks: tasks.data ?? [] };
    },
  });
  const createShift = async () => {
    if (!shift.name.trim()) return toast.error("El turno requiere nombre.");
    const { error } = await operationsDb.rpc("create_operational_shift_tx", {
      _name: shift.name,
      _start_time: shift.start,
      _end_time: shift.end,
      _weekdays: [1, 2, 3, 4, 5, 6],
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success("Turno creado.");
    setShift({ ...shift, name: "" });
    await refresh();
  };
  const saveTimezone = async () => {
    const { error } = await operationsDb.rpc("set_organization_timezone_tx", {
      _timezone: timezone,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success("Zona horaria actualizada.");
  };
  const assignMember = async () => {
    if (!memberAssignment.shift || !memberAssignment.user)
      return toast.error("Selecciona turno y usuario.");
    const { error } = await operationsDb.rpc("assign_shift_member_tx", {
      _shift_id: memberAssignment.shift,
      _user_id: memberAssignment.user,
      _assigned: true,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success("Usuario agregado al turno.");
    await refresh();
  };
  const assignTask = async () => {
    if (!taskAssignment.task || !taskAssignment.target)
      return toast.error("Selecciona tarea y destino.");
    const { error } = await operationsDb.rpc("assign_operational_task_tx", {
      _task_id: taskAssignment.task,
      _user_id: taskAssignment.targetType === "user" ? taskAssignment.target : null,
      _shift_id: taskAssignment.targetType === "shift" ? taskAssignment.target : null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success("Tarea asignada.");
    await refresh();
  };
  const shifts = data?.shifts ?? [];
  const members = data?.members ?? [];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <Clock3 className="h-4 w-4" /> Nuevo turno
          </h3>
          <Input
            placeholder="Nombre"
            value={shift.name}
            onChange={(e) => setShift({ ...shift, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="time"
              value={shift.start}
              onChange={(e) => setShift({ ...shift, start: e.target.value })}
            />
            <Input
              type="time"
              value={shift.end}
              onChange={(e) => setShift({ ...shift, end: e.target.value })}
            />
          </div>
          <Button disabled={!isAdmin} onClick={createShift}>
            Crear turno
          </Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <Users2 className="h-4 w-4" /> Personal del turno
          </h3>
          <Select
            value={memberAssignment.shift}
            onValueChange={(value) => setMemberAssignment({ ...memberAssignment, shift: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Turno" />
            </SelectTrigger>
            <SelectContent>
              {shifts.map((item: any) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={memberAssignment.user}
            onValueChange={(value) => setMemberAssignment({ ...memberAssignment, user: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Usuario" />
            </SelectTrigger>
            <SelectContent>
              {members.map((item: any) => {
                const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
                return (
                  <SelectItem key={item.user_id} value={item.user_id}>
                    {profile?.full_name ?? profile?.email ?? item.user_id.slice(0, 8)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button disabled={!isAdmin} variant="outline" onClick={assignMember}>
            Agregar al turno
          </Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Configuración horaria</h3>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "America/Mexico_City",
                "America/Cancun",
                "America/Monterrey",
                "America/Tijuana",
                "UTC",
              ].map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!isAdmin} variant="outline" onClick={saveTimezone}>
            Guardar zona horaria
          </Button>
        </Card>
      </div>
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">Asignar tarea pendiente</h3>
        <div className="grid gap-2 md:grid-cols-4">
          <Select
            value={taskAssignment.task}
            onValueChange={(task) => setTaskAssignment({ ...taskAssignment, task })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tarea" />
            </SelectTrigger>
            <SelectContent>
              {(data?.tasks ?? []).map((task: any) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={taskAssignment.targetType}
            onValueChange={(targetType) =>
              setTaskAssignment({ ...taskAssignment, targetType, target: "" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shift">Turno</SelectItem>
              <SelectItem value="user">Usuario</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={taskAssignment.target}
            onValueChange={(target) => setTaskAssignment({ ...taskAssignment, target })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Destino" />
            </SelectTrigger>
            <SelectContent>
              {taskAssignment.targetType === "shift"
                ? shifts.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))
                : members.map((item: any) => (
                    <SelectItem key={item.user_id} value={item.user_id}>
                      {item.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
          <Button disabled={!isAdmin} onClick={assignTask}>
            Asignar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Locations({ isAdmin }: { isAdmin: boolean }) {
  const refresh = useOperationsRefresh();
  const { data: targets } = useLotsAndBoxes();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [form, setForm] = useState({
    type: "room",
    code: "",
    name: "",
    parent: "none",
    capacity: "",
  });
  const [move, setMove] = useState({ box: "", location: "", reason: "Reubicación operativa" });
  const { data: locations = [] } = useQuery({
    queryKey: ["operations", "locations"],
    queryFn: async () => {
      const { data, error } = await operationsDb
        .from("facility_locations")
        .select("*")
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = async () => {
    if (!form.code.trim() || !form.name.trim())
      return toast.error("Código y nombre son obligatorios.");
    const { error } = await operationsDb.from("facility_locations").insert({
      location_type: form.type,
      code: form.code.trim(),
      name: form.name.trim(),
      parent_id: form.parent === "none" ? null : form.parent,
      capacity_boxes: form.capacity ? Number(form.capacity) : null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    setForm({ type: "room", code: "", name: "", parent: "none", capacity: "" });
    toast.success("Ubicación creada.");
    await refresh();
  };
  const assign = async () => {
    if (!move.box || !move.location) return toast.error("Selecciona caja y ubicación.");
    const operation = `location:${move.box}`;
    const { error } = await operationsDb.rpc("assign_box_location_tx", {
      _request_id: getRequestId(operation),
      _box_id: move.box,
      _location_id: move.location,
      _reason: move.reason,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(operation);
    toast.success("Caja ubicada.");
    await refresh();
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Nueva ubicación</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["site", "room", "rack", "level", "position"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Padre">
            <Select value={form.parent} onValueChange={(parent) => setForm({ ...form, parent })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Raíz</SelectItem>
                {locations.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Button disabled={!isAdmin} onClick={create}>
          <Plus className="mr-2 h-4 w-4" />
          Crear ubicación
        </Button>
      </Card>
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Ubicar caja</h3>
        <QrScannerDialog onBox={(box) => setMove({ ...move, box })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Caja">
            <Select value={move.box} onValueChange={(box) => setMove({ ...move, box })}>
              <SelectTrigger>
                <SelectValue placeholder="Caja" />
              </SelectTrigger>
              <SelectContent>
                {(targets?.boxes ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Destino">
            <Select
              value={move.location}
              onValueChange={(location) => setMove({ ...move, location })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ubicación" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} />
        <Button disabled={!isAdmin} onClick={assign}>
          <MapPinned className="mr-2 h-4 w-4" />
          Confirmar ubicación
        </Button>
        <div className="border-t pt-3 text-sm text-muted-foreground">
          {locations.map((l: any) => (
            <div key={l.id} className="flex justify-between py-1">
              <span>
                {l.code} · {l.name}
              </span>
              <Badge variant="outline">{l.location_type}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Protocols({ isAdmin }: { isAdmin: boolean }) {
  const refresh = useOperationsRefresh();
  const { data: targets } = useLotsAndBoxes();
  const [form, setForm] = useState({
    name: "",
    kind: "rodent",
    feed: "",
    cleaning: "7",
    weighing: "7",
    sale: "",
    separation: "",
    feeding: true,
    inspection: true,
  });
  const [assignment, setAssignment] = useState({ protocol: "", lot: "" });
  const { data: protocols = [] } = useQuery({
    queryKey: ["operations", "protocols"],
    queryFn: async () => {
      const { data, error } = await operationsDb
        .from("operational_protocols")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = async () => {
    if (!form.name.trim()) return toast.error("El nombre es obligatorio.");
    const tasks = [] as object[];
    if (form.feeding)
      tasks.push({ type: "feeding", title: "Alimentación", frequency_days: 1, hour: 8 });
    if (form.inspection)
      tasks.push({ type: "inspection", title: "Inspección general", frequency_days: 1, hour: 9 });
    if (Number(form.cleaning) > 0)
      tasks.push({
        type: "cleaning",
        title: "Limpieza",
        frequency_days: Number(form.cleaning),
        hour: 10,
      });
    if (Number(form.weighing) > 0)
      tasks.push({
        type: "weighing",
        title: "Pesaje",
        frequency_days: Number(form.weighing),
        hour: 11,
      });
    const { error } = await operationsDb.from("operational_protocols").insert({
      name: form.name.trim(),
      kind: form.kind,
      daily_feed_grams_per_unit: form.feed ? Number(form.feed) : null,
      cleaning_frequency_days: Number(form.cleaning) || null,
      weighing_frequency_days: Number(form.weighing) || null,
      sale_age_days: form.sale ? Number(form.sale) : null,
      separation_age_days: form.separation ? Number(form.separation) : null,
      task_definitions: tasks,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success("Protocolo creado.");
    setForm({ ...form, name: "" });
    await refresh();
  };
  const assign = async () => {
    if (!assignment.protocol || !assignment.lot) return toast.error("Selecciona protocolo y lote.");
    const { error } = await operationsDb
      .from("protocol_assignments")
      .insert({ protocol_id: assignment.protocol, lot_id: assignment.lot, starts_on: dateOnly() });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success("Protocolo asignado.");
    await refresh();
  };
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Diseñar protocolo</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Dominio">
            <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rodent">Roedores</SelectItem>
                <SelectItem value="insect">Insectos</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Alimento diario por unidad (g)">
            <Input
              type="number"
              value={form.feed}
              onChange={(e) => setForm({ ...form, feed: e.target.value })}
            />
          </Field>
          <Field label="Limpieza cada (días)">
            <Input
              type="number"
              value={form.cleaning}
              onChange={(e) => setForm({ ...form, cleaning: e.target.value })}
            />
          </Field>
          <Field label="Pesaje cada (días)">
            <Input
              type="number"
              value={form.weighing}
              onChange={(e) => setForm({ ...form, weighing: e.target.value })}
            />
          </Field>
          <Field label="Edad de venta (días)">
            <Input
              type="number"
              value={form.sale}
              onChange={(e) => setForm({ ...form, sale: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex gap-5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.feeding}
              onCheckedChange={(v) => setForm({ ...form, feeding: v === true })}
            />
            Alimentación
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.inspection}
              onCheckedChange={(v) => setForm({ ...form, inspection: v === true })}
            />
            Inspección
          </label>
        </div>
        <Button disabled={!isAdmin} onClick={create}>
          <Settings2 className="mr-2 h-4 w-4" />
          Guardar protocolo
        </Button>
      </Card>
      <Card className="space-y-4 p-4">
        <h3 className="font-semibold">Asignar a lote</h3>
        <Field label="Protocolo">
          <Select
            value={assignment.protocol}
            onValueChange={(protocol) => setAssignment({ ...assignment, protocol })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Protocolo" />
            </SelectTrigger>
            <SelectContent>
              {protocols.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Lote">
          <Select
            value={assignment.lot}
            onValueChange={(lot) => setAssignment({ ...assignment, lot })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Lote" />
            </SelectTrigger>
            <SelectContent>
              {(targets?.lots ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.lot_code ?? l.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button disabled={!isAdmin} onClick={assign}>
          Asignar protocolo
        </Button>
        <div className="border-t pt-3">
          {protocols.map((p: any) => (
            <div key={p.id} className="py-2">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                {p.kind} · alimento {p.daily_feed_grams_per_unit ?? 0} g · limpieza{" "}
                {p.cleaning_frequency_days ?? "N/A"} días
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Health({ isAdmin }: { isAdmin: boolean }) {
  const refresh = useOperationsRefresh();
  const { data: targets } = useLotsAndBoxes();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [form, setForm] = useState({
    lot: "",
    severity: "medium",
    signs: "",
    quarantine: false,
    sale: false,
    reproduction: false,
    veterinarian: "",
    followUp: "",
  });
  const [treatment, setTreatment] = useState({
    caseId: "",
    medication: "",
    dose: "",
    unit: "",
    route: "",
    days: "",
    notes: "",
  });
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const { data: cases = [] } = useQuery({
    queryKey: ["operations", "health"],
    queryFn: async () => {
      const { data, error } = await operationsDb
        .from("health_cases")
        .select("*")
        .in("status", ["open", "monitoring", "resolved"])
        .order("opened_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const open = async () => {
    if (!form.lot || !form.signs.trim())
      return toast.error("Selecciona lote y describe los signos.");
    const op = "health:open";
    const { error } = await operationsDb.rpc("open_health_case_tx", {
      _request_id: getRequestId(op),
      _lot_id: form.lot,
      _severity: form.severity,
      _clinical_signs: form.signs,
      _quarantine: form.quarantine,
      _sale_restricted: form.sale,
      _reproduction_restricted: form.reproduction,
      _veterinarian: form.veterinarian || null,
      _follow_up_at: form.followUp ? new Date(form.followUp).toISOString() : null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Caso sanitario abierto.");
    setForm({ ...form, signs: "" });
    await refresh();
  };
  const addTreatment = async () => {
    if (!treatment.caseId || !treatment.medication.trim())
      return toast.error("Caso y medicamento son obligatorios.");
    const op = `treatment:${treatment.caseId}`;
    const { error } = await operationsDb.rpc("add_health_treatment_tx", {
      _request_id: getRequestId(op),
      _health_case_id: treatment.caseId,
      _medication: treatment.medication,
      _dose: treatment.dose ? Number(treatment.dose) : null,
      _dose_unit: treatment.unit || null,
      _route: treatment.route || null,
      _duration_days: treatment.days ? Number(treatment.days) : null,
      _notes: treatment.notes || null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Tratamiento registrado.");
    setTreatment({ ...treatment, medication: "", dose: "", notes: "" });
    await refresh();
  };
  const closeCase = async (caseId: string) => {
    const reason = resolution[caseId]?.trim();
    if (!reason) return toast.error("Escribe la resolución antes de cerrar el caso.");
    const op = `health:close:${caseId}`;
    const { error } = await operationsDb.rpc("close_health_case_tx", {
      _request_id: getRequestId(op),
      _health_case_id: caseId,
      _resolution: reason,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Caso sanitario cerrado y restricciones liberadas.");
    await refresh();
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Abrir caso clínico</h3>
          <Field label="Lote">
            <Select value={form.lot} onValueChange={(lot) => setForm({ ...form, lot })}>
              <SelectTrigger>
                <SelectValue placeholder="Lote" />
              </SelectTrigger>
              <SelectContent>
                {(targets?.lots ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.lot_code ?? l.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severidad">
              <Select
                value={form.severity}
                onValueChange={(severity) => setForm({ ...form, severity })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "critical"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Seguimiento">
              <Input
                type="datetime-local"
                value={form.followUp}
                onChange={(e) => setForm({ ...form, followUp: e.target.value })}
              />
            </Field>
          </div>
          <Textarea
            placeholder="Signos clínicos"
            value={form.signs}
            onChange={(e) => setForm({ ...form, signs: e.target.value })}
          />
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["quarantine", "Cuarentena"],
                ["sale", "Bloquear venta"],
                ["reproduction", "Bloquear reproducción"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form[key]}
                  onCheckedChange={(v) => setForm({ ...form, [key]: v === true })}
                />
                {label}
              </label>
            ))}
          </div>
          <Button onClick={open}>
            <HeartPulse className="mr-2 h-4 w-4" />
            Abrir caso
          </Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Registrar tratamiento</h3>
          <Field label="Caso">
            <Select
              value={treatment.caseId}
              onValueChange={(caseId) => setTreatment({ ...treatment, caseId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Caso" />
              </SelectTrigger>
              <SelectContent>
                {cases.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.case_code} · {c.severity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Input
            placeholder="Medicamento"
            value={treatment.medication}
            onChange={(e) => setTreatment({ ...treatment, medication: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="number"
              placeholder="Dosis"
              value={treatment.dose}
              onChange={(e) => setTreatment({ ...treatment, dose: e.target.value })}
            />
            <Input
              placeholder="Unidad"
              value={treatment.unit}
              onChange={(e) => setTreatment({ ...treatment, unit: e.target.value })}
            />
            <Input
              placeholder="Vía"
              value={treatment.route}
              onChange={(e) => setTreatment({ ...treatment, route: e.target.value })}
            />
          </div>
          <Textarea
            placeholder="Respuesta y observaciones"
            value={treatment.notes}
            onChange={(e) => setTreatment({ ...treatment, notes: e.target.value })}
          />
          <Button variant="outline" onClick={addTreatment}>
            Registrar tratamiento
          </Button>
        </Card>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {cases.map((c: any) => (
          <Card key={c.id} className="p-4">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-semibold">{c.case_code}</h3>
                <p className="text-sm text-muted-foreground">{c.clinical_signs}</p>
              </div>
              <Badge variant={c.severity === "critical" ? "destructive" : "outline"}>
                {c.severity}
              </Badge>
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              {c.quarantine && <Badge>Cuarentena</Badge>}
              {c.sale_restricted && <Badge>Venta restringida</Badge>}
              {c.reproduction_restricted && <Badge>Reproducción restringida</Badge>}
            </div>
            {isAdmin && c.status !== "closed" && (
              <div className="mt-3 flex gap-2">
                <Input
                  aria-label={`Resolución de ${c.case_code}`}
                  placeholder="Resolución clínica"
                  value={resolution[c.id] ?? ""}
                  onChange={(e) => setResolution({ ...resolution, [c.id]: e.target.value })}
                />
                <Button variant="outline" onClick={() => closeCase(c.id)}>
                  Cerrar
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Breeding({ isAdmin }: { isAdmin: boolean }) {
  const refresh = useOperationsRefresh();
  const { data: targets } = useLotsAndBoxes();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [form, setForm] = useState({
    code: "",
    primary: "",
    secondary: "none",
    method: "pair",
    start: dateOnly(),
    birth: "",
    weaning: "",
    target: "",
  });
  const [event, setEvent] = useState({
    program: "",
    type: "mating",
    quantity: "",
    mass: "",
    notes: "",
    at: dateTimeLocal(),
  });
  const { data: programs = [] } = useQuery({
    queryKey: ["operations", "breeding"],
    queryFn: async () => {
      const { data, error } = await operationsDb
        .from("reproduction_performance")
        .select("*")
        .order("planned_start", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = async () => {
    if (!form.code.trim() || !form.primary)
      return toast.error("Código y lote principal son obligatorios.");
    const op = `breeding:create:${form.code.trim()}`;
    const { error } = await operationsDb.rpc("create_breeding_program_tx", {
      _request_id: getRequestId(op),
      _code: form.code.trim(),
      _primary_lot_id: form.primary,
      _secondary_lot_id: form.secondary === "none" ? null : form.secondary,
      _method: form.method,
      _planned_start: form.start,
      _expected_birth_date: form.birth || null,
      _expected_weaning_date: form.weaning || null,
      _target_offspring: form.target ? Number(form.target) : null,
      _notes: null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Programa reproductivo creado.");
    setForm({ ...form, code: "" });
    await refresh();
  };
  const record = async () => {
    if (!event.program) return toast.error("Selecciona un programa.");
    const op = `breeding:${event.program}:${event.type}`;
    const { error } = await operationsDb.rpc("record_breeding_program_event_tx", {
      _request_id: getRequestId(op),
      _breeding_program_id: event.program,
      _event_type: event.type,
      _event_at: new Date(event.at).toISOString(),
      _quantity: event.quantity ? Number(event.quantity) : null,
      _mass_grams: event.mass ? Number(event.mass) : null,
      _observations: event.notes || null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Evento y avance reproductivo actualizados.");
    setEvent({ ...event, quantity: "", mass: "", notes: "" });
    await refresh();
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="space-y-4 p-4">
          <h3 className="font-semibold">Nuevo programa reproductivo</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Código">
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="Método">
              <Select value={form.method} onValueChange={(method) => setForm({ ...form, method })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["pair", "trio", "group", "colony"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Lote principal">
              <LotSelect
                value={form.primary}
                onChange={(primary) => setForm({ ...form, primary })}
                lots={targets?.lots ?? []}
              />
            </Field>
            <Field label="Segundo lote">
              <Select
                value={form.secondary}
                onValueChange={(secondary) => setForm({ ...form, secondary })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No aplica</SelectItem>
                  {(targets?.lots ?? [])
                    .filter((l) => l.id !== form.primary)
                    .map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.lot_code ?? l.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Inicio">
              <Input
                type="date"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </Field>
            <Field label="Nacimiento esperado">
              <Input
                type="date"
                value={form.birth}
                onChange={(e) => setForm({ ...form, birth: e.target.value })}
              />
            </Field>
            <Field label="Destete esperado">
              <Input
                type="date"
                value={form.weaning}
                onChange={(e) => setForm({ ...form, weaning: e.target.value })}
              />
            </Field>
            <Field label="Meta de crías">
              <Input
                type="number"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              />
            </Field>
          </div>
          <Button disabled={!isAdmin} onClick={create}>
            <Plus className="mr-2 h-4 w-4" />
            Crear programa
          </Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Actualizar ciclo</h3>
          <Select
            value={event.program}
            onValueChange={(program) => setEvent({ ...event, program })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Programa" />
            </SelectTrigger>
            <SelectContent>
              {programs
                .filter((p: any) => !["failed", "closed"].includes(p.status))
                .map((p: any) => (
                  <SelectItem key={p.breeding_program_id} value={p.breeding_program_id}>
                    {p.code}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select value={event.type} onValueChange={(type) => setEvent({ ...event, type })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["mating", "gestation_confirmed", "birth", "hatch", "separation", "failed"].map(
                  (v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Input
              type="datetime-local"
              value={event.at}
              onChange={(e) => setEvent({ ...event, at: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Cantidad"
              value={event.quantity}
              onChange={(e) => setEvent({ ...event, quantity: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Biomasa (g)"
              value={event.mass}
              onChange={(e) => setEvent({ ...event, mass: e.target.value })}
            />
          </div>
          <Textarea
            placeholder="Observaciones"
            value={event.notes}
            onChange={(e) => setEvent({ ...event, notes: e.target.value })}
          />
          <Button variant="outline" onClick={record}>
            Registrar evento
          </Button>
        </Card>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Programa</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Crías/meta</TableHead>
            <TableHead>Avance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {programs.map((p: any) => (
            <TableRow key={p.breeding_program_id}>
              <TableCell className="font-medium">{p.code}</TableCell>
              <TableCell>
                <Badge variant="outline">{p.status}</Badge>
              </TableCell>
              <TableCell>{p.method}</TableCell>
              <TableCell>
                {p.offspring_count}/{p.target_offspring ?? "-"}
              </TableCell>
              <TableCell>{p.target_achievement_pct ?? 0}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Planning() {
  const { data: rows = [] } = useQuery({
    queryKey: ["operations", "planning"],
    queryFn: async () => {
      const { data, error } = await operationsDb
        .from("operational_planning_summary")
        .select("*")
        .order("projected_sale_date")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const dailyFeed = rows.reduce(
    (sum: number, row: any) => sum + Number(row.projected_daily_feed_grams ?? 0),
    0,
  );
  const upcoming = rows.filter(
    (r: any) =>
      r.projected_sale_date &&
      new Date(r.projected_sale_date) <= new Date(Date.now() + 30 * 86400000),
  ).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Alimento proyectado/día" value={`${dailyFeed.toFixed(1)} g`} />
        <Metric label="Ventas próximas 30 días" value={String(upcoming)} />
        <Metric
          label="Lotes con protocolo"
          value={String(rows.filter((r: any) => r.protocol_id).length)}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lote</TableHead>
            <TableHead>Edad</TableHead>
            <TableHead>Protocolo</TableHead>
            <TableHead>Consumo diario</TableHead>
            <TableHead>Venta estimada</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r: any) => (
            <TableRow key={r.lot_id}>
              <TableCell className="font-medium">{r.lot_code ?? r.lot_id.slice(0, 8)}</TableCell>
              <TableCell>{r.age_days} días</TableCell>
              <TableCell>{r.protocol_name ?? "Sin protocolo"}</TableCell>
              <TableCell>{Number(r.projected_daily_feed_grams ?? 0).toFixed(1)} g</TableCell>
              <TableCell>
                {r.projected_sale_date
                  ? new Date(r.projected_sale_date + "T00:00:00").toLocaleDateString("es-MX")
                  : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Supplies({ isAdmin }: { isAdmin: boolean }) {
  const refresh = useOperationsRefresh();
  const { data: targets } = useLotsAndBoxes();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [item, setItem] = useState({
    sku: "",
    name: "",
    category: "feed",
    unit: "kg",
    minimum: "",
    vendor: "",
    lead: "0",
  });
  const [order, setOrder] = useState({ number: "", vendor: "", item: "", quantity: "", cost: "" });
  const [receipt, setReceipt] = useState({
    line: "",
    batch: "",
    quantity: "",
    expiry: "",
    reference: "",
  });
  const [consumption, setConsumption] = useState({
    item: "",
    quantity: "",
    reference: "lot",
    referenceId: "",
    notes: "",
    eventType: "consumption",
  });
  const [adjustment, setAdjustment] = useState({ item: "", quantity: "", reason: "", batch: "" });
  const [laborCost, setLaborCost] = useState("");
  const { data } = useQuery({
    queryKey: ["operations", "supplies"],
    queryFn: async () => {
      const [items, orders, lines, forecast, unified, sourceLinks] = await Promise.all([
        operationsDb
          .from("supply_items")
          .select("id,sku,name,category,unit,current_quantity,minimum_quantity,average_unit_cost")
          .eq("active", true)
          .order("name"),
        operationsDb
          .from("purchase_orders")
          .select("id,order_number,vendor,status,created_at")
          .neq("status", "cancelled")
          .order("created_at", { ascending: false }),
        operationsDb
          .from("purchase_order_lines")
          .select(
            "id,purchase_order_id,supply_item_id,quantity_ordered,quantity_received,unit_cost",
          )
          .order("created_at", { ascending: false }),
        operationsDb
          .from("supply_forecast")
          .select("supply_item_id,average_daily_use,coverage_days,suggested_order_quantity,status"),
        operationsDb
          .from("unified_inventory")
          .select(
            "source,source_id,code,name,category,unit,quantity,minimum_quantity,unit_cost,active",
          )
          .eq("active", true)
          .order("name")
          .limit(500),
        operationsDb.from("inventory_source_links").select("supply_item_id").limit(1000),
      ]);
      for (const r of [items, orders, lines, forecast, unified, sourceLinks])
        if (r.error) throw r.error;
      const linkedIds = new Set((sourceLinks.data ?? []).map((row) => row.supply_item_id));
      return {
        items: (items.data ?? []).filter((row) => !linkedIds.has(row.id)),
        orders: orders.data ?? [],
        lines: lines.data ?? [],
        forecast: forecast.data ?? [],
        unified: unified.data ?? [],
      };
    },
  });
  const createItem = async () => {
    if (!item.sku.trim() || !item.name.trim()) return toast.error("SKU y nombre son obligatorios.");
    const { error } = await operationsDb.from("supply_items").insert({
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      minimum_quantity: Number(item.minimum) || 0,
      preferred_vendor: item.vendor || null,
      lead_time_days: Number(item.lead) || 0,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success("Insumo creado.");
    setItem({ ...item, sku: "", name: "" });
    await refresh();
  };
  const createOrder = async () => {
    if (!order.number || !order.vendor || !order.item || Number(order.quantity) <= 0)
      return toast.error("Completa orden, proveedor, insumo y cantidad.");
    const op = `supply:order:${order.number}`;
    const { error } = await operationsDb.rpc("create_supply_purchase_order_tx", {
      _request_id: getRequestId(op),
      _order_number: order.number,
      _vendor: order.vendor,
      _supply_item_id: order.item,
      _quantity: Number(order.quantity),
      _unit_cost: Number(order.cost) || 0,
      _expected_at: null,
      _notes: null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Orden de compra creada.");
    setOrder({ ...order, number: "", quantity: "", cost: "" });
    await refresh();
  };
  const consume = async () => {
    if (!consumption.item || Number(consumption.quantity) <= 0 || !consumption.notes.trim())
      return toast.error("Selecciona insumo, cantidad y motivo del consumo.");
    if (consumption.reference !== "general" && !consumption.referenceId)
      return toast.error("Selecciona la referencia operativa del consumo.");
    const op = `supply:consume:${consumption.item}`;
    const { error } = await operationsDb.rpc("consume_supply_tx", {
      _request_id: getRequestId(op),
      _supply_item_id: consumption.item,
      _quantity: Number(consumption.quantity),
      _reference_type: consumption.reference,
      _reference_id: consumption.referenceId || null,
      _notes: consumption.notes,
      _event_type: consumption.eventType,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success(
      consumption.eventType === "waste" ? "Merma registrada." : "Consumo aplicado por FIFO.",
    );
    setConsumption({ ...consumption, quantity: "", referenceId: "", notes: "" });
    await refresh();
  };
  const adjust = async () => {
    const quantity = Number(adjustment.quantity);
    if (!adjustment.item || !quantity || !adjustment.reason.trim())
      return toast.error("Selecciona insumo, diferencia y motivo.");
    const op = `supply:adjust:${adjustment.item}`;
    const { error } = await operationsDb.rpc("request_supply_adjustment_tx", {
      _request_id: getRequestId(op),
      _supply_item_id: adjustment.item,
      _quantity_delta: quantity,
      _reason: adjustment.reason,
      _batch_code: adjustment.batch || null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Ajuste enviado para aprobación por un segundo administrador.");
    setAdjustment({ ...adjustment, quantity: "", reason: "", batch: "" });
    await refresh();
  };
  const cancelOrder = async (orderId: string) => {
    const reason = window.prompt("Motivo de cancelación de la orden:")?.trim();
    if (!reason) return;
    const op = `supply:cancel:${orderId}`;
    const { error } = await operationsDb.rpc("cancel_supply_purchase_order_tx", {
      _request_id: getRequestId(op),
      _purchase_order_id: orderId,
      _reason: reason,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Orden cancelada.");
    await refresh();
  };
  const saveLaborCost = async () => {
    if (laborCost === "" || Number(laborCost) < 0)
      return toast.error("Captura una tarifa válida por hora.");
    const { error } = await operationsDb.rpc("set_default_labor_cost_tx", {
      _hourly_cost: Number(laborCost),
    });
    if (error) return toast.error(toUserFriendlyError(error));
    toast.success("Costo de mano de obra actualizado.");
  };
  const receive = async () => {
    if (!receipt.line || !receipt.batch || Number(receipt.quantity) <= 0)
      return toast.error("Selecciona línea, lote y cantidad.");
    const op = `receive:${receipt.line}:${receipt.batch}`;
    const { error } = await operationsDb.rpc("receive_supply_tx", {
      _request_id: getRequestId(op),
      _purchase_order_line_id: receipt.line,
      _batch_code: receipt.batch,
      _quantity: Number(receipt.quantity),
      _expiry_date: receipt.expiry || null,
      _document_reference: receipt.reference || null,
    });
    if (error) return toast.error(toUserFriendlyError(error));
    resetRequestId(op);
    toast.success("Recepción aplicada al inventario.");
    setReceipt({ ...receipt, batch: "", quantity: "" });
    await refresh();
  };
  const items = data?.items ?? [],
    unified = data?.unified ?? [],
    forecasts = data?.forecast ?? [],
    lines = (data?.lines ?? []).filter(
      (l: any) => Number(l.quantity_received) < Number(l.quantity_ordered),
    );
  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Catálogo de insumos</h3>
          <Input
            placeholder="SKU"
            value={item.sku}
            onChange={(e) => setItem({ ...item, sku: e.target.value })}
          />
          <Input
            placeholder="Nombre"
            value={item.name}
            onChange={(e) => setItem({ ...item, name: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <Select
              value={item.category}
              onValueChange={(category) => setItem({ ...item, category })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "feed",
                  "substrate",
                  "medication",
                  "cleaning",
                  "packaging",
                  "equipment",
                  "other",
                ].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Unidad"
              value={item.unit}
              onChange={(e) => setItem({ ...item, unit: e.target.value })}
            />
          </div>
          <Input
            type="number"
            placeholder="Stock mínimo"
            value={item.minimum}
            onChange={(e) => setItem({ ...item, minimum: e.target.value })}
          />
          <Button disabled={!isAdmin} onClick={createItem}>
            Crear insumo
          </Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Orden de compra</h3>
          <Input
            placeholder="Número de orden"
            value={order.number}
            onChange={(e) => setOrder({ ...order, number: e.target.value })}
          />
          <Input
            placeholder="Proveedor"
            value={order.vendor}
            onChange={(e) => setOrder({ ...order, vendor: e.target.value })}
          />
          <Select value={order.item} onValueChange={(v) => setOrder({ ...order, item: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Insumo" />
            </SelectTrigger>
            <SelectContent>
              {items.map((i: any) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.sku} · {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Cantidad"
              value={order.quantity}
              onChange={(e) => setOrder({ ...order, quantity: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Costo unitario"
              value={order.cost}
              onChange={(e) => setOrder({ ...order, cost: e.target.value })}
            />
          </div>
          <Button disabled={!isAdmin} onClick={createOrder}>
            <PackageCheck className="mr-2 h-4 w-4" />
            Crear orden
          </Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Recibir lote</h3>
          <Select value={receipt.line} onValueChange={(line) => setReceipt({ ...receipt, line })}>
            <SelectTrigger>
              <SelectValue placeholder="Línea pendiente" />
            </SelectTrigger>
            <SelectContent>
              {lines.map((l: any) => {
                const i = items.find((x: any) => x.id === l.supply_item_id);
                return (
                  <SelectItem key={l.id} value={l.id}>
                    {i?.name ?? l.id.slice(0, 8)} ·{" "}
                    {Number(l.quantity_ordered) - Number(l.quantity_received)} pendientes
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Input
            placeholder="Código de lote"
            value={receipt.batch}
            onChange={(e) => setReceipt({ ...receipt, batch: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Cantidad"
              value={receipt.quantity}
              onChange={(e) => setReceipt({ ...receipt, quantity: e.target.value })}
            />
            <Input
              type="date"
              value={receipt.expiry}
              onChange={(e) => setReceipt({ ...receipt, expiry: e.target.value })}
            />
          </div>
          <Button disabled={!isAdmin} onClick={receive}>
            Aplicar recepción
          </Button>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">Consumo de insumo</h3>
          <Select
            value={consumption.item}
            onValueChange={(item) => setConsumption({ ...consumption, item })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Insumo" />
            </SelectTrigger>
            <SelectContent>
              {items.map((i: any) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name} · {i.current_quantity} {i.unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="Cantidad"
              value={consumption.quantity}
              onChange={(e) => setConsumption({ ...consumption, quantity: e.target.value })}
            />
            <Select
              value={consumption.reference}
              onValueChange={(reference) => setConsumption({ ...consumption, reference })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lot">Lote</SelectItem>
                <SelectItem value="box">Caja</SelectItem>
                <SelectItem value="general">Uso general</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={consumption.eventType}
              onValueChange={(eventType) => setConsumption({ ...consumption, eventType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consumption">Consumo</SelectItem>
                <SelectItem value="waste">Merma</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {consumption.reference === "lot" && (
            <LotSelect
              value={consumption.referenceId}
              onChange={(referenceId) => setConsumption({ ...consumption, referenceId })}
              lots={targets?.lots ?? []}
            />
          )}
          {consumption.reference === "box" && (
            <Select
              value={consumption.referenceId}
              onValueChange={(referenceId) => setConsumption({ ...consumption, referenceId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Caja" />
              </SelectTrigger>
              <SelectContent>
                {(targets?.boxes ?? []).map((box) => (
                  <SelectItem key={box.id} value={box.id}>
                    {box.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Textarea
            placeholder="Motivo y destino del consumo"
            value={consumption.notes}
            onChange={(e) => setConsumption({ ...consumption, notes: e.target.value })}
          />
          <Button onClick={consume}>
            {consumption.eventType === "waste" ? "Registrar merma" : "Aplicar consumo FIFO"}
          </Button>
        </Card>
        <AdminOnly>
          <Card className="space-y-3 p-4">
            <h3 className="font-semibold">Costo de mano de obra</h3>
            <p className="text-sm text-muted-foreground">
              Se aplica automáticamente al completar tareas con minutos registrados.
            </p>
            <Field label="Tarifa por hora">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={laborCost}
                onChange={(e) => setLaborCost(e.target.value)}
              />
            </Field>
            <Button variant="outline" onClick={saveLaborCost}>
              Guardar tarifa
            </Button>
          </Card>
        </AdminOnly>
      </div>
      <AdminOnly>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-4">
            <h3 className="font-semibold">Conciliación de inventario</h3>
            <Select
              value={adjustment.item}
              onValueChange={(item) => setAdjustment({ ...adjustment, item })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Insumo" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item: any) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.sku} · {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="any"
                placeholder="Diferencia (+/-)"
                value={adjustment.quantity}
                onChange={(e) => setAdjustment({ ...adjustment, quantity: e.target.value })}
              />
              <Input
                placeholder="Lote para entrada"
                value={adjustment.batch}
                onChange={(e) => setAdjustment({ ...adjustment, batch: e.target.value })}
              />
            </div>
            <Textarea
              placeholder="Motivo de conciliación"
              value={adjustment.reason}
              onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}
            />
            <Button variant="outline" onClick={adjust}>
              Solicitar ajuste
            </Button>
          </Card>
          <Card className="space-y-3 p-4">
            <h3 className="font-semibold">Órdenes abiertas</h3>
            {(data?.orders ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay órdenes abiertas.</p>
            ) : (
              <div className="space-y-2">
                {(data?.orders ?? []).slice(0, 8).map((order: any) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-3 border-b py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{order.order_number}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {order.vendor} · {order.status}
                      </div>
                    </div>
                    {order.status === "ordered" && (
                      <Button size="sm" variant="outline" onClick={() => cancelOrder(order.id)}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </AdminOnly>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Insumo</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Existencia</TableHead>
            <TableHead>Mínimo</TableHead>
            <TableHead>Costo promedio</TableHead>
            <TableHead>Cobertura</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {unified.map((i: any) => {
            const forecast = forecasts.find((f: any) => f.supply_item_id === i.source_id);
            return (
              <TableRow key={`${i.source}:${i.source_id}`}>
                <TableCell>{i.code}</TableCell>
                <TableCell className="font-medium">{i.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{i.source}</Badge>
                </TableCell>
                <TableCell>
                  {i.quantity} {i.unit}
                </TableCell>
                <TableCell>{i.minimum_quantity}</TableCell>
                <TableCell>${Number(i.unit_cost).toFixed(4)}</TableCell>
                <TableCell>
                  {forecast?.coverage_days == null ? "-" : `${forecast.coverage_days} días`}
                  {forecast?.status === "reorder" && (
                    <Badge className="ml-2" variant="destructive">
                      Reponer
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
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
function LotSelect({
  value,
  onChange,
  lots,
}: {
  value: string;
  onChange: (v: string) => void;
  lots: SimpleLot[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Lote" />
      </SelectTrigger>
      <SelectContent>
        {lots.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            {l.lot_code ?? l.id.slice(0, 8)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </Card>
  );
}
