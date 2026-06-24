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

describe("extractPatientProfile receptor polarity (regression)", () => {
  it("reads hyphenated HER-2 positive without a phantom ER marker", () => {
    const p = extractPatientProfile("Patient has HER-2 positive breast cancer.");
    expect(p.biomarkers).toContain("HER2 positive");
    expect(p.biomarkers).not.toContain("ER negative");
    expect(p.biomarkers).not.toContain("ER positive");
  });

  it("does not invert ER-positive into ER negative (hyphenated polarity)", () => {
    const p = extractPatientProfile("ER-positive, PR-positive breast cancer.");
    expect(p.biomarkers).toContain("ER positive");
    expect(p.biomarkers).toContain("PR positive");
    expect(p.biomarkers).not.toContain("ER negative");
  });

  it("reads ER-/PR- shorthand as negative", () => {
    const p = extractPatientProfile("Breast cancer. Biomarkers: ER-, PR-.");
    expect(p.biomarkers).toContain("ER negative");
    expect(p.biomarkers).toContain("PR negative");
  });

  it("captures HER2-negative polarity (not a bare HER2)", () => {
    const p = extractPatientProfile("HER2 negative breast cancer.");
    expect(p.biomarkers).toContain("HER2 negative");
    expect(p.biomarkers).not.toContain("HER2");
  });

  it("expands triple-negative into the three negative receptors", () => {
    const p = extractPatientProfile("Triple negative breast cancer, stage II.");
    expect(p.biomarkers).toEqual(
      expect.arrayContaining(["ER negative", "PR negative", "HER2 negative"])
    );
  });
});

describe("extractPatientProfile driver-mutation false positives (regression)", () => {
  it("does not invent ALK from 'alkaline' or 'walk'", () => {
    const p = extractPatientProfile(
      "65yo with elevated alkaline phosphatase, able to walk unaided. Colon cancer."
    );
    expect(p.biomarkers).not.toContain("ALK");
  });

  it("still detects a genuine ALK rearrangement", () => {
    const p = extractPatientProfile("NSCLC with ALK rearrangement.");
    expect(p.biomarkers).toContain("ALK");
  });
});
