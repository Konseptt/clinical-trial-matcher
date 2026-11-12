import { describe, it, expect } from "vitest";
import { extractPatientProfile } from "@/lib/extract";
import { evaluateCriteria, isPreSurgeryTrialAfterSurgery, scoreAllRegistryTrials } from "@/lib/scoring";
import { forecastTrialEligibility } from "@/lib/eligibility-forecast";
import { SAMPLE_NOTES } from "@/lib/sample-notes";
import type { RegistryTrial } from "@/lib/registries/types";

const DEMO =
  "Patient is a 58-year-old female with Stage III HER2-positive breast cancer. Lives in Boston, MA, United States. " +
  "Biomarkers: HER2+, ER-, PR-. Prior mastectomy and adjuvant chemotherapy with carboplatin and paclitaxel. " +
  "Trastuzumab last dose October 15, 2026. Radiation therapy completed November 1, 2026. " +
  "No evidence of metastatic disease on recent PET scan. Interested in HER2-targeted therapy trials.";

const trial = (over: Partial<RegistryTrial>): RegistryTrial => ({
  registry: "ClinicalTrials.gov",
  trialId: "NCT0",
  title: "HER2-positive breast cancer study",
  phase: "Phase 2",
  summary: "",
  status: "RECRUITING",
  locations: [],
  eligibilityText: "",
  url: "https://x",
  ...over,
});
const site = (city: string, state: string, country: string) => ({ facility: "", city, state, country });
const locationEval = (t: RegistryTrial) => {
  const r = evaluateCriteria(t, extractPatientProfile(DEMO));
  return { ev: r.criteriaEvaluations.find((c) => c.category === "location")!, matched: r.reasonsMatched };
};

describe("extraction: wishes, plans and relative dates", () => {
  it("does not count an interest as a prior treatment; reads both end dates", () => {
    const p = extractPatientProfile(DEMO);
    expect(p.priorTreatments).not.toContain("Targeted therapy");
    const end = Object.fromEntries((p.priorTreatmentsTimeline ?? []).map((t) => [t.name, t.endDate]));
    expect(end.Trastuzumab).toBe("2026-10-15");
    expect(end.Radiation).toBe("2026-11-01");
  });

  it("skips planned surgery but keeps history mentioned before an interest", () => {
    expect(extractPatientProfile("Breast cancer. Scheduled for mastectomy next month.").priorTreatments).not.toContain("Surgery");
    expect(extractPatientProfile("Breast cancer. Received trastuzumab, now interested in trials.").priorTreatments).toContain("Trastuzumab");
  });

  it("dates the sample case's 'radiation therapy 6 months ago' and no longer calls it disease duration", () => {
    const p = extractPatientProfile(SAMPLE_NOTES);
    expect(p.priorTreatmentsTimeline?.find((t) => t.name === "Radiation")?.endDate).toMatch(/^20\d{2}-\d{2}$/);
    expect(p.diseaseDuration).toBeNull();
  });
});

describe("location evidence uses whole-field matches", () => {
  it("New Jersey sites are national, not 'in MA'", () => {
    const { ev, matched } = locationEval(trial({ locations: [site("Newark", "New Jersey", "United States")] }));
    expect(ev.evidence).toContain("none listed in MA");
    expect(matched.join(" ")).not.toContain("in MA");
  });
  it("a Spanish site ('ES') does not match 'United States'", () => {
    expect(locationEval(trial({ locations: [site("", "", "ES")] })).ev.status).toBe("not-met");
  });
  it("a Massachusetts site is local", () => {
    expect(locationEval(trial({ locations: [site("Worcester", "Massachusetts", "United States")] })).ev.evidence).toBe(
      "Active recruitment sites in MA"
    );
  });
});

describe("ranking: diagnosis credit and temporary washouts", () => {
  const profile = () => ({ ...extractPatientProfile(DEMO), location: null });
  const score = async (t: RegistryTrial) => (await scoreAllRegistryTrials([t], profile()))[0];

  it("loose words and exclusion-only mentions get partial diagnosis credit", async () => {
    const prostate = await score(trial({ title: "Prostate cancer screening with short MRI", summary: "Men only; breast imaging not used." }));
    const abscess = await score(trial({
      title: "Vacuum drainage for breast abscess",
      eligibilityText: "Inclusion Criteria: breast abscess\n\nExclusion Criteria: concurrent breast cancer diagnosis",
    }));
    const real = await score(trial({ title: "HER2-positive breast cancer study" }));
    expect(prostate.scoreBreakdown.diagnosisMatch).toBeLessThanOrEqual(12);
    expect(abscess.scoreBreakdown.diagnosisMatch).toBeLessThanOrEqual(12);
    expect(real.scoreBreakdown.diagnosisMatch).toBeGreaterThanOrEqual(25);
  });

  it("a washout with a known end date costs less than an ongoing therapy", async () => {
    const t = trial({ eligibilityText: "Exclusion Criteria: radiation therapy within 28 days prior to enrollment." });
    const dated = await score(t);
    const ongoing = (await scoreAllRegistryTrials([t], {
      ...profile(),
      priorTreatmentsTimeline: [{ name: "Radiation", ongoing: true }],
    }))[0];
    expect(dated.washoutChecks?.find((w) => w.treatmentName === "Radiation")?.status).toBe("ineligible");
    expect(dated.scoreBreakdown.washoutPenalties).toBe(5);
    expect(ongoing.scoreBreakdown.washoutPenalties).toBe(15);
  });
});

describe("neoadjuvant trials after surgery", () => {
  const surgery = { priorTreatments: ["Surgery"] };
  it.each([
    ["Optimize Neoadjuvant Therapy in HER2-Positive Early-Stage Breast Cancer", true],
    ["Genomics guided targeted post-neoadjuvant therapy in early breast cancer", false],
    ["GP2 in subjects with residual disease after both Neoadjuvant and Postoperative Adjuvant therapy", false],
    ["Adjuvant T-DM1 in HER2-positive breast cancer", false],
  ])("%s → %s", (title, expected) => {
    expect(isPreSurgeryTrialAfterSurgery({ title, summary: "" }, surgery)).toBe(expected);
  });
  it("needs surgery in the profile", () => {
    expect(isPreSurgeryTrialAfterSurgery({ title: "Neoadjuvant HER2 therapy", summary: "" }, { priorTreatments: [] })).toBe(false);
  });

  it("forecast marks it likely ineligible and caps the score", async () => {
    const profile = { ...extractPatientProfile(DEMO), location: null };
    const [m] = await scoreAllRegistryTrials([trial({ title: "Neoadjuvant therapy in HER2-positive breast cancer" })], profile);
    expect(m.scoreBreakdown.preSurgeryConflict).toBe(true);
    expect(m.matchScore).toBeLessThanOrEqual(40);
    expect(forecastTrialEligibility(m, profile).status).toBe("likely-ineligible");
  });
});
