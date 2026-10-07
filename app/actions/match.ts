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

function dedupeMatchedTrials(trials: MatchedTrial[]): MatchedTrial[] {
  const byKey = new Map<string, MatchedTrial>();

  for (const trial of trials) {
    const key = `${trial.registry}:${trial.trialId}`.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || trial.matchScore > existing.matchScore) {
      byKey.set(key, trial);
    }
  }

  return Array.from(byKey.values());
}

export type MatchActionResult =
  | { success: true; data: MatchResponse }
  | { success: false; error: string };

export async function getResultsAction(
  notes: string,
  mode: AppMode = "doctor"
): Promise<MatchActionResult> {
  const trimmedNotes = String(notes ?? "").trim();
  const minLength = mode === "patient" ? 15 : 20;

  if (!trimmedNotes || trimmedNotes.length < minLength) {
    return {
      success: false,
      error:
        mode === "patient"
          ? "Please add a few words about your diagnosis, treatment, or trial goals."
          : "Please provide clinical notes of at least 20 characters.",
    };
  }

  if (trimmedNotes.length > 10000) {
    return {
      success: false,
      error: "Input exceeds the 10,000 character limit. Please shorten the entry and resubmit.",
    };
  }

  try {
    const data = await runMatchPipeline(trimmedNotes, mode);
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
            trialCount: whoTrials.length,
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
