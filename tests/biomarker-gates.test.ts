import { describe, it, expect } from "vitest";
import {
  biomarkerGatePenalty,
  evaluateBiomarkerGates,
  hasContradictoryBiomarkers,
} from "@/lib/scoring";
import type { PatientProfile } from "@/lib/types";

function profile(biomarkers: string[]): PatientProfile {
  return {
    age: 55,
    sex: "female",
    primaryDiagnosis: "breast cancer",
    stage: null,
    biomarkers,
    priorTreatments: [],
    location: null,
    hasMetastaticDisease: null,
    interests: [],
  };
}

const TNBC_TEXT = "Eligible: triple negative breast cancer.";

describe("evaluateBiomarkerGates criterion isolation", () => {
  it("does not let HER2 status satisfy the ER rule (substring collision)", () => {
    // "er" is a substring of "her2"; a HER2-negative patient with unknown ER
    // must NOT pass the ER-negative rule.
    const gates = evaluateBiomarkerGates(TNBC_TEXT, profile(["HER2 negative"]));
    const tnbc = gates[0];
    const er = tnbc.rules.find((r) => r.marker === "ER")!;
    const her2 = tnbc.rules.find((r) => r.marker === "HER2")!;
    expect(her2.status).toBe("matched");
    expect(er.status).toBe("mismatched");
    expect(tnbc.passed).toBe(false);
  });

  it("passes triple-negative gate only with explicit ER/PR/HER2 negative", () => {
    const gates = evaluateBiomarkerGates(
      TNBC_TEXT,
      profile(["HER2 negative", "ER negative", "PR negative"])
    );
    expect(gates[0].passed).toBe(true);
  });
});

describe("hasContradictoryBiomarkers ER/HER2 isolation", () => {
  it("does not penalize ER-positive patient for HER-2 trial text", () => {
    // "er-" lives inside "her-2"; must not be read as ER-negative.
    const p = profile(["ER positive"]);
    expect(hasContradictoryBiomarkers("study of her-2 directed therapy", p)).toBe(0);
  });

  it("does not penalize ER-negative patient for 'cancer positive' text", () => {
    // "er positive" lives inside "cancer positive".
    const p = profile(["ER negative"]);
    expect(hasContradictoryBiomarkers("pan-cancer positive cohort", p)).toBe(0);
  });

  it("still flags a genuine ER contradiction", () => {
    const p = profile(["ER positive"]);
    expect(hasContradictoryBiomarkers("enrolling ER-negative tumors only", p)).toBe(20);
  });
});

describe("biomarkerGatePenalty (no false-positive eligibility)", () => {
  it("penalizes a HER2-positive patient against a triple-negative gate", () => {
    const gates = evaluateBiomarkerGates(TNBC_TEXT, profile(["HER2 positive"]));
    expect(biomarkerGatePenalty(gates, profile(["HER2 positive"]))).toBeGreaterThan(0);
  });

  it("does NOT penalize when status is merely unknown (marker absent)", () => {
    // Patient only states ER status; HER2/PR unknown. Gate fails but there is no
    // explicit contradiction, so no penalty (don't demote possibly-eligible).
    const gates = evaluateBiomarkerGates(TNBC_TEXT, profile(["ER negative"]));
    expect(biomarkerGatePenalty(gates, profile(["ER negative"]))).toBe(0);
  });

  it("does not penalize a passing gate", () => {
    const bm = ["HER2 negative", "ER negative", "PR negative"];
    const gates = evaluateBiomarkerGates(TNBC_TEXT, profile(bm));
    expect(biomarkerGatePenalty(gates, profile(bm))).toBe(0);
  });
});
