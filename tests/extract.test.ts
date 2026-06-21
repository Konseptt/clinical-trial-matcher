import { describe, it, expect } from "vitest";
import { extractPatientProfile } from "@/lib/extract";

describe("extractPatientProfile biomarkers", () => {
  it("emits a single canonical PD-L1 marker (no PDL1/PD-L1 duplicate)", () => {
    const p = extractPatientProfile("NSCLC, PDL1 high, EGFR positive.");
    const pdl1 = p.biomarkers.filter((m) => m.replace("-", "").toUpperCase() === "PDL1");
    expect(pdl1).toEqual(["PD-L1"]);
  });

  it("matches PD-L1 written with hyphen too", () => {
    const p = extractPatientProfile("Tumor is PD-L1 positive.");
    expect(p.biomarkers).toContain("PD-L1");
  });
});
