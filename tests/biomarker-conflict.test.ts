import { describe, it, expect } from "vitest";
import {
  BIOMARKER_CONFLICT_SCORE_CAP,
  evaluateCriteria,
  scoreAllRegistryTrials,
} from "@/lib/scoring";
import { generateDeterministicEligibilityPanel } from "@/lib/agents/eligibility-panel";
import { forecastTrialEligibility } from "@/lib/eligibility-forecast";
import type { RegistryTrial } from "@/lib/registries/types";
import type { PatientProfile } from "@/lib/types";

// Live demo case (NCT07014410): ER+/HER2+ trial shown to an ER-negative patient.
// The card said "Not a match" yet scored 100, listed every criterion "Met",
// and the panel said "Likely eligible" because "er" matched inside "cancer".
const profile: PatientProfile = {
  age: 52,
  sex: "female",
  primaryDiagnosis: "Breast Cancer",
  subtype: "HER2-Positive Breast Cancer",
  stage: "IV",
  biomarkers: ["HER2 positive", "ER negative", "PR negative"],
  priorTreatments: ["Trastuzumab"],
  location: null, // avoid network geocoding
  hasMetastaticDisease: true,
  interests: ["HER2-targeted therapy"],
};

const trial: RegistryTrial = {
  registry: "ClinicalTrials.gov",
  trialId: "NCT07014410",
  title:
    "Pyrotinib Combined With Dalpiciclib Combined With Letrozole in ER-positive and HER2-positive Advanced Breast Cancer",
  phase: "Phase 2",
  summary:
    "A multicenter Phase II study of pyrotinib plus dalpiciclib plus letrozole in ER-positive and HER2-positive advanced breast cancer.",
  status: "RECRUITING",
  locations: [{ facility: "Zhejiang Cancer Hospital", city: "Hangzhou", state: "Zhejiang", country: "China" }],
  eligibilityText:
    "Inclusion Criteria: Histologically confirmed ER-positive and HER2-positive advanced breast cancer. Prior trastuzumab allowed.",
  url: "https://clinicaltrials.gov/study/NCT07014410",
};

describe("biomarker conflict is consistent across score, criteria, forecast, panel", () => {
  it("caps score, flags criterion, and forecast + panel agree on ineligible", async () => {
    const [scored] = await scoreAllRegistryTrials([trial], profile);

    expect(scored.matchScore).toBeLessThanOrEqual(BIOMARKER_CONFLICT_SCORE_CAP);
    const bio = scored.criteriaEvaluations?.find((c) => c.name === "Biomarker requirement");
    expect(bio?.status).toBe("not-met");

    expect(forecastTrialEligibility(scored, profile).status).toBe("likely-ineligible");

    const panel = generateDeterministicEligibilityPanel({
      trialTitle: trial.title,
      trialSummary: trial.summary,
      trialEligibility: trial.eligibilityText,
      trialPhase: trial.phase,
      trialStatus: trial.status,
      profile,
    });
    const molecular = panel.reviewers.find((r) => r.id === "molecular");
    expect(molecular?.verdict).toBe("likely-ineligible");
    expect(panel.consensus.verdict).toBe("likely-ineligible");
  });

  it("panel no longer matches 'er' inside other words", () => {
    const panel = generateDeterministicEligibilityPanel({
      trialTitle: "Advanced breast cancer study",
      trialSummary: "Open to all comers.",
      trialEligibility: "Adults with measurable disease.",
      trialPhase: "Phase 2",
      trialStatus: "RECRUITING",
      profile: { ...profile, biomarkers: ["ER negative"] },
    });
    expect(panel.reviewers.find((r) => r.id === "molecular")?.verdict).toBe("uncertain");
  });

  it("marks location not-met when every listed site is abroad", () => {
    const { criteriaEvaluations } = evaluateCriteria(trial, {
      ...profile,
      location: { city: "Boston", state: "MA", country: "United States" },
    });
    const loc = criteriaEvaluations.find((c) => c.category === "location");
    expect(loc?.status).toBe("not-met");
    expect(loc?.evidence).toMatch(/Hangzhou, China/);
  });

  it("no conflict → no cap, no biomarker criterion (ER-positive patient)", async () => {
    const [scored] = await scoreAllRegistryTrials([trial], {
      ...profile,
      biomarkers: ["HER2 positive", "ER positive"],
    });
    expect(scored.criteriaEvaluations?.some((c) => c.name === "Biomarker requirement")).toBe(false);
    expect(scored.matchScore).toBeGreaterThan(BIOMARKER_CONFLICT_SCORE_CAP);
  });
});
