import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Bug, MapPin, Rat, ScanLine, Skull, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { operationsDb } from "@/lib/operations-client";
import { useTransactionRequest } from "@/hooks/use-transaction-request";
import { toUserFriendlyError } from "@/lib/errors";
import { PageShell } from "@/components/page-shell";
import { QrScannerDialog } from "@/components/qr-scanner-dialog";
import { SubstrateUseDialog } from "@/components/substrate-use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/operate")({
  validateSearch: (search: Record<string, unknown>) => ({
    box: typeof search.box === "string" ? search.box : undefined,
    lot: typeof search.lot === "string" ? search.lot : undefined,
    location: typeof search.location === "string" ? search.location : undefined,
  }),
  head: () => ({ meta: [{ title: "Operar cajas - BioTrack" }] }),
  component: OperatePage,
});

type BoxRow = {
  id: string;
  code: string;
  kind: "rodent" | "insect";
  location: string | null;
  capacity: number | null;
  box_type_id: string | null;
  location_id: string | null;
};

type LotRow = {
  id: string;
  lot_code: string | null;
  kind: "rodent" | "insect";
  males: number | null;
  females: number | null;
  unsexed: number | null;
  mass_grams: number | null;
};

function OperatePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/operate" });
  const qc = useQueryClient();
  const { getRequestId, resetRequestId } = useTransactionRequest();
  const [selectedBoxId, setSelectedBoxId] = useState(search.box ?? "");
  const [selectedLotId, setSelectedLotId] = useState(search.lot ?? "");
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine);
  const [mortality, setMortality] = useState({ quantity: "1", cause: "desconocida", notes: "" });
  const [movement, setMovement] = useState({
    destination: "",
    cause: "reubicacion_operativa",
    notes: "",
  });

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const { data: boxes = [], isLoading: loadingBoxes } = useQuery({
    queryKey: ["operate", "boxes"],
    queryFn: async () => {
      const { data, error } = await operationsDb
        .from("boxes")
        .select("id,code,kind,location,capacity,box_type_id,location_id")
        .eq("status", "active")
        .order("code")
        .limit(500);
      if (error) throw error;
      return data as unknown as BoxRow[];
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["operate", "locations"],
    queryFn: async () => {
      const { data, error } = await operationsDb
        .from("facility_locations")
        .select("id,parent_id")
        .eq("active", true)
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; parent_id: string | null }>;
    },
    enabled: Boolean(search.location),
  });

  const { data: targetLot } = useQuery({
    queryKey: ["operate", "target-lot", search.lot],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id,box_id")
        .eq("id", search.lot!)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(search.lot),
  });

  const locationIds = useMemo(() => {
    if (!search.location) return null;
    const ids = new Set<string>([search.location]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const location of locations) {
        if (location.parent_id && ids.has(location.parent_id) && !ids.has(location.id)) {
          ids.add(location.id);
          changed = true;
        }
      }
    }
    return ids;
  }, [locations, search.location]);
  const visibleBoxes = useMemo(
    () =>
      locationIds
        ? boxes.filter((box) => box.location_id && locationIds.has(box.location_id))
        : boxes,
    [boxes, locationIds],
  );

  const selectedBox = boxes.find((box) => box.id === selectedBoxId);
  const { data: lots = [], isLoading: loadingLots } = useQuery({
    queryKey: ["operate", "lots", selectedBoxId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id,lot_code,kind,males,females,unsexed,mass_grams")
        .eq("box_id", selectedBoxId)
        .eq("status", "active")
        .order("started_at")
        .limit(100);
      if (error) throw error;
      return data as LotRow[];
    },
    enabled: Boolean(selectedBoxId),
  });
  const selectedLot = lots.find((lot) => lot.id === selectedLotId);
  const destinationBoxes = useMemo(
    () => boxes.filter((box) => box.kind === selectedBox?.kind && box.id !== selectedBoxId),
    [boxes, selectedBox, selectedBoxId],
  );

  useEffect(() => {
    if (!selectedBoxId || loadingBoxes) return;
    if (!boxes.some((box) => box.id === selectedBoxId)) {
      toast.error("La caja no existe o no pertenece a tu bioterio.");
      setSelectedBoxId("");
      navigate({
        search: { box: undefined, lot: undefined, location: search.location },
        replace: true,
      });
    }
  }, [boxes, loadingBoxes, navigate, search.location, selectedBoxId]);

  useEffect(() => {
    if (search.lot && lots.some((lot) => lot.id === search.lot)) setSelectedLotId(search.lot);
    else setSelectedLotId(lots.length === 1 ? lots[0].id : "");
  }, [lots, search.lot]);

  useEffect(() => {
    if (!search.lot || !targetLot) return;
    if (!targetLot.box_id) {
      toast.error("El lote no está asignado a una caja operable.");
      return;
    }
    setSelectedBoxId(targetLot.box_id);
    setSelectedLotId(targetLot.id);
  }, [search.lot, targetLot]);

  const chooseBox = (boxId: string) => {
    setSelectedBoxId(boxId);
    setSelectedLotId("");
    navigate({ search: { box: boxId, lot: undefined, location: undefined }, replace: true });
  };

  const refreshOperationalData = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["operate"] }),
      qc.invalidateQueries({ queryKey: ["lots"] }),
      qc.invalidateQueries({ queryKey: ["lots-by-box"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const registerMortality = async () => {
    if (!online) return toast.error("Reconéctate antes de registrar una baja.");
    if (!selectedLot) return toast.error("Selecciona un lote.");
    const quantity = Number(mortality.quantity);
    if (quantity <= 0) return toast.error("La cantidad debe ser mayor a cero.");
    if (selectedLot.kind === "rodent") {
      const total =
        Number(selectedLot.males ?? 0) +
        Number(selectedLot.females ?? 0) +
        Number(selectedLot.unsexed ?? 0);
      if (quantity > total) return toast.error(`El lote solo tiene ${total} animales.`);
    } else if (quantity > Number(selectedLot.mass_grams ?? 0)) {
      return toast.error(`El lote solo tiene ${selectedLot.mass_grams ?? 0} g.`);
    }

    const operation = `mobile:mortality:${selectedLot.id}`;
    setSaving(true);
    try {
      let males = 0;
      let females = 0;
      let unsexed = 0;
      if (selectedLot.kind === "rodent") {
        let remaining = quantity;
        unsexed = Math.min(remaining, Number(selectedLot.unsexed ?? 0));
        remaining -= unsexed;
        females = Math.min(remaining, Number(selectedLot.females ?? 0));
        remaining -= females;
        males = Math.min(remaining, Number(selectedLot.males ?? 0));
      }
      const { error } = await supabase.rpc("register_mortality_event_tx", {
        _request_id: getRequestId(operation),
        _lot_id: selectedLot.id,
        _males: males,
        _females: females,
        _unsexed: unsexed,
        _mass_grams: selectedLot.kind === "insect" ? quantity : 0,
        _event_at: new Date().toISOString(),
        _cause: mortality.cause.trim(),
        _observations: mortality.notes.trim() || null,
      });
      if (error) throw error;
      resetRequestId(operation);
      setMortality({ quantity: "1", cause: "desconocida", notes: "" });
      await refreshOperationalData();
      toast.success("Baja registrada.");
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const moveLot = async () => {
    if (!online) return toast.error("Reconéctate antes de mover un lote.");
    if (!selectedLot || !movement.destination) return toast.error("Selecciona lote y destino.");
    const operation = `mobile:move:${selectedLot.id}`;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("move_lot_event_tx", {
        _request_id: getRequestId(operation),
        _lot_id: selectedLot.id,
        _destination_box_id: movement.destination,
        _event_at: new Date().toISOString(),
        _cause: movement.cause.trim(),
        _observations: movement.notes.trim() || null,
      });
      if (error) throw error;
      resetRequestId(operation);
      const destination = movement.destination;
      setMovement({ destination: "", cause: "reubicacion_operativa", notes: "" });
      await refreshOperationalData();
      chooseBox(destination);
      toast.success("Lote movido.");
    } catch (error) {
      toast.error(toUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title="Operar cajas"
      subtitle="Escanea, verifica y registra la actividad en el punto de trabajo."
      icon={<ScanLine className="h-6 w-6" />}
      actions={<QrScannerDialog onBox={chooseBox} />}
    >
      <div className="space-y-4">
        {!online && (
          <div className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <WifiOff className="h-5 w-5 shrink-0" /> Captura bloqueada hasta recuperar conexión.
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Caja</Label>
          <Select value={selectedBoxId} onValueChange={chooseBox} disabled={loadingBoxes}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder={loadingBoxes ? "Cargando..." : "Selecciona o escanea"} />
            </SelectTrigger>
            <SelectContent>
              {visibleBoxes.map((box) => (
                <SelectItem key={box.id} value={box.id}>
                  {box.code} · {box.kind === "rodent" ? "Roedores" : "Insectos"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedBox && (
          <>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {selectedBox.kind === "rodent" ? (
                      <Rat className="h-5 w-5 text-primary" />
                    ) : (
                      <Bug className="h-5 w-5 text-primary" />
                    )}
                    <h2 className="truncate text-lg font-semibold">{selectedBox.code}</h2>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {selectedBox.location || "Sin ubicación"}
                  </p>
                </div>
                <Badge variant="outline">
                  {lots.length} lote{lots.length === 1 ? "" : "s"}
                </Badge>
              </div>
            </Card>

            <div className="space-y-1.5">
              <Label>Lote activo</Label>
              <Select value={selectedLotId} onValueChange={setSelectedLotId} disabled={loadingLots}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={loadingLots ? "Cargando..." : "Selecciona un lote"} />
                </SelectTrigger>
                <SelectContent>
                  {lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.lot_code || lot.id.slice(0, 8)} ·{" "}
                      {lot.kind === "rodent"
                        ? `${Number(lot.males ?? 0) + Number(lot.females ?? 0) + Number(lot.unsexed ?? 0)} animales`
                        : `${Number(lot.mass_grams ?? 0)} g`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {lots.length === 0 ? (
              <Card className="p-5 text-center text-sm text-muted-foreground">
                Esta caja no tiene lotes activos.
              </Card>
            ) : (
              <Tabs defaultValue="mortality" className="space-y-3">
                <TabsList className="grid h-12 w-full grid-cols-2">
                  <TabsTrigger value="mortality" className="gap-2">
                    <Skull className="h-4 w-4" /> Baja
                  </TabsTrigger>
                  <TabsTrigger value="move" className="gap-2">
                    <ArrowRightLeft className="h-4 w-4" /> Movimiento
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="mortality">
                  <Card className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>{selectedLot?.kind === "insect" ? "Biomasa (g)" : "Cantidad"}</Label>
                        <Input
                          type="number"
                          min="0.01"
                          step={selectedLot?.kind === "insect" ? "0.01" : "1"}
                          value={mortality.quantity}
                          onChange={(event) =>
                            setMortality((value) => ({ ...value, quantity: event.target.value }))
                          }
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Causa</Label>
                        <Input
                          value={mortality.cause}
                          onChange={(event) =>
                            setMortality((value) => ({ ...value, cause: event.target.value }))
                          }
                          className="h-11"
                        />
                      </div>
                    </div>
                    <Textarea
                      value={mortality.notes}
                      onChange={(event) =>
                        setMortality((value) => ({ ...value, notes: event.target.value }))
                      }
                      placeholder="Observaciones"
                    />
                    <Button
                      className="h-12 w-full"
                      variant="destructive"
                      disabled={!selectedLot || saving || !online}
                      onClick={registerMortality}
                    >
                      Registrar baja
                    </Button>
                  </Card>
                </TabsContent>
                <TabsContent value="move">
                  <Card className="space-y-4 p-4">
                    <div className="space-y-1.5">
                      <Label>Caja destino</Label>
                      <Select
                        value={movement.destination}
                        onValueChange={(destination) =>
                          setMovement((value) => ({ ...value, destination }))
                        }
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Selecciona destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {destinationBoxes.map((box) => (
                            <SelectItem key={box.id} value={box.id}>
                              {box.code} · {box.location || "Sin ubicación"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      value={movement.cause}
                      onChange={(event) =>
                        setMovement((value) => ({ ...value, cause: event.target.value }))
                      }
                      placeholder="Motivo"
                      className="h-11"
                    />
                    <Textarea
                      value={movement.notes}
                      onChange={(event) =>
                        setMovement((value) => ({ ...value, notes: event.target.value }))
                      }
                      placeholder="Observaciones"
                    />
                    <Button
                      className="h-12 w-full"
                      disabled={!selectedLot || !movement.destination || saving || !online}
                      onClick={moveLot}
                    >
                      Mover lote
                    </Button>
                  </Card>
                </TabsContent>
              </Tabs>
            )}

            <div className="flex justify-end">
              <SubstrateUseDialog
                disabled={!online}
                box={{
                  id: selectedBox.id,
                  code: selectedBox.code,
                  box_type_id: selectedBox.box_type_id,
                }}
                lots={lots.map((lot) => ({ id: lot.id, lot_code: lot.lot_code }))}
              />
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
