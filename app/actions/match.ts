"use server";

import { runMatchPipeline, runMatchPipelineByProfile } from "@/lib/match";
import { applyTrialFilters } from "@/lib/registries/filters";
import type { RegistryTrial } from "@/lib/registries/types";
import { generateSimplifiedTrialGuide } from "@/lib/simplify-trial";
import { isNvidiaConfigured } from "@/lib/nvidia";
import { rankMatchedTrials, scoreAllRegistryTrials } from "@/lib/scoring";
import type {
  AppMode,
  MatchResponse,
  MatchedTrial,
  PatientProfile,
  SimplifiedTrialGuide,
} from "@/lib/types";

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

export async function getResultsAction(
  notes: string,
  mode: AppMode = "doctor"
): Promise<MatchResponse> {
  const trimmedNotes = String(notes ?? "").trim();
  const minLength = mode === "patient" ? 15 : 20;

  if (!trimmedNotes || trimmedNotes.length < minLength) {
    throw new Error(
      mode === "patient"
        ? "Please provide a clinical summary of at least 15 characters."
        : "Please provide clinical notes of at least 20 characters."
    );
  }

  if (trimmedNotes.length > 10000) {
    throw new Error("Input exceeds the 10,000 character limit. Please shorten the entry and resubmit.");
  }

  try {
    return await runMatchPipeline(trimmedNotes, mode);
  } catch (error) {
    if (
      mode === "patient" &&
      error instanceof Error &&
      error.message === "PATIENT_MODE_AI_UNAVAILABLE"
    ) {
      throw new Error(
        "Patient mode requires NVIDIA_API_KEY on the server. Use Clinician mode without it."
      );
    }

    console.error("Clinical trial match pipeline failure:", error);
    throw new Error("The trial search could not be completed at this time.");
  }
}

export async function getResultsByProfileAction(profile: PatientProfile): Promise<MatchResponse> {
  try {
    return await runMatchPipelineByProfile(profile);
  } catch (error) {
    console.error("Clinical trial match by profile failure:", error);
    throw new Error("The trial search could not be completed at this time.");
  }
}

export async function integrateWhoTrialsAction(
  whoTrials: RegistryTrial[],
  profile: PatientProfile,
  existing: MatchResponse
): Promise<MatchResponse> {
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
}

export async function getSimplifiedSummaryAction(input: {
  trialTitle: string;
  trialSummary: string;
  trialPhase: string;
  trialStatus: string;
  matchScore: number;
  profile: PatientProfile;
}): Promise<{ guide: SimplifiedTrialGuide } | { error: string }> {
  const trialTitle = String(input.trialTitle ?? "").trim().slice(0, 500);
  const trialSummary = String(input.trialSummary ?? "").trim().slice(0, 4000);

  if (!trialTitle || !trialSummary) {
    return { error: "Required trial information is unavailable." };
  }

  if (!isNvidiaConfigured()) {
    return {
      error:
        "Patient-facing summaries are unavailable. Configure NVIDIA_API_KEY on the server.",
    };
  }

  try {
    const guide = await generateSimplifiedTrialGuide({
      trialTitle,
      trialSummary,
      trialPhase: String(input.trialPhase ?? "Not specified").slice(0, 80),
      trialStatus: String(input.trialStatus ?? "Unknown").slice(0, 80),
      matchScore: Math.min(100, Math.max(0, Number(input.matchScore) || 0)),
      profile: {
        primaryDiagnosis: input.profile.primaryDiagnosis,
        stage: input.profile.stage,
        age: input.profile.age,
        sex: input.profile.sex,
        biomarkers: input.profile.biomarkers.slice(0, 10),
        priorTreatments: input.profile.priorTreatments.slice(0, 8),
        location: input.profile.location,
      },
    });

    return { guide };
  } catch (error) {
    if (error instanceof Error && error.message === "PATIENT_MODE_AI_UNAVAILABLE") {
      return {
        error:
          "Patient-facing summaries are unavailable. Configure NVIDIA_API_KEY on the server.",
      };
    }
    return { error: "Unable to generate the patient summary at this time. Please try again." };
  }
}

