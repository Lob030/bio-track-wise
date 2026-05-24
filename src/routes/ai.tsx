import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TierGate } from "@/components/tier-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { parseAiCommand, type ParsedAction } from "@/lib/ai-assistant.functions";

export const Route = createFileRoute("/ai")({
  component: () => (
    <TierGate min="gold" module="Asistente IA">
      <AIAssistantPage />
    </TierGate>
  ),
});

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: ParsedAction;
  timestamp: Date;
}

function AIAssistantPage() {
  const qc = useQueryClient();
  const parseFn = useServerFn(parseAiCommand);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "¡Hola! Soy tu asistente de bioterio. Puedo ayudarte a:\n• Crear cajas nuevas\n• Registrar lotes de nacimiento o engorda\n• Actualizar datos de un lote\n• Consultar inventario\n\nDescríbeme qué necesitas en lenguaje natural.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pending, setPending] = useState<{ msgId: string; action: ParsedAction } | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isLoading, pending]);

  const addMessage = (m: Omit<Message, "id" | "timestamp">) =>
    setMessages((prev) => [
      ...prev,
      { ...m, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date() },
    ]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    addMessage({ role: "user", content: text });
    setIsLoading(true);
    try {
      const action = await parseFn({
        data: { userMessage: text, today: new Date().toISOString().slice(0, 10) },
      });
      const msgId = `${Date.now()}-a`;
      setMessages((prev) => [
        ...prev,
        { id: msgId, role: "assistant", content: action.description, action, timestamp: new Date() },
      ]);

      if (action.type === "query") {
        await runQuery(action, msgId);
      } else if (action.requiresConfirmation) {
        setPending({ msgId, action });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al procesar");
    } finally {
      setIsLoading(false);
    }
  };

  const runQuery = async (action: ParsedAction, msgId: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const kind = action.data?.queryKind;
    let result = "";
    try {
      if (kind === "count_rodents" || kind === "count_insects") {
        const k = kind === "count_rodents" ? "rodent" : "insect";
        const { data } = await supabase
          .from("lots")
          .select("males,females,unsexed,mass_grams")
          .eq("owner_id", u.user.id)
          .eq("kind", k)
          .eq("status", "active");
        const total = (data ?? []).reduce(
          (s, l) => s + (l.males ?? 0) + (l.females ?? 0) + (l.unsexed ?? 0),
          0,
        );
        const mass = (data ?? []).reduce((s, l) => s + Number(l.mass_grams ?? 0), 0);
        result =
          k === "rodent"
            ? `📊 Tienes **${total}** roedores activos en ${data?.length ?? 0} lotes.`
            : `📊 Tienes **${mass.toFixed(1)} g** de biomasa de insectos en ${data?.length ?? 0} lotes.`;
      } else if (kind === "count_boxes") {
        const { count } = await supabase
          .from("boxes")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", u.user.id);
        result = `📦 Tienes **${count ?? 0}** cajas registradas.`;
      } else if (kind === "count_lots") {
        const { count } = await supabase
          .from("lots")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", u.user.id)
          .eq("status", "active");
        result = `🧬 Tienes **${count ?? 0}** lotes activos.`;
      } else {
        result = "No pude determinar la consulta.";
      }
      addMessage({ role: "assistant", content: result });
    } catch (e: any) {
      toast.error(e?.message ?? "Error en consulta");
    }
  };

  const execute = async () => {
    if (!pending) return;
    const { action, msgId } = pending;
    setIsLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("No autenticado");
      const ownerId = u.user.id;

      if (action.type === "create_box") {
        const codes = action.data?.boxCodes ?? [];
        if (!codes.length) throw new Error("Sin códigos de caja");
        const rows = codes.map((code) => ({
          owner_id: ownerId,
          code,
          location: action.data?.location ?? null,
          kind: (action.data?.kind ?? "rodent") as "rodent" | "insect",
          capacity: action.data?.capacity ?? null,
        }));
        const { error } = await supabase.from("boxes").insert(rows);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["boxes"] });
        toast.success(`${codes.length} caja(s) creadas`);
      } else if (action.type === "create_lot") {
        const d = action.data ?? {};
        const k = (d.kind ?? "rodent") as "rodent" | "insect";

        // Resolve species
        let speciesQuery = supabase
          .from("species")
          .select("id,name")
          .eq("owner_id", ownerId)
          .eq("kind", k);
        if (d.speciesName) speciesQuery = speciesQuery.ilike("name", `%${d.speciesName}%`);
        const { data: sp } = await speciesQuery.limit(1).maybeSingle();
        if (!sp) throw new Error(`No se encontró especie ${k}${d.speciesName ? ` "${d.speciesName}"` : ""}`);

        // Resolve box
        let boxId: string | null = null;
        if (d.boxCode) {
          const { data: b } = await supabase
            .from("boxes")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("code", d.boxCode)
            .maybeSingle();
          if (!b) throw new Error(`Caja "${d.boxCode}" no encontrada`);
          boxId = b.id;
        }

        // Resolve line (optional)
        let lineId: string | null = null;
        let lq = supabase
          .from("genetic_lines")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("species_id", sp.id);
        if (d.lineName) lq = lq.ilike("name", `%${d.lineName}%`);
        const { data: ln } = await lq.limit(1).maybeSingle();
        if (ln) lineId = ln.id;

        const { error } = await supabase.from("lots").insert({
          owner_id: ownerId,
          kind: k,
          lot_type: (d.lotType ?? "engorda") as any,
          species_id: sp.id,
          line_id: lineId,
          box_id: boxId,
          males: d.males ?? 0,
          females: d.females ?? 0,
          unsexed: d.unsexed ?? 0,
          mass_grams: d.massGrams ?? 0,
          notes: d.notes ?? null,
          started_at: d.startedAt ?? new Date().toISOString().slice(0, 10),
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["lots"] });
        toast.success("Lote creado");
      } else if (action.type === "update_lot") {
        const d = action.data ?? {};
        if (!d.lotCode) throw new Error("Falta lot_code");
        const { data: lot } = await supabase
          .from("lots")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("lot_code", d.lotCode)
          .maybeSingle();
        if (!lot) throw new Error(`Lote "${d.lotCode}" no encontrado`);
        const { error } = await supabase.from("lots").update(d.updates ?? {}).eq("id", lot.id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["lots"] });
        toast.success("Lote actualizado");
      }

      setConfirmed((s) => new Set(s).add(msgId));
      addMessage({ role: "assistant", content: "✅ Acción ejecutada correctamente." });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al ejecutar");
      addMessage({ role: "assistant", content: `❌ Error: ${e?.message ?? "desconocido"}` });
    } finally {
      setPending(null);
      setIsLoading(false);
    }
  };

  const cancel = () => {
    if (!pending) return;
    setCancelled((s) => new Set(s).add(pending.msgId));
    addMessage({ role: "assistant", content: "Acción cancelada." });
    setPending(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-4xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Asistente IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Lenguaje natural con confirmación obligatoria antes de escribir en la base de datos.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((m) => {
          const isUser = m.role === "user";
          const isPending = pending?.msgId === m.id;
          const wasConfirmed = confirmed.has(m.id);
          const wasCancelled = cancelled.has(m.id);
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
                {isUser ? (
                  <div className="rounded-2xl rounded-tr-sm px-4 py-2.5 bg-primary text-primary-foreground">
                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm whitespace-pre-wrap text-foreground">{m.content}</p>
                    {m.action && m.action.requiresConfirmation && m.action.type !== "query" && (
                      <Card className="border-amber-700/40 bg-amber-500/5 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <AlertTriangle className="h-4 w-4 text-amber-glow" />
                          Propuesta de mutación
                          <Badge variant="outline" className="ml-auto text-[10px] uppercase">
                            {m.action.type.replace("_", " ")}
                          </Badge>
                        </div>
                        <pre className="text-xs bg-background/60 border border-border rounded-md p-3 overflow-x-auto max-h-60">
{JSON.stringify(m.action.data ?? {}, null, 2)}
                        </pre>
                        {isPending && (
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={cancel} disabled={isLoading}>
                              <XCircle className="h-4 w-4 mr-1" /> Cancelar
                            </Button>
                            <Button size="sm" onClick={execute} disabled={isLoading}>
                              {isLoading ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                              )}
                              Confirmar y ejecutar
                            </Button>
                          </div>
                        )}
                        {wasConfirmed && (
                          <div className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Ejecutada
                          </div>
                        )}
                        {wasCancelled && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Cancelada
                          </div>
                        )}
                      </Card>
                    )}
                  </div>
                )}
                <div className={`text-[10px] text-muted-foreground mt-1 ${isUser ? "text-right" : ""}`}>
                  {m.timestamp.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        {isLoading && !pending && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <Card className="mt-4 p-3 border-border bg-card/60">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder='Ej: "Crea 5 cajas RA1 a RA5 en cuarto B mueble B"'
            rows={2}
            className="resize-none flex-1 bg-background/50"
            disabled={isLoading || !!pending}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim() || !!pending}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {pending && (
          <p className="text-xs text-amber-glow mt-2">
            Pendiente de confirmación — revisa la propuesta y confirma o cancela arriba.
          </p>
        )}
      </Card>
    </div>
  );
}
