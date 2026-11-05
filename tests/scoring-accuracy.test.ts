import { describe, it, expect } from "vitest";
import { scoreAllRegistryTrials, rankMatchedTrials } from "@/lib/scoring";
import type { RegistryTrial } from "@/lib/registries/types";
import type { MatchedTrial, PatientProfile } from "@/lib/types";

const profile = (o: Partial<PatientProfile> = {}): PatientProfile => ({
  age: 55, sex: "female", primaryDiagnosis: "breast cancer", stage: null, biomarkers: [],
  priorTreatments: [], location: null, hasMetastaticDisease: null, interests: [], ...o,
});
const trial = (o: Partial<RegistryTrial> = {}): RegistryTrial => ({
  registry: "ClinicalTrials.gov", trialId: "NCT1", title: "Study", phase: "Phase 2", summary: "",
  status: "Recruiting", locations: [], eligibilityText: "", url: "https://x", ...o,
});
const score = async (p: PatientProfile, t: RegistryTrial) => (await scoreAllRegistryTrials([t], p))[0];

describe("scoring accuracy regressions", () => {
  it("HER2-positive patient is not penalised by 'HER2-positive' trial text", async () => {
    const s = await score(profile({ biomarkers: ["HER2 positive"] }),
      trial({ eligibilityText: "Inclusion: HER2-positive metastatic breast cancer." }));
    expect(s.scoreBreakdown.biomarkerPenalties).toBe(0);
  });
  it("ER-positive patient is not penalised by 'ER-positive' text", async () => {
    const s = await score(profile({ biomarkers: ["ER positive"] }),
      trial({ eligibilityText: "ER-positive, HER2-negative disease." }));
    expect(s.scoreBreakdown.biomarkerPenalties).toBe(0);
  });
  it("HER2-positive patient IS penalised by 'HER2- disease' shorthand", async () => {
    const s = await score(profile({ biomarkers: ["HER2 positive"] }),
      trial({ eligibilityText: "Inclusion: HR+/HER2- disease." }));
    expect(s.scoreBreakdown.biomarkerPenalties).toBeGreaterThan(0);
  });
  it("MS synonym does not match 'symptoms' in an unrelated trial", async () => {
    const s = await score(profile({ primaryDiagnosis: "multiple sclerosis" }),
      trial({ title: "Migraine prevention", eligibilityText: "Patients with migraine symptoms." }));
    expect(s.scoreBreakdown.diagnosisMatch).toBe(0);
    expect(s.criteriaEvaluations!.find((c) => c.category === "diagnosis")?.status).toBe("unknown");
  });
  it("stage IV does not match 'positive'", async () => {
    const s = await score(profile({ stage: "IV" }), trial({ eligibilityText: "HER2 positive disease." }));
    expect(s.scoreBreakdown.stageMatch).toBe(0);
  });
  it("'weight' does not trigger the KRAS/NRAS wild-type gate", async () => {
    const s = await score(profile({ primaryDiagnosis: "colorectal cancer", biomarkers: ["KRAS"] }),
      trial({ eligibilityText: "KRAS testing documented. Body weight > 40 kg." }));
    // Only the KRAS+NRAS wild-type AND-gate is wrong here; a single-marker gate is fine.
    expect(s.biomarkerGates!.find((g) => g.gateType === "AND" && g.rules.some((r) => r.marker === "NRAS"))).toBeUndefined();
  });
  it("non-metastatic patient not penalised by 'no known brain metastases' exclusion", async () => {
    const s = await score(profile({ hasMetastaticDisease: false }),
      trial({ eligibilityText: "Inclusion Criteria:\n- Early breast cancer\nExclusion Criteria:\n- Known brain metastases\n- Metastatic disease" }));
    expect(s.scoreBreakdown.stagePenalties).toBe(0);
  });
  it("non-metastatic patient IS penalised when inclusion requires metastatic disease", async () => {
    const s = await score(profile({ hasMetastaticDisease: false }),
      trial({ eligibilityText: "Inclusion Criteria:\n- Metastatic breast cancer\nExclusion Criteria:\n- Pregnancy" }));
    expect(s.scoreBreakdown.stagePenalties).toBeGreaterThan(0);
  });
  it("prior treatment named only in exclusion criteria earns no compatibility credit", async () => {
    const s = await score(profile({ priorTreatments: ["Palbociclib"] }),
      trial({ eligibilityText: "Inclusion Criteria:\n- Adults\nExclusion Criteria:\n- Prior palbociclib" }));
    expect(s.scoreBreakdown.priorTreatmentsMatch).toBe(0);
    expect(s.criteriaEvaluations!.find((c) => c.category === "prior-treatment")?.status).not.toBe("met");
  });
  it("uses structured registry sex and age limits as hard gates", async () => {
    const male = await score(profile({ sex: "male" }), trial({ sex: "female" }));
    expect(male.criteriaEvaluations!.find((c) => c.category === "sex")?.status).toBe("not-met");
    expect(male.scoreBreakdown.sexMatch).toBeLessThan(0);
    const old = await score(profile({ age: 80 }), trial({ minAgeYears: 18, maxAgeYears: 70 }));
    expect(old.criteriaEvaluations!.find((c) => c.category === "age")?.status).toBe("not-met");
    const ok = await score(profile({ age: 55 }), trial({ minAgeYears: 18, maxAgeYears: 70 }));
    expect(ok.criteriaEvaluations!.find((c) => c.category === "age")?.status).toBe("met");
  });
  it("'Males only' (plural) excludes a female patient", async () => {
    const s = await score(profile(), trial({ eligibilityText: "Males only, aged 40-75." }));
    expect(s.criteriaEvaluations!.find((c) => c.category === "sex")?.status).toBe("not-met");
  });
  it("a high-scoring phase 1 trial is not buried under a weak phase 2 trial", async () => {
    const mk = (id: string, phase: string, s: number) => ({ trialId: id, registry: "ClinicalTrials.gov", phase, matchScore: s }) as MatchedTrial;
    const ranked = rankMatchedTrials([mk("weak", "Phase 2", 46), mk("strong", "Phase 1", 95)]);
    expect(ranked[0].trialId).toBe("strong");
  });
});

describe("forecast uses structured age gate", () => {
  it("out-of-range age is a hard blocker", async () => {
    const { forecastTrialEligibility: forecastEligibility } = await import("@/lib/eligibility-forecast");
    const [m] = await scoreAllRegistryTrials([trial({ minAgeYears: 18, maxAgeYears: 65 })], profile({ age: 80 }));
    expect(forecastEligibility(m, profile({ age: 80 })).blockers.join(" ")).toMatch(/age/i);
  });
});
