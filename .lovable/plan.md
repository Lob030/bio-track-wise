## AI Assistant Module — Plan

Build a functional chat-based assistant at `/ai` that parses natural-language commands into structured actions, shows a confirmation card, and executes safely against Supabase.

### Adjustments to the proposed spec

- **Use Lovable AI Gateway, not a raw Google API call.** Lovable Cloud already provisions `LOVABLE_API_KEY`; no user-supplied Google key needed.
- **Use a TanStack server function, not a Supabase Edge Function.** This stack's standard is `createServerFn` for app-internal AI calls (see `connecting-to-ai-models-tanstack`). Edge functions are reserved for webhooks/external callers.
- **Default model:** `google/gemini-3-flash-preview` via the AI SDK + OpenAI-compatible adapter.
- **Schema alignment:** the project's table is `genetic_lines` (not `lines`), and lots use `lot_code` + species `kind` filter — the executor will be adapted to the real schema in `types.ts`.
- **Keep TierGate (`gold+`)** as in the existing stub.

### Files to add/change

1. `src/lib/ai-gateway.server.ts` — provider helper (`createLovableAiGatewayProvider`) per the AI Gateway knowledge.
2. `src/lib/ai-assistant.functions.ts` — `parseAiCommand` server function:
   - Input: `{ userMessage: string, today: string }`
   - Uses `generateText` + `Output.object` (Zod) to return a typed `ParsedAction`:
     `{ type: "create_box" | "create_lot" | "update_lot" | "query" | "clarify", description, data?, requiresConfirmation }`
   - System prompt in Spanish, with few-shot examples for box codes / room / furniture / birth lots / unsexed counts.
3. `src/routes/ai.tsx` — full chat UI (replacing the stub), still wrapped in `<TierGate min="gold">`:
   - Message list (user / assistant bubbles, no background on assistant per design contract; user bubble uses `primary` tokens).
   - Composer (textarea + send button), auto-scroll, focus management.
   - Calls `parseAiCommand` via `useServerFn`.
   - Renders a **UI Proposal Card** (not just an AlertDialog) showing the parsed action's structured payload + `Confirmar y Ejecutar` / `Cancelar` buttons. Database call stays blocked until confirm.
   - Executor functions (`createBox`, `createLot`, `updateLot`, `runQuery`) run client-side against Supabase using the user's session (RLS-scoped). Optimistic toasts + `queryClient.invalidateQueries` for affected modules.
   - `query` type runs read-only Supabase counts (e.g. total active rodent population) and renders results inline without confirmation.

### Technical notes

- `LOVABLE_API_KEY` is already provisioned (visible in secrets). No `add_secret` needed.
- Server function returns plain DTO (`ParsedAction`) — no streaming required for this use case.
- Executor maps `lotData.kind` + species lookup via `species.kind` filter; line lookup via `genetic_lines` joined through `species_id`.
- Confirmation card shows: action type badge, human description, and a `<pre>` of the structured `data` for transparency.
- All errors surfaced via `sonner` toast; 429/402 from gateway shown with actionable copy.

### Out of scope (this iteration)

- Multi-turn memory / conversation persistence (single-shot per message).
- Tool-calling loop (single structured-output call is sufficient for the documented commands).
- Streaming tokens.

### Verification

- Build passes (auto).
- Manual test prompts: "Crea 5 cajas RA1 a RA5 en cuarto B mueble B", "Nacieron 14 pinkys en caja A4 hoy", "¿Cuántos roedores activos tengo?".
