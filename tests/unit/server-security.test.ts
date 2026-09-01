import { describe, expect, it } from "vitest";
import {
  isAllowedTelemetryOrigin,
  parseClientErrorPayload,
  withSecurityHeaders,
} from "../../src/lib/server-security";

describe("server security", () => {
  it("sanitizes telemetry and rejects malformed payloads", () => {
    expect(parseClientErrorPayload("not-json")).toBeNull();
    expect(
      parseClientErrorPayload(
        JSON.stringify({
          message: "Failure\nhttps://private.example/token",
          source: "window\r\nforged",
          path: "/operate",
          version: "abc123",
        }),
      ),
    ).toEqual({
      message: "Failure [url]",
      source: "window forged",
      path: "/operate",
      version: "abc123",
    });
  });

  it("allows only same-origin browser telemetry", () => {
    expect(
      isAllowedTelemetryOrigin(
        new Request("https://biotrack.test/client-errors", {
          headers: { origin: "https://biotrack.test" },
        }),
      ),
    ).toBe(true);
    expect(
      isAllowedTelemetryOrigin(
        new Request("https://biotrack.test/client-errors", {
          headers: { origin: "https://other.test" },
        }),
      ),
    ).toBe(false);
  });

  it("adds browser hardening headers", () => {
    const response = withSecurityHeaders(
      new Request("https://biotrack.test/operate"),
      new Response("ok"),
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("permissions-policy")).toContain("camera=(self)");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });
});
