"use server";

import { auth } from "@/auth";
import { consumeAiQuota } from "@/lib/ai-quota";
import { runMatchPipeline, runMatchPipelineByProfile } from "@/lib/match";
import { applyTrialFilters } from "@/lib/registries/filters";
import type { RegistryTrial } from "@/lib/registries/types";
import { generateSimplifiedTrialGuide } from "@/lib/simplify-trial";
import { rankMatchedTrials, scoreAllRegistryTrials } from "@/lib/scoring";
import {
  runEligibilityPanel,
  type EligibilityPanelResult,
} from "@/lib/agents/eligibility-panel";
import type {
  AppMode,
  MatchResponse,
  MatchedTrial,
  PatientProfile,
  SimplifiedTrialGuide,
} from "@/lib/types";
import { boundedText, validatePatientProfile } from "@/lib/security";
import { canonicalTrialId } from "@/lib/registries";

function dedupeMatchedTrials(trials: MatchedTrial[]): MatchedTrial[] {
  const byKey = new Map<string, MatchedTrial>();

  for (const trial of trials) {
    const key = canonicalTrialId(trial.trialId);
    const existing = byKey.get(key);
    if (!existing || (trial.rankScore ?? trial.matchScore) > (existing.rankScore ?? existing.matchScore)) {
      byKey.set(key, trial);
    }
  }

  return Array.from(byKey.values());
}

const MAX_CLIENT_TRIALS = 50;

function sanitizeClientTrial(t: unknown): RegistryTrial | null {
  if (!t || typeof t !== "object") return null;
  const r = t as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");
  const trialId = str(r.trialId, 80);
  const title = str(r.title, 500);
  if (!trialId || !title) return null;
  const locations = Array.isArray(r.locations) ? r.locations.slice(0, 30) : [];
  return {
    registry: "WHO ICTRP",
    trialId,
    title,
    phase: str(r.phase, 80),
    summary: str(r.summary, 4000),
    status: str(r.status, 80),
    eligibilityText: str(r.eligibilityText, 6000),
    url: str(r.url, 500),
    locations: locations.map((l) => {
      const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      return { facility: str(o.facility, 200), city: str(o.city, 120), state: str(o.state, 120), country: str(o.country, 120) };
    }),
  };
}

export type MatchActionResult =
  | { success: true; data: MatchResponse }
  | { success: false; error: string };

export async function getResultsAction(
  notes: string,
  mode: AppMode = "doctor"
): Promise<MatchActionResult> {
  const trimmedNotes = String(notes ?? "").trim();
  if (!trimmedNotes) {
    return {
      success: false,
      error:
        mode === "patient"
          ? "Please enter a clinical summary before searching."
          : "Please enter clinical notes before searching.",
    };
  }

  if (trimmedNotes.length > 10000) {
    return {
      success: false,
      error: "Input exceeds the 10,000 character limit. Please shorten the entry and resubmit.",
    };
  }

  try {
    let allowAi = false;
    if (mode === "patient") {
      const userId = (await auth())?.user?.id;
      // Quota/DB failure must not fail the search: fall back to rule extraction.
      allowAi = userId ? await consumeAiQuota(userId).catch(() => false) : false;
    }
    const data = await runMatchPipeline(trimmedNotes, mode, allowAi);
    return { success: true, data };
  } catch (error) {
    console.error("Clinical trial match pipeline failure:", error);
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "The trial search could not be completed at this time.",
    };
  }
}

export async function getResultsByProfileAction(
  profile: PatientProfile
): Promise<MatchActionResult> {
  const safeProfile = validatePatientProfile(profile);
  if (!safeProfile) {
    return { success: false, error: "The clinical profile is invalid or too large." };
  }

  try {
    const data = await runMatchPipelineByProfile(safeProfile);
    return { success: true, data };
  } catch (error) {
    console.error("Clinical trial match by profile failure:", error);
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "The trial search could not be completed at this time.",
    };
  }
}

export async function integrateWhoTrialsAction(
  whoTrials: RegistryTrial[],
  profile: PatientProfile,
  existing: MatchResponse
): Promise<MatchResponse> {
  // Anonymous, client-supplied input: validate like every other entry point.
  const safeProfile = validatePatientProfile(profile);
  if (!safeProfile || !Array.isArray(whoTrials)) return existing;
  profile = safeProfile;
  whoTrials = whoTrials.slice(0, MAX_CLIENT_TRIALS).flatMap((t) => {
    const trial = sanitizeClientTrial(t);
    return trial ? [trial] : [];
  });

  try {
    const filtered = applyTrialFilters(whoTrials, {
      location: profile.location,
      prioritizePhaseTwoPlus: true,
    });

    const scoredWho = await scoreAllRegistryTrials(filtered, profile);
    const mergedTrials = rankMatchedTrials(
      dedupeMatchedTrials([...existing.trials, ...scoredWho])
    );

    const registrySummaries = existing.registrySummaries.map((summary) =>
      summary.registry === "WHO ICTRP"
        ? {
            ...summary,
            trialCount: filtered.length,
            error: undefined,
          }
        : summary
    );

    return {
      ...existing,
      trials: mergedTrials,
      registrySummaries,
    };
  } catch (error) {
    console.error("integrateWhoTrialsAction failure:", error);
    return existing;
  }
}

export async function getSimplifiedSummaryAction(input: {
  trialTitle: string;
  trialSummary: string;
  trialPhase: string;
  trialStatus: string;
  matchScore: number;
  profile: PatientProfile;
}): Promise<{ guide: SimplifiedTrialGuide } | { error: string }> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Please sign in with Google to generate a patient summary." };
  }

  const rawInput = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const trialTitle = boundedText(rawInput.trialTitle, 500);
  const trialSummary = boundedText(rawInput.trialSummary, 4000);
  const profile = validatePatientProfile(rawInput.profile);

  if (!trialTitle || !trialSummary || !profile) {
    return { error: "Required trial information is unavailable." };
  }

  if (!(await consumeAiQuota(session.user.id))) {
    return { error: "Daily AI usage limit reached. Please try again tomorrow." };
  }

  try {
    const guide = await generateSimplifiedTrialGuide({
      trialTitle,
      trialSummary,
      trialPhase: boundedText(rawInput.trialPhase, 80) ?? "Not specified",
      trialStatus: boundedText(rawInput.trialStatus, 80) ?? "Unknown",
      matchScore: Math.min(100, Math.max(0, Number(rawInput.matchScore) || 0)),
      profile: {
        primaryDiagnosis: profile.primaryDiagnosis,
        stage: profile.stage,
        age: profile.age,
        sex: profile.sex,
        biomarkers: profile.biomarkers.slice(0, 10),
        priorTreatments: profile.priorTreatments.slice(0, 8),
        location: profile.location,
      },
    });

    return { guide };
  } catch (error) {
    console.error("getSimplifiedSummaryAction failure:", error);
    return { error: "Unable to generate the patient summary at this time. Please try again." };
  }
}

export async function runEligibilityPanelAction(input: {
  trialTitle: string;
  trialSummary: string;
  trialEligibility: string;
  trialPhase: string;
  trialStatus: string;
  profile: PatientProfile;
}): Promise<{ result: EligibilityPanelResult } | { error: string }> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Please sign in with Google to run the eligibility review panel." };
  }

  const rawInput = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const trialTitle = boundedText(rawInput.trialTitle, 500);
  const trialSummary = boundedText(rawInput.trialSummary, 4000) ?? "";
  const trialEligibility = boundedText(rawInput.trialEligibility, 6000) ?? "";
  const profile = validatePatientProfile(rawInput.profile);

  if (!trialTitle || !profile) {
    return { error: "Required trial information is unavailable." };
  }

  if (!(await consumeAiQuota(session.user.id))) {
    return { error: "Daily AI usage limit reached. Please try again tomorrow." };
  }

  try {
    const result = await runEligibilityPanel({
      trialTitle,
      trialSummary,
      trialEligibility,
      trialPhase: boundedText(rawInput.trialPhase, 80) ?? "Not specified",
      trialStatus: boundedText(rawInput.trialStatus, 80) ?? "Unknown",
      profile: {
        primaryDiagnosis: profile.primaryDiagnosis,
        stage: profile.stage,
        age: profile.age,
        sex: profile.sex,
        biomarkers: profile.biomarkers.slice(0, 12),
        priorTreatments: profile.priorTreatments.slice(0, 10),
        location: profile.location,
        hasMetastaticDisease: profile.hasMetastaticDisease,
      },
    });
    return { result };
  } catch (error) {
    console.error("runEligibilityPanelAction failure:", error);
    return {
      error: "Unable to run the eligibility review panel at this time. Please try again.",
    };
  }
}
