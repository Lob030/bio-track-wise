import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ActionSchema = z.object({
  type: z.enum(["create_box", "create_lot", "update_lot", "query", "clarify"]),
  description: z.string(),
  requiresConfirmation: z.boolean(),
  data: z
    .object({
      // create_box
      boxCodes: z.array(z.string()).optional(),
      location: z.string().optional(),
      kind: z.enum(["rodent", "insect"]).optional(),
      capacity: z.number().optional(),
      // create_lot
      lotType: z.enum(["birth", "engorda", "reproduccion", "compra"]).optional(),
      boxCode: z.string().optional(),
      speciesName: z.string().optional(),
      lineName: z.string().optional(),
      males: z.number().optional(),
      females: z.number().optional(),
      unsexed: z.number().optional(),
      massGrams: z.number().optional(),
      startedAt: z.string().optional(),
      notes: z.string().optional(),
      // update_lot
      lotCode: z.string().optional(),
      updates: z
        .object({
          males: z.number().optional(),
          females: z.number().optional(),
          unsexed: z.number().optional(),
          mass_grams: z.number().optional(),
          notes: z.string().optional(),
          status: z.enum(["active", "finalizado"]).optional(),
        })
        .optional(),
      // query
      queryKind: z.enum(["count_rodents", "count_insects", "count_boxes", "count_lots"]).optional(),
    })
    .optional(),
});

export type ParsedAction = z.infer<typeof ActionSchema>;

export const parseAiCommand = createServerFn({ method: "POST" })
  .inputValidator((input: { userMessage: string; today: string }) => input)
  .handler(async ({ data }): Promise<ParsedAction> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const system = `Eres el asistente de un bioterio (cría de roedores e insectos). Tu trabajo: convertir comandos en español en una acción estructurada JSON.

Tipos de acción:
- "create_box": crear una o varias cajas. Datos: boxCodes[], location (cuarto/mueble), kind ("rodent" | "insect"), capacity opcional.
- "create_lot": registrar un lote. Datos: lotType (birth | engorda | reproduccion | compra), boxCode, speciesName, lineName opcional, males/females/unsexed o quantity (asume unsexed si no se especifica sexo), massGrams (insectos), startedAt (usa la fecha de hoy si no se especifica: ${data.today}), notes.
- "update_lot": modificar un lote existente por lot_code. Datos: lotCode, updates{...}.
- "query": preguntas de inventario. Datos: queryKind ∈ count_rodents | count_insects | count_boxes | count_lots. NO requiere confirmación.
- "clarify": si el comando es ambiguo. NO requiere confirmación.

Reglas:
- create_*/update_* SIEMPRE requiresConfirmation=true.
- query y clarify requiresConfirmation=false.
- "description" en español, conciso, resumiendo lo que vas a hacer ("Voy a crear 5 cajas RA1..RA5 en cuarto B mueble B").
- Si dicen "pinkys", "crías recién nacidas", "ratones recién nacidos" → kind=rodent, lotType=birth, valores en unsexed.
- Rangos como "RA1-RA5" se expanden a ["RA1","RA2","RA3","RA4","RA5"].
- Fecha "hoy" = ${data.today}.

Fecha de hoy: ${data.today}.`;

    try {
      const { experimental_output } = await generateText({
        model,
        system,
        prompt: data.userMessage,
        experimental_output: Output.object({ schema: ActionSchema }),
      });
      return experimental_output;
    } catch (err: any) {
      console.error("[parseAiCommand]", err);
      return {
        type: "clarify",
        description: "No pude procesar tu mensaje. Intenta reformularlo.",
        requiresConfirmation: false,
      };
    }
  });
