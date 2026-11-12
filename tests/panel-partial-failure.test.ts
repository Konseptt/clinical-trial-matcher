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
    expect(r.source).toBe("partial");
    expect(r.notice).toMatch(/Molecular reviewer used rule-based checks because the AI service is busy/);
  });

  it.each([
    [Object.assign(new Error("410 Gone"), { status: 410 }), /model is unavailable/],
    [Object.assign(new Error("429"), { status: 429 }), /busy/],
    [Object.assign(new Error("401"), { status: 401 }), /rejected the API key/],
    [new Error("Request timed out."), /took too long/],
    [new Error("weird"), /returned an error/],
  ])("describePanelFailure(%s)", async (err, re) => {
    const { describePanelFailure } = await import("@/lib/agents/eligibility-panel");
    expect(describePanelFailure(err)).toMatch(re);
  });
});

describe("panel when every reviewer fails", () => {
  it("is marked rules with a user-facing reason", async () => {
    vi.resetModules();
    vi.doMock("@/lib/nvidia", () => ({
      isNvidiaConfigured: () => true,
      nvidiaChatCompletion: async () => {
        throw Object.assign(new Error("410 status code"), { status: 410 });
      },
    }));
    const { runEligibilityPanel } = await import("@/lib/agents/eligibility-panel");
    const r = await runEligibilityPanel({
      trialTitle: "HER2-positive metastatic breast cancer study",
      trialSummary: "",
      trialEligibility: "Inclusion Criteria: metastatic HER2-positive breast cancer.",
      trialPhase: "Phase 2",
      trialStatus: "RECRUITING",
      profile: {
        primaryDiagnosis: "Breast Cancer",
        stage: "IV",
        age: 52,
        sex: "female",
        biomarkers: ["HER2 positive"],
        priorTreatments: [],
        location: null,
        hasMetastaticDisease: true,
      },
    });
    expect(r.source).toBe("rules");
    expect(r.reviewers).toHaveLength(4);
    expect(r.notice).toMatch(/AI review did not run because the configured AI model is unavailable/);
  });
});
