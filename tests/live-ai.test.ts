// Live NVIDIA check. Opt in: LIVE_AI=1 NVIDIA_API_KEY=... npx vitest run tests/live-ai.test.ts
// Each assertion fails if the AI path silently fell back to the rule engine.
import { describe, it, expect } from "vitest";
import { extractPatientProfilePatientMode } from "@/lib/extract-ai";
import { runEligibilityPanel } from "@/lib/agents/eligibility-panel";
import { generateSimplifiedTrialGuide } from "@/lib/simplify-trial";

const profile = {
  age: 52,
  sex: "female" as const,
  primaryDiagnosis: "Breast Cancer",
  stage: "IV",
  biomarkers: ["HER2 positive", "ER negative", "PR negative"],
  priorTreatments: ["Trastuzumab", "Trastuzumab deruxtecan"],
  location: { city: "Boston", state: "MA", country: "United States" },
  hasMetastaticDisease: true,
};

describe.skipIf(!process.env.LIVE_AI || !process.env.NVIDIA_API_KEY)("live NVIDIA AI paths", () => {
  it("patient-mode extraction reads a lay narrative", async () => {
    const p = await extractPatientProfilePatientMode(
      "I'm 52, a woman in Boston. My breast cancer spread to my liver. Doctors said HER2 positive but not ER positive. I finished Herceptin in September 2026, then Enhertu stopped working in late October."
    );
    expect(p.stage ?? "").not.toMatch(/^stage/i);
    expect(p.biomarkers).toEqual(expect.arrayContaining(["HER2 positive", "ER negative"]));
    expect(p.priorTreatments.every((t) => !t.includes("("))).toBe(true);
    expect(p.priorTreatmentsTimeline?.find((t) => t.name === "Trastuzumab")?.endDate).toBe("2026-09");
  }, 120_000);

  it("panel flags the ER conflict with model-written rationale", async () => {
    const r = await runEligibilityPanel({
      trialTitle: "Pyrotinib plus Dalpiciclib plus Letrozole in ER-positive and HER2-positive Advanced Breast Cancer",
      trialSummary: "Phase II study in ER-positive and HER2-positive advanced breast cancer.",
      trialEligibility: "Inclusion: ER-positive and HER2-positive advanced breast cancer. Exclusion: prior CDK4/6 inhibitor.",
      trialPhase: "Phase 2",
      trialStatus: "RECRUITING",
      profile,
    });
    expect(r.consensus.verdict).toBe("likely-ineligible");
    // The rule fallback uses fixed rationale strings; a model answer will not.
    expect(r.reviewers.find((x) => x.id === "molecular")?.rationale).not.toMatch(
      /^A biomarker requirement in the trial text conflicts/
    );
  }, 180_000);

  it("plain-language summary is model-written", async () => {
    const g = await generateSimplifiedTrialGuide({
      trialTitle: "Trastuzumab-rezetecan in HER2-Expressing Breast Cancer",
      trialSummary: "Phase 2 study of an antibody-drug conjugate after prior anti-HER2 therapy.",
      trialPhase: "Phase 2",
      trialStatus: "RECRUITING",
      matchScore: 80,
      profile,
    });
    expect(g.headline.length).toBeGreaterThan(20);
    expect(g.headline).not.toBe("Phase 2 study of an antibody-drug conjugate after prior anti-HER2 therapy.");
  }, 180_000);
});
