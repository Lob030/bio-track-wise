const MAX_CLIENT_ERROR_LENGTH = 2_000;

export type SafeClientError = {
  message: string;
  source: string;
  path: string;
  version: string;
};

const clean = (value: unknown, maxLength: number) =>
  typeof value === "string"
    ? value
        .replace(/[\r\n\t]+/g, " ")
        .replace(/https?:\/\/\S+/gi, "[url]")
        .trim()
        .slice(0, maxLength)
    : "";

export function parseClientErrorPayload(body: string): SafeClientError | null {
  if (body.length > 16_384) return null;
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    const message = clean(value.message, MAX_CLIENT_ERROR_LENGTH);
    if (!message) return null;
    return {
      message,
      source: clean(value.source, 80) || "unknown",
      path: clean(value.path, 300) || "unknown",
      version: clean(value.version, 100) || "unknown",
    };
  } catch {
    return null;
  }
}

export function isAllowedTelemetryOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function withSecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "camera=(self), microphone=(), geolocation=()");
  headers.set(
    "content-security-policy",
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (new URL(request.url).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
