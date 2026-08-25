type ClientErrorPayload = {
  message: string;
  source: string;
  path: string;
  version: string;
};

const MAX_MESSAGE_LENGTH = 500;

function appVersion() {
  return import.meta.env.VITE_APP_VERSION || "development";
}

function sanitizeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return message.replace(/https?:\/\/[^\s]+/g, "[url]").slice(0, MAX_MESSAGE_LENGTH);
}

export function reportClientError(error: unknown, source: string) {
  const payload: ClientErrorPayload = {
    message: sanitizeMessage(error),
    source,
    path: typeof window === "undefined" ? "ssr" : window.location.pathname,
    version: appVersion(),
  };

  console.error("[biotrack-client-error]", payload);
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;

  try {
    navigator.sendBeacon(
      "/client-errors",
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
    );
  } catch {
    // Error telemetry must never affect the user flow.
  }
}
