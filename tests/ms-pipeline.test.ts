import { describe, it, expect } from "vitest";
import { extractPatientProfile } from "@/lib/extract";
import { normalizeCondition } from "@/lib/normalization";
import { buildRegistrySearchParams } from "@/lib/registries/types";
import { evaluateCriteria } from "@/lib/scoring";
import type { RegistryTrial } from "@/lib/registries/types";

describe("Multiple Sclerosis Clinical Trial Pipeline Test", () => {
  const MS_PROMPT =
    "I was diagnosed with relapsing-remitting multiple sclerosis approximately four years ago after developing intermittent numbness and weakness in my right leg, followed by an episode of optic neuritis. MRI showed multiple demyelinating lesions in the brain and cervical spinal cord. I initially received interferon beta-1a but discontinued it after persistent flu-like adverse effects and switched to dimethyl fumarate, which I have taken for the past two years with generally good adherence. Despite treatment, I experienced two confirmed relapses during the last 18 months, with residual mild lower-extremity weakness and fatigue. My most recent MRI showed several new T2 lesions but no enhancing lesions. I have never received an infusion-based disease-modifying therapy, stem-cell treatment, or investigational therapy. I am interested in clinical trials evaluating new disease-modifying treatments for multiple sclerosis and live in Columbus, Ohio.";

  it("extracts comprehensive structured clinical profile from natural language narrative", () => {
    const profile = extractPatientProfile(MS_PROMPT);

    expect(profile.primaryDiagnosis).toBe("Multiple Sclerosis");
    expect(profile.subtype).toMatch(/Relapsing-Remitting/i);
    expect(profile.diseaseDuration).toMatch(/4 years/i);
    expect(profile.currentTreatment).toBe("Dimethyl fumarate");

    const prevNames = profile.previousTreatments?.map((t) => t.name);
    expect(prevNames).toContain("Interferon beta-1a");

    const prevDiscontinued = profile.previousTreatments?.find((t) => t.name === "Interferon beta-1a");
    expect(prevDiscontinued?.reasonDiscontinued).toMatch(/flu-like adverse effects|adverse/i);

    expect(profile.recentDiseaseActivity).toMatch(/2 confirmed relapses in the past 18 months|2.*relapses/i);
    expect(profile.mriFindings).toMatch(/new T2 lesions/i);

    expect(profile.priorAdvancedTherapies).toEqual({
      infusionDmt: false,
      stemCell: false,
      investigational: false,
    });

    expect(profile.location?.city).toMatch(/Columbus/i);
    expect(profile.location?.state).toMatch(/OH|Ohio/i);

    expect(profile.priorTreatments).toContain("Dimethyl fumarate");
    expect(profile.priorTreatments).toContain("Interferon beta-1a");
  });

  it("normalizes condition and generates clean search query without conversational raw text", () => {
    const profile = extractPatientProfile(MS_PROMPT);
    const normalized = normalizeCondition(profile.primaryDiagnosis);

    expect(normalized.canonicalName).toBe("Multiple Sclerosis");
    expect(normalized.synonyms).toContain("Multiple Sclerosis");
    expect(normalized.synonyms).toContain("MS");

    const searchParams = buildRegistrySearchParams(profile);
    expect(searchParams.condition).toBe("Multiple Sclerosis");
    expect(searchParams.terms).toContain("Multiple Sclerosis");
    expect(searchParams.terms).toContain("Relapsing-Remitting Multiple Sclerosis");

    // Ensure raw conversational sentences are never in search terms
    for (const term of searchParams.terms) {
      expect(term).not.toMatch(/approximately four years ago/i);
      expect(term).not.toMatch(/diagnosed with/i);
    }
  });

  it("evaluates criteria and explains match without false negatives for unknown criteria", () => {
    const profile = extractPatientProfile(MS_PROMPT);
    const mockTrial: RegistryTrial = {
      registry: "ClinicalTrials.gov",
      trialId: "NCT04567890",
      title: "A Phase 3 Study of Novel Oral Agent in Relapsing-Remitting Multiple Sclerosis",
      phase: "Phase 3",
      summary: "Evaluating disease-modifying treatment in active RRMS patients with recent relapses or T2 lesions.",
      status: "Recruiting",
      locations: [
        { facility: "Ohio State University Wexner Medical Center", city: "Columbus", state: "OH", country: "United States" },
      ],
      eligibilityText: "Inclusion Criteria:\n- Diagnosis of Relapsing-Remitting Multiple Sclerosis\n- At least 1 relapse in prior 12 months or active T2 lesion\n- Age 18 to 55 years\nExclusion Criteria:\n- Prior stem cell transplant\n- Prior alemtuzumab or cladribine",
      url: "https://clinicaltrials.gov/study/NCT04567890",
    };

    const { criteriaEvaluations, reasonsMatched, reasonsToConfirm } = evaluateCriteria(mockTrial, profile);

    const diagCrit = criteriaEvaluations.find((c) => c.category === "diagnosis");
    expect(diagCrit?.status).toBe("met");

    const subtypeCrit = criteriaEvaluations.find((c) => c.category === "subtype");
    expect(subtypeCrit?.status).toBe("met");

    const locCrit = criteriaEvaluations.find((c) => c.category === "location");
    expect(locCrit?.status).toBe("met");

    // Unknown items (such as unstated age) should be "unknown", never "not-met"
    const ageCrit = criteriaEvaluations.find((c) => c.category === "age");
    expect(ageCrit?.status).toBe("unknown");

    expect(reasonsMatched.some((r) => r.includes("Multiple Sclerosis"))).toBe(true);
    expect(reasonsMatched.some((r) => r.includes("Relapsing-Remitting"))).toBe(true);
    expect(reasonsToConfirm.length).toBeGreaterThan(0);
  });
});
