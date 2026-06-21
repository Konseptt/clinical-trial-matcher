import { describe, it, expect } from "vitest";
import { escapeCsvCell } from "@/lib/format";

describe("escapeCsvCell formula-injection defense", () => {
  it("prefixes formula-leading cells with a quote", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("\"'=SUM(A1:A2)\"");
    expect(escapeCsvCell("+1+1")).toBe("\"'+1+1\"");
    expect(escapeCsvCell("-2")).toBe("\"'-2\"");
    expect(escapeCsvCell("@cmd")).toBe("\"'@cmd\"");
  });

  it("leaves normal text unprefixed but quoted", () => {
    expect(escapeCsvCell("Phase 2 Study")).toBe('"Phase 2 Study"');
  });

  it("escapes embedded double quotes", () => {
    expect(escapeCsvCell('a "b" c')).toBe('"a ""b"" c"');
  });
});
