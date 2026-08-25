// Maps raw Supabase/Postgres/server errors to safe, user-friendly Spanish
// messages. Prevents leaking schema names, constraint identifiers, internal
// paths, or raw provider errors to end users via toasts.

const PG_CODE_MESSAGES: Record<string, string> = {
  "23505": "Ya existe un registro con esos datos.",
  "23503": "No se puede completar: el registro esta vinculado a otros datos.",
  "23502": "Faltan datos obligatorios.",
  "23514": "Los datos no cumplen con las reglas requeridas.",
  "22001": "Uno de los valores es demasiado largo.",
  "22P02": "Uno de los valores tiene un formato invalido.",
  "42501": "No tienes permiso para realizar esta accion.",
  P0001: "No se pudo completar la operacion.",
};

const GENERIC = "Ocurrio un error. Por favor intenta de nuevo.";

const CONSTRAINT_MESSAGES: Record<string, string> = {
  species_org_kind_name_uidx: "Ya existe una especie con ese nombre y tipo.",
  genetic_lines_org_species_name_uidx:
    "Ya existe una linea genetica con ese nombre para la especie.",
  boxes_org_code_uidx: "Ya existe una caja con ese codigo.",
  lots_org_code_uidx: "Ya existe un lote con ese codigo.",
  purchases_org_invoice_uidx: "Ya existe una compra con ese numero de factura.",
  lots_org_species_kind_fkey:
    "La especie no pertenece al bioterio o no corresponde al tipo de lote.",
  lots_org_line_species_fkey: "La linea genetica no corresponde a la especie seleccionada.",
  lots_org_box_kind_fkey: "La caja no pertenece al bioterio o no corresponde al tipo de lote.",
  lots_org_parent_fkey: "El lote padre no pertenece al mismo bioterio.",
  lots_status_dates_compatible: "El estado y la fecha de finalizacion del lote son incompatibles.",
  species_size_rules_valid: "Las tallas contienen rangos, pesos o precios invalidos.",
  warehouse_purchases_kind_quantity: "La cantidad de la compra no corresponde al tipo de animal.",
  orders_discount_range: "El descuento debe estar entre 0 y 100.",
  order_items_quantity_positive: "La cantidad vendida debe ser mayor que cero.",
  alert_rules_scope_lot_compatible:
    "Selecciona un lote cuando el alcance de la alerta sea por lote.",
};

export function toUserFriendlyError(error: unknown, fallback: string = GENERIC): string {
  // Log the original error for debugging (kept out of the UI).
  if (typeof console !== "undefined") console.error("[app error]", error);

  const err = error as { code?: string; message?: string; status?: number } | null | undefined;

  if (!err) return fallback;

  // Known business-rule errors surfaced from triggers/policies.
  const message = typeof err.message === "string" ? err.message : "";
  if (message.includes("TIER_LIMIT")) return "Limite del plan alcanzado.";
  if (message.includes("DATA_QUALITY:")) {
    return message.split("DATA_QUALITY:")[1]?.split("\n")[0]?.trim() || PG_CODE_MESSAGES.P0001;
  }
  const domainMessages = [
    "La causa de mortalidad es obligatoria.",
    "La fecha del evento de mortalidad no es valida.",
    "La evidencia debe ser una URL http o https valida.",
    "El lote progenitor no corresponde a la organizacion, especie o linea.",
    "El evento reproductivo no corresponde a la organizacion o especie.",
    "El lote reproductor principal no existe o no esta activo.",
    "Los lotes reproductores deben compartir organizacion, tipo, especie y linea.",
    "El apareamiento de roedores requiere dos lotes reproductores.",
    "El lote descendiente no corresponde a los progenitores.",
    "El motivo del ajuste es obligatorio.",
  ];
  const domainMessage = domainMessages.find((candidate) => message.includes(candidate));
  if (domainMessage) return domainMessage;
  for (const [constraint, friendly] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (message.includes(constraint)) return friendly;
  }

  // Map known Postgres error codes.
  if (err.code && PG_CODE_MESSAGES[err.code]) return PG_CODE_MESSAGES[err.code];

  // Auth-style errors expose generic, safe text already; map common ones.
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Correo o contrasena incorrectos.";
  }
  if (message.toLowerCase().includes("user already registered")) {
    return "Ya existe una cuenta con ese correo.";
  }

  return fallback;
}
