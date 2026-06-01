import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


const ParsedActionSchema = z.union([
  z.object({
    type: z.literal("create_box"),
    description: z.string(),
    boxCodes: z.array(z.string()),
    kind: z.enum(["rodent", "insect"]).optional(),
    room: z.string().optional(),
    furniture: z.string().optional(),
  }),
  z.object({
    type: z.literal("create_lot"),
    description: z.string(),
    kind: z.enum(["rodent", "insect"]),
    boxCode: z.string(),
    quantity: z.number(),
    speciesName: z.string().optional(),
    lineName: z.string().optional(),
    startedAt: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    type: z.literal("query"),
    description: z.string(),
    queryType: z.enum(["active_rodents", "active_insects", "total_boxes", "total_lots"]),
  }),
  z.object({
    type: z.literal("clarify"),
    description: z.string(),
  }),
]);

export type ParsedAction = z.infer<typeof ParsedActionSchema>;

const buildSystemPrompt = (today: string) => `Eres un asistente de bioterio (cría de roedores e insectos). Convierte comandos en español a un JSON estructurado.

USUARIO: "Crea 5 cajas RA1 a RA5 en cuarto B mueble B"
RESPUESTA EXACTA:
{
  "type": "create_box",
  "description": "Voy a crear 5 cajas: RA1, RA2, RA3, RA4, RA5 en cuarto B, mueble B",
  "boxCodes": ["RA1", "RA2", "RA3", "RA4", "RA5"],
  "kind": "rodent",
  "room": "B",
  "furniture": "B"
}

USUARIO: "Nacieron 14 pinkys en caja A4 hoy"
RESPUESTA EXACTA:
{
  "type": "create_lot",
  "description": "Voy a registrar un lote de nacimiento con 14 pinkys en caja A4",
  "kind": "rodent",
  "boxCode": "A4",
  "quantity": 14,
  "speciesName": "raton",
  "startedAt": "${today}"
}

USUARIO: "¿Cuántos roedores activos tengo?"
RESPUESTA EXACTA:
{
  "type": "query",
  "description": "Voy a consultar cuántos roedores activos tienes",
  "queryType": "active_rodents"
}

REGLAS:
- Devuelve SOLO el objeto JSON, sin markdown ni texto extra.
- "type" debe ser uno de: "create_box" | "create_lot" | "query" | "clarify".
- Rangos "RA1-RA5" o "RA1 a RA5" se expanden a ["RA1","RA2","RA3","RA4","RA5"].
- "pinkys" o "crías" => kind="rodent".
- Fecha de hoy: ${today}.
- Si no estás seguro: { "type": "clarify", "description": "No entendí. Sé más específico." }`;

function regexFallback(userMessage: string, today: string): ParsedAction {
  const msg = userMessage.toLowerCase();

  // Query
  if (/(cu[aá]nt[oa]s?|cu[aá]nto)/.test(msg)) {
    if (msg.includes("caja")) {
      return { type: "query", description: "Voy a consultar cuántas cajas tienes", queryType: "total_boxes" };
    }
    if (msg.includes("lote")) {
      return { type: "query", description: "Voy a consultar cuántos lotes activos tienes", queryType: "total_lots" };
    }
    const isInsect = /(insect|grill|tenebr|cucara)/.test(msg);
    return {
      type: "query",
      description: `Voy a consultar cuántos ${isInsect ? "insectos" : "roedores"} activos tienes`,
      queryType: isInsect ? "active_insects" : "active_rodents",
    };
  }

  // Create box: "crea(r) caja(s) X" / range
  if (msg.includes("caja") && /(crea|crear|agreg|añad|anad)/.test(msg)) {
    // expand range like RA1 a RA5 or RA1-RA5
    let codes: string[] = [];
    const range = userMessage.match(/([A-Za-z]+)(\d+)\s*(?:a|-|hasta)\s*(?:[A-Za-z]+)?(\d+)/);
    if (range) {
      const prefix = range[1].toUpperCase();
      const start = parseInt(range[2]);
      const end = parseInt(range[3]);
      if (end >= start && end - start < 100) {
        for (let i = start; i <= end; i++) codes.push(`${prefix}${i}`);
      }
    }
    if (!codes.length) {
      codes = (userMessage.match(/\b[A-Za-z]+\d+\b/g) ?? []).map((c) => c.toUpperCase());
    }
    if (!codes.length) {
      // try "5 cajas" with no codes -> ask to clarify
      return { type: "clarify", description: "¿Qué códigos quieres usar para las cajas? Ej: RA1, RA2..." };
    }
    const roomMatch = userMessage.match(/cuarto\s+([A-Za-z0-9]+)/i);
    const furnMatch = userMessage.match(/mueble\s+([A-Za-z0-9]+)/i);
    const isInsect = /(insect|grill|tenebr|cucara)/.test(msg);
    return {
      type: "create_box",
      description: `Voy a crear ${codes.length} caja(s): ${codes.join(", ")}${roomMatch ? ` en cuarto ${roomMatch[1]}` : ""}${furnMatch ? `, mueble ${furnMatch[1]}` : ""}`,
      boxCodes: codes,
      kind: isInsect ? "insect" : "rodent",
      ...(roomMatch ? { room: roomMatch[1] } : {}),
      ...(furnMatch ? { furniture: furnMatch[1] } : {}),
    };
  }

  // Create lot
  if ((msg.includes("naci") || msg.includes("pinky") || msg.includes("lote") || msg.includes("registr")) && msg.includes("caja")) {
    const numMatch = userMessage.match(/\d+/);
    const boxMatch = userMessage.match(/caja\s+([A-Za-z0-9]+)/i);
    const code = boxMatch?.[1]?.toUpperCase() ?? "";
    if (!code || !numMatch) {
      return { type: "clarify", description: "¿En qué caja y cuántos individuos?" };
    }
    const isInsect = /(insect|grill|tenebr|cucara)/.test(msg);
    return {
      type: "create_lot",
      description: `Voy a registrar un lote con ${numMatch[0]} ${isInsect ? "insectos" : "individuos"} en caja ${code}`,
      kind: isInsect ? "insect" : "rodent",
      boxCode: code,
      quantity: parseInt(numMatch[0]),
      startedAt: today,
    };
  }

  return {
    type: "clarify",
    description: `No entendí "${userMessage}". Intenta algo como "Crea caja RA1" o "¿Cuántos roedores tengo?".`,
  };
}

const AiCommandInputSchema = z.object({
  userMessage: z.string().trim().min(1, "Mensaje vacío").max(500, "Mensaje demasiado largo"),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

export const parseAiCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userMessage: string; today: string }) => AiCommandInputSchema.parse(input))


  .handler(async ({ data }): Promise<ParsedAction> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    try {
      const { object } = await generateObject({
        model,
        system: buildSystemPrompt(data.today),
        prompt: data.userMessage,
        schema: ParsedActionSchema,
      });
      return object;
    } catch (err: any) {
      console.error("[parseAiCommand] generateObject failed:", err?.message ?? err);
      if (err?.text) console.error("[parseAiCommand raw text]:", err.text);
      // Regex fallback
      return regexFallback(data.userMessage, data.today);
    }
  });
