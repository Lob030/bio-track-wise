export type ScannedBox = { boxId: string; kind: "rodent" | "insect" | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBoxQr(value: string, baseOrigin?: string): ScannedBox | null {
  const trimmed = value.trim();
  if (UUID_PATTERN.test(trimmed)) return { boxId: trimmed, kind: null };

  try {
    const url = new URL(trimmed, baseOrigin ?? "https://biotrack.local");
    if (baseOrigin && url.origin !== baseOrigin) return null;
    const boxId = url.searchParams.get("box");
    if (!boxId || !UUID_PATTERN.test(boxId)) return null;
    const kind = url.pathname.startsWith("/rodents")
      ? "rodent"
      : url.pathname.startsWith("/insects")
        ? "insect"
        : null;
    return { boxId, kind };
  } catch {
    return null;
  }
}
