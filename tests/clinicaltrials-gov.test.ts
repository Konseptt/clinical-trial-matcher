import { describe, it, expect } from "vitest";
import { normalizePhase } from "@/lib/registries/clinicaltrials-gov";

describe("normalizePhase (ClinicalTrials.gov v2 enum)", () => {
  it("renders NA as Not Applicable, not 'Phase NA'", () => {
    expect(normalizePhase(["NA"])).toBe("Not Applicable");
  });
  it("renders EARLY_PHASE1 as Early Phase 1", () => {
    expect(normalizePhase(["EARLY_PHASE1"])).toBe("Early Phase 1");
  });
  it("renders PHASE1..PHASE4 as Phase N", () => {
    expect(normalizePhase(["PHASE1"])).toBe("Phase 1");
    expect(normalizePhase(["PHASE3"])).toBe("Phase 3");
  });
  it("joins combined phases", () => {
    expect(normalizePhase(["PHASE1", "PHASE2"])).toBe("Phase 1, Phase 2");
  });
  it("falls back to Not specified when empty", () => {
    expect(normalizePhase([])).toBe("Not specified");
    expect(normalizePhase(undefined)).toBe("Not specified");
  });
});
