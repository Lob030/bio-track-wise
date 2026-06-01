// Maps raw Supabase/Postgres/server errors to safe, user-friendly Spanish
// messages. Prevents leaking schema names, constraint identifiers, internal
// paths, or raw provider errors to end users via toasts.

const PG_CODE_MESSAGES: Record<string, string> = {
  "23505": "Ya existe un registro con esos datos.",
  "23503": "No se puede completar: el registro está vinculado a otros datos.",
  "23502": "Faltan datos obligatorios.",
  "23514": "Los datos no cumplen con las reglas requeridas.",
  "22001": "Uno de los valores es demasiado largo.",
  "22P02": "Uno de los valores tiene un formato inválido.",
  "42501": "No tienes permiso para realizar esta acción.",
  "P0001": "No se pudo completar la operación.",
};

const GENERIC = "Ocurrió un error. Por favor intenta de nuevo.";

export function toUserFriendlyError(error: unknown, fallback: string = GENERIC): string {
  // Log the original error for debugging (kept out of the UI).
  if (typeof console !== "undefined") console.error("[app error]", error);

  const err = error as
    | { code?: string; message?: string; status?: number }
    | null
    | undefined;

  if (!err) return fallback;

  // Known business-rule errors surfaced from triggers/policies.
  const message = typeof err.message === "string" ? err.message : "";
  if (message.includes("TIER_LIMIT")) return "Límite del plan alcanzado.";
  if (message.includes("AI_LIMIT_REACHED")) {
    return "Has alcanzado el límite de 20 prompts de IA este mes. Actualiza a Diamond para uso ilimitado.";
  }
  if (message.includes("TIER_FORBIDDEN")) {
    return "Tu plan no incluye el Asistente IA. Requiere plan Gold o superior.";
  }

  // Map known Postgres error codes.
  if (err.code && PG_CODE_MESSAGES[err.code]) return PG_CODE_MESSAGES[err.code];

  // Auth-style errors expose generic, safe text already; map common ones.
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (message.toLowerCase().includes("user already registered")) {
    return "Ya existe una cuenta con ese correo.";
  }

  return fallback;
}
