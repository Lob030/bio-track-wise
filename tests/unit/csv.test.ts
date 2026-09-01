import { describe, expect, it } from "vitest";
import { parseCSV, serializeCSV } from "../../src/lib/csv";

describe("CSV import and export", () => {
  it("round-trips commas, quotes, empty values and line breaks", () => {
    const input = [
      { code: "L-1", notes: 'A, B and "quoted" text', nullable: null },
      { code: "L-2", notes: "First line\nSecond line", nullable: undefined },
    ];

    expect(parseCSV(serializeCSV(input))).toEqual([
      { code: "L-1", notes: 'A, B and "quoted" text', nullable: "" },
      { code: "L-2", notes: "First line\nSecond line", nullable: "" },
    ]);
  });

  it("accepts UTF-8 BOM, CRLF and ignores blank lines", () => {
    expect(parseCSV("\uFEFFcode,name\r\nL-1,Ratón\r\n\r\nL-2,Grillo\r\n")).toEqual([
      { code: "L-1", name: "Ratón" },
      { code: "L-2", name: "Grillo" },
    ]);
  });

  it("returns no records for header-only input and rejects malformed quoted data", () => {
    expect(parseCSV("code,name\n")).toEqual([]);
    expect(() => parseCSV('code,name\nL-1,"unfinished')).toThrow("CSV_UNCLOSED_QUOTE");
  });
});
