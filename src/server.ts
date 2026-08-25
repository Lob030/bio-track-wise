import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  isAllowedTelemetryOrigin,
  parseClientErrorPayload,
  withSecurityHeaders,
} from "./lib/server-security";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type RuntimeEnv = { APP_VERSION?: string };

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: RuntimeEnv, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return withSecurityHeaders(
        request,
        new Response(
          JSON.stringify({
            status: "ok",
            service: "biotrack",
            version: env.APP_VERSION ?? "unknown",
          }),
          { headers: { "cache-control": "no-store", "content-type": "application/json" } },
        ),
      );
    }
    if (url.pathname === "/client-errors" && request.method === "POST") {
      if (!isAllowedTelemetryOrigin(request)) {
        return withSecurityHeaders(request, new Response(null, { status: 403 }));
      }
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return withSecurityHeaders(request, new Response(null, { status: 415 }));
      }
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (contentLength > 16_384) {
        return withSecurityHeaders(request, new Response(null, { status: 413 }));
      }

      const payload = parseClientErrorPayload(await request.text());
      if (!payload) return withSecurityHeaders(request, new Response(null, { status: 400 }));
      console.error("[biotrack-client-error]", JSON.stringify(payload));
      return withSecurityHeaders(request, new Response(null, { status: 204 }));
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(request, brandedErrorResponse());
    }
  },
};
