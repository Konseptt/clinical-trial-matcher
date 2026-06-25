import { describe, it, expect } from "vitest";
import { scoreAllRegistryTrials } from "@/lib/scoring";
import { forecastTrialEligibility } from "@/lib/eligibility-forecast";
import type { RegistryTrial } from "@/lib/registries/types";
import type { PatientProfile } from "@/lib/types";

const DAY_MS = 86_400_000;

// Dates are anchored relative to "now" so the test does not depend on the wall
// clock: scoring computes washout elapsed-days against the real Date.
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

describe("eligibility forecast wiring (scoring -> forecast)", () => {
  it("projects an upcoming date from a real washout requirement", async () => {
    const therapyEnd = isoDaysAgo(30); // ended recently
    const profile: PatientProfile = {
      age: 58,
      sex: "female",
      primaryDiagnosis: "breast cancer",
      stage: "Stage III",
      biomarkers: ["HER2 positive"],
      priorTreatments: ["Trastuzumab"],
      priorTreatmentsTimeline: [
        { name: "Trastuzumab", ongoing: false, endDate: therapyEnd },
      ],
      location: null,
      hasMetastaticDisease: false,
      interests: [],
    };

    const trial: RegistryTrial = {
      registry: "ClinicalTrials.gov",
      trialId: "NCT999",
      title: "HER2 positive breast cancer study",
      phase: "Phase 2",
      summary: "A study in HER2 positive breast cancer.",
      status: "Recruiting",
      locations: [],
      eligibilityText:
        "Patients must observe a washout period of 90 days after trastuzumab.",
      url: "https://clinicaltrials.gov/study/NCT999",
    };

    const [scored] = await scoreAllRegistryTrials([trial], profile);
    expect(scored.washoutChecks?.some((c) => c.status === "ineligible")).toBe(true);

    const forecast = forecastTrialEligibility(scored, profile);
    expect(forecast.status).toBe("upcoming");
    expect(forecast.earliestDate).toBe(addDaysIso(therapyEnd, 90));
  });
});
