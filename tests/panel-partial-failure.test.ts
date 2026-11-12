import { describe, it, expect, vi } from "vitest";

// Molecular reviewer call fails; the other three return "likely-eligible".
vi.mock("@/lib/nvidia", () => ({
  isNvidiaConfigured: () => true,
  nvidiaChatCompletion: vi.fn(async ({ messages }: { messages: { content: string }[] }) => {
    const prompt = messages.map((m) => m.content).join(" ");
    if (/Molecular reviewer|biomarkers/i.test(messages[0].content)) throw new Error("429 rate limited");
    void prompt;
    return JSON.stringify({ verdict: "likely-eligible", confidence: 80, rationale: "ok", questions: [] });
  }),
}));

describe("panel with a failed reviewer call", () => {
  it("keeps the rule opinion for the failed axis instead of dropping it", async () => {
    const { runEligibilityPanel } = await import("@/lib/agents/eligibility-panel");
    const r = await runEligibilityPanel({
      trialTitle: "Study in ER-positive and HER2-positive advanced breast cancer",
      trialSummary: "",
      trialEligibility: "Inclusion Criteria: ER-positive and HER2-positive advanced breast cancer.",
      trialPhase: "Phase 2",
      trialStatus: "RECRUITING",
      profile: {
        primaryDiagnosis: "Breast Cancer",
        stage: "IV",
        age: 52,
        sex: "female",
        biomarkers: ["HER2 positive", "ER negative"],
        priorTreatments: [],
        location: null,
        hasMetastaticDisease: true,
      },
    });
    expect(r.reviewers).toHaveLength(4);
    expect(r.reviewers.find((x) => x.id === "molecular")?.verdict).toBe("likely-ineligible");
    expect(r.consensus.verdict).toBe("likely-ineligible");
  });
});
