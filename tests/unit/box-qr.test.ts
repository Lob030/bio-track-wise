import { describe, expect, it } from "vitest";
import { parseBoxQr } from "../../src/lib/box-qr";

const boxId = "3f6a9aa2-9c27-4cde-87c7-d90ad21c2be8";

describe("box QR parser", () => {
  it("accepts direct identifiers and BioTrack box links", () => {
    expect(parseBoxQr(boxId)).toEqual({ boxId, kind: null });
    expect(
      parseBoxQr(`https://app.biotrack.test/operate?box=${boxId}`, "https://app.biotrack.test"),
    ).toEqual({ boxId, kind: null });
    expect(
      parseBoxQr(
        `https://app.biotrack.test/rodents/boxes?box=${boxId}`,
        "https://app.biotrack.test",
      ),
    ).toEqual({ boxId, kind: "rodent" });
  });

  it("rejects foreign origins and malformed identifiers", () => {
    expect(parseBoxQr(`https://evil.test/operate?box=${boxId}`, "https://app.biotrack.test")).toBe(
      null,
    );
    expect(parseBoxQr("not-a-box")).toBe(null);
  });
});
