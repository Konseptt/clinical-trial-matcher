import { describe, it, expect } from "vitest";
import { scoreAllRegistryTrials } from "@/lib/scoring";
import type { RegistryTrial } from "@/lib/registries/types";
import type { PatientProfile } from "@/lib/types";

function profile(over: Partial<PatientProfile> = {}): PatientProfile {
  return {
    age: 55,
    sex: "female",
    primaryDiagnosis: "breast cancer",
    stage: null,
    biomarkers: [],
    priorTreatments: [],
    location: null, // null avoids any network geocoding
    hasMetastaticDisease: null,
    interests: [],
    ...over,
  };
}

function trial(over: Partial<RegistryTrial> = {}): RegistryTrial {
  return {
    registry: "ClinicalTrials.gov",
    trialId: "NCT1",
    title: "Study",
    phase: "Phase 2",
    summary: "",
    status: "Recruiting",
    locations: [],
    eligibilityText: "",
    url: "https://x",
    ...over,
  };
}

describe("biomarker scoring er/pr boundary (regression)", () => {
  it("does not credit an ER-positive patient for 'cancer positive' text", async () => {
    const p = profile({ biomarkers: ["ER positive"] });
    const [scored] = await scoreAllRegistryTrials(
      [trial({ summary: "A pan-cancer positive cohort study." })],
      p
    );
    expect(scored.scoreBreakdown.biomarkerMatch).toBe(0);
  });

  it("credits an ER-positive patient against an ER positive trial", async () => {
    const p = profile({ biomarkers: ["ER positive"] });
    const [scored] = await scoreAllRegistryTrials(
      [trial({ eligibilityText: "Eligible: ER positive tumors only." })],
      p
    );
    expect(scored.scoreBreakdown.biomarkerMatch).toBeGreaterThan(0);
  });

  it("still credits non-receptor markers via substring match", async () => {
    const p = profile({
      primaryDiagnosis: "lung cancer",
      biomarkers: ["EGFR"],
    });
    const [scored] = await scoreAllRegistryTrials(
      [trial({ eligibilityText: "EGFR mutation required." })],
      p
    );
    expect(scored.scoreBreakdown.biomarkerMatch).toBeGreaterThan(0);
  });
});
