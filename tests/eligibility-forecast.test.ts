import { describe, it, expect } from "vitest";
import {
  forecastTrialEligibility,
  summarizeForecasts,
} from "@/lib/eligibility-forecast";
import type {
  MatchScoreBreakdown,
  MatchedTrial,
  PatientProfile,
} from "@/lib/types";

const NOW = new Date("2026-06-24T12:00:00Z");

function breakdown(over: Partial<MatchScoreBreakdown> = {}): MatchScoreBreakdown {
  return {
    baseline: 40,
    diagnosisMatch: 0,
    biomarkerMatch: 0,
    interestsMatch: 0,
    priorTreatmentsMatch: 0,
    stageMatch: 0,
    phaseBonus: 0,
    locationMatch: 0,
    sexMatch: 0,
    biomarkerPenalties: 0,
    stagePenalties: 0,
    washoutPenalties: 0,
    biomarkerGatesMatch: 0,
    ...over,
  };
}

function mtrial(over: Partial<MatchedTrial> = {}): MatchedTrial {
  return {
    registry: "ClinicalTrials.gov",
    trialId: "NCT1",
    title: "T",
    matchScore: 70,
    scoreBreakdown: breakdown(),
    phase: "Phase 2",
    summary: "",
    locations: [],
    status: "Recruiting",
    url: "https://x",
    distance: null,
    biomarkerGates: [],
    washoutChecks: [],
    ...over,
  };
}

function prof(over: Partial<PatientProfile> = {}): PatientProfile {
  return {
    age: 55,
    sex: "female",
    primaryDiagnosis: "breast cancer",
    stage: null,
    biomarkers: [],
    priorTreatments: [],
    location: null,
    hasMetastaticDisease: false,
    interests: [],
    priorTreatmentsTimeline: [],
    ...over,
  };
}

describe("forecastTrialEligibility", () => {
  it("reports ready when recruiting with no blockers", () => {
    const f = forecastTrialEligibility(mtrial(), prof(), NOW);
    expect(f.status).toBe("ready");
    expect(f.earliestDate).toBeNull();
  });

  it("projects a future eligibility date from a washout window", () => {
    const trial = mtrial({
      washoutChecks: [
        { treatmentName: "Chemotherapy", requiredDays: 90, actualDays: 23, status: "ineligible" },
      ],
    });
    const patient = prof({
      priorTreatmentsTimeline: [
        { name: "Chemotherapy", ongoing: false, endDate: "2026-06-01" },
      ],
    });
    const f = forecastTrialEligibility(trial, patient, NOW);
    expect(f.status).toBe("upcoming");
    expect(f.earliestDate).toBe("2026-08-30");
    expect(f.blockers.join(" ")).toMatch(/washout/i);
  });

  it("flags an ongoing therapy as action-needed, not a date", () => {
    const trial = mtrial({
      washoutChecks: [
        { treatmentName: "Trastuzumab", requiredDays: 30, actualDays: 0, status: "ineligible" },
      ],
    });
    const patient = prof({
      priorTreatmentsTimeline: [{ name: "Trastuzumab", ongoing: true }],
    });
    const f = forecastTrialEligibility(trial, patient, NOW);
    expect(f.status).toBe("action-needed");
    expect(f.earliestDate).toBeNull();
    expect(f.blockers.join(" ")).toMatch(/ongoing/i);
  });

  it("marks a sex-restricted trial as likely ineligible", () => {
    const f = forecastTrialEligibility(
      mtrial({ scoreBreakdown: breakdown({ sexMatch: -20 }) }),
      prof({ sex: "male" }),
      NOW
    );
    expect(f.status).toBe("likely-ineligible");
  });

  it("marks a metastatic-only trial ineligible for non-metastatic patients", () => {
    const f = forecastTrialEligibility(
      mtrial({ scoreBreakdown: breakdown({ stagePenalties: 12 }) }),
      prof({ hasMetastaticDisease: false }),
      NOW
    );
    expect(f.status).toBe("likely-ineligible");
    expect(f.blockers.join(" ")).toMatch(/metastatic/i);
  });

  it("reports opens-later for not-yet-recruiting trials", () => {
    const f = forecastTrialEligibility(
      mtrial({ status: "Not yet recruiting" }),
      prof(),
      NOW
    );
    expect(f.status).toBe("opens-later");
  });

  it("requests a confirmation when washout dates are unknown", () => {
    const trial = mtrial({
      washoutChecks: [
        { treatmentName: "Radiation", requiredDays: 28, actualDays: null, status: "unknown" },
      ],
    });
    const f = forecastTrialEligibility(trial, prof(), NOW);
    expect(f.status).toBe("action-needed");
    expect(f.actions.join(" ")).toMatch(/Radiation/);
  });
});

describe("summarizeForecasts", () => {
  it("tallies statuses and surfaces the earliest upcoming date", () => {
    const totals = summarizeForecasts([
      { status: "ready", label: "", summary: "", earliestDate: null, blockers: [], actions: [] },
      { status: "upcoming", label: "", summary: "", earliestDate: "2026-10-01", blockers: [], actions: [] },
      { status: "upcoming", label: "", summary: "", earliestDate: "2026-08-30", blockers: [], actions: [] },
      { status: "likely-ineligible", label: "", summary: "", earliestDate: null, blockers: [], actions: [] },
    ]);
    expect(totals.ready).toBe(1);
    expect(totals.upcoming).toBe(2);
    expect(totals.likelyIneligible).toBe(1);
    expect(totals.nextDate).toBe("2026-08-30");
  });
});
