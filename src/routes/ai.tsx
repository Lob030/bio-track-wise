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

const requiresConfirmation = (a: ParsedAction) =>
  a.type === "create_box" || a.type === "create_lot";

function AIAssistantPage() {
  const qc = useQueryClient();
  const parseFn = useServerFn(parseAiCommand);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "¡Hola! Soy tu asistente de bioterio. Puedo ayudarte a:\n• Crear cajas nuevas\n• Registrar lotes de nacimiento o engorda\n• Consultar inventario\n\nDescríbeme qué necesitas en lenguaje natural.",
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
        await runQuery(action);
      } else if (requiresConfirmation(action)) {
        setPending({ msgId, action });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al procesar");
    } finally {
      setIsLoading(false);
    }
  };

  const runQuery = async (action: Extract<ParsedAction, { type: "query" }>) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const q = action.queryType;
    let result = "";
    try {
      if (q === "active_rodents" || q === "active_insects") {
        const k = q === "active_rodents" ? "rodent" : "insect";
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
      } else if (q === "total_boxes") {
        const { count } = await supabase
          .from("boxes")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", u.user.id);
        result = `📦 Tienes **${count ?? 0}** cajas registradas.`;
      } else if (q === "total_lots") {
        const { count } = await supabase
          .from("lots")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", u.user.id)
          .eq("status", "active");
        result = `🧬 Tienes **${count ?? 0}** lotes activos.`;
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
        const codes = action.boxCodes;
        if (!codes.length) throw new Error("Sin códigos de caja");
        const location = [
          action.room ? `Cuarto ${action.room}` : null,
          action.furniture ? `Mueble ${action.furniture}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const rows = codes.map((code) => ({
          owner_id: ownerId,
          code,
          location: location || null,
          kind: (action.kind ?? "rodent") as "rodent" | "insect",
        }));
        const { error } = await supabase.from("boxes").insert(rows);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["boxes"] });
        toast.success(`${codes.length} caja(s) creadas`);
      } else if (action.type === "create_lot") {
        const k = action.kind;

        // Resolve species (best-effort fuzzy)
        let spQuery = supabase
          .from("species")
          .select("id,name")
          .eq("owner_id", ownerId)
          .eq("kind", k);
        if (action.speciesName) spQuery = spQuery.ilike("name", `%${action.speciesName}%`);
        const { data: sp } = await spQuery.limit(1).maybeSingle();
        if (!sp) throw new Error(`No se encontró especie ${k}${action.speciesName ? ` "${action.speciesName}"` : ""}`);

        // Resolve box
        const { data: b } = await supabase
          .from("boxes")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("code", action.boxCode)
          .maybeSingle();
        if (!b) throw new Error(`Caja "${action.boxCode}" no encontrada`);

        // Resolve line (optional)
        let lineId: string | null = null;
        if (action.lineName) {
          const { data: ln } = await supabase
            .from("genetic_lines")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("species_id", sp.id)
            .ilike("name", `%${action.lineName}%`)
            .limit(1)
            .maybeSingle();
          if (ln) lineId = ln.id;
        }

        const { error } = await supabase.from("lots").insert({
          owner_id: ownerId,
          kind: k,
          lot_type: "birth" as any,
          species_id: sp.id,
          line_id: lineId,
          box_id: b.id,
          males: 0,
          females: 0,
          unsexed: k === "rodent" ? action.quantity : 0,
          mass_grams: k === "insect" ? action.quantity : 0,
          notes: action.notes ?? null,
          started_at: action.startedAt,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["lots"] });
        toast.success("Lote creado");
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
          const showCard = m.action && requiresConfirmation(m.action);
          const { action: _omit, ...rest } = m.action ?? ({} as any);
          const payload = m.action ? (() => {
            const { description: _d, type: _t, ...p } = m.action as any;
            return p;
          })() : null;
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
                    {showCard && m.action && (
                      <Card className="border-amber-700/40 bg-amber-500/5 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <AlertTriangle className="h-4 w-4 text-amber-glow" />
                          Propuesta de mutación
                          <Badge variant="outline" className="ml-auto text-[10px] uppercase">
                            {m.action.type.replace("_", " ")}
                          </Badge>
                        </div>
                        <pre className="text-xs bg-background/60 border border-border rounded-md p-3 overflow-x-auto max-h-60">
{JSON.stringify(payload, null, 2)}
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
