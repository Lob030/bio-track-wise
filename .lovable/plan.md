# Fix: server-side tier + quota enforcement for the AI assistant

The security scan reports a single remaining issue: `parseAiCommand` authenticates the user but does not enforce the subscription tier or the monthly AI-prompt cap on the server. The gate currently exists only in the UI (`TierGate min="gold"`), so any logged-in user can call the RPC directly.

Business rules (from `billing.tsx`):
- `bronze` / `silver`: no AI access.
- `gold`: AI access, **20 prompts/month**.
- `diamond`: AI access, **unlimited**.

## Approach

Enforce both checks atomically inside a database function (avoids a read-then-write race), and call it from the server function before invoking the AI gateway.

### 1. Database migration — atomic quota guard

Create a `SECURITY DEFINER` function `public.consume_ai_prompt()` that runs as the authenticated user (`auth.uid()`):

- Read the caller's `tier` and `ai_prompts_used_this_month` from `profiles`.
- If `tier` not in (`gold`, `diamond`) → raise an exception with code/message `TIER_FORBIDDEN`.
- If `tier = 'gold'` and `ai_prompts_used_this_month >= 20` → raise `AI_LIMIT_REACHED`.
- Otherwise increment `ai_prompts_used_this_month` by 1 (skip increment for `diamond` since it is unlimited, or increment harmlessly — increment for tracking either way) and return success.
- Grant `EXECUTE` on the function to `authenticated`.

This keeps the check-and-increment in one transaction so the cap cannot be bypassed by concurrent calls.

### 2. `src/lib/ai-assistant.functions.ts`

At the start of the `.handler()` (which already has `context.supabase` and `context.userId` from `requireSupabaseAuth`), call the RPC:

```ts
const { error: gateErr } = await context.supabase.rpc("consume_ai_prompt");
if (gateErr) {
  // map to a safe message; rethrow so the client shows a toast
  throw new Error(gateErr.message.includes("AI_LIMIT_REACHED")
    ? "Has alcanzado el límite de 20 prompts de IA este mes."
    : "Tu plan no incluye el Asistente IA.");
}
```

Run this **before** building the gateway provider / calling `generateObject`, so no AI cost is incurred when the caller is not entitled. The middleware chain stays `.middleware([requireSupabaseAuth]).inputValidator(...).handler(...)`.

### 3. Client UX (optional, light touch)

`src/routes/ai.tsx` already wraps the page in `TierGate min="gold"`. No functional change needed, but the AI call site should surface the thrown error message via the existing `toast.error(toUserFriendlyError(...))` path so a Gold user who hits the 20/month cap sees a clear message. Verify the catch already routes through `toUserFriendlyError`; if `AI_LIMIT_REACHED`/`TIER_FORBIDDEN` aren't mapped, add them to `src/lib/errors.ts`.

## Verification

- Confirm build passes.
- Re-run the security scan; expect `SERVER_FN_MISSING_AUTH` to clear.
- Mark the finding fixed in the security panel.

## Technical notes

- The monthly counter reset (`tier_renewed_at`) is out of scope here — this plan only enforces the existing counter; if no reset job exists, I'll flag it but not build it unless you want it.
- No changes to `client.ts`, `types.ts`, or other auto-generated files.
