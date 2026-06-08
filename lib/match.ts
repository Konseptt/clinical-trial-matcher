import { extractPatientProfile } from "@/lib/extract";
import { extractPatientProfilePatientMode } from "@/lib/extract-ai";
import { queryAllRegistries } from "@/lib/registries";
import { scoreAndRankTrials } from "@/lib/scoring";
import type { AppMode, MatchResponse, PatientProfile } from "@/lib/types";

export async function runMatchPipelineByProfile(
  profile: PatientProfile,
  mode: AppMode = "doctor"
): Promise<MatchResponse> {
  const { trials, registryResults, queryPlans } =
    await queryAllRegistries(profile);
  const ranked = await scoreAndRankTrials(trials, profile);

  return {
    profile,
    trials: ranked,
    queryTerms: queryPlans.flatMap((plan) => plan.queryTerms).slice(0, 6),
    registrySummaries: registryResults.map((result) => ({
      registry: result.registry,
      queryTerms: result.queryTerms,
      trialCount: result.trials.length,
      error: result.error,
    })),
    mode,
  };
}

export async function runMatchPipeline(
  notes: string,
  mode: AppMode = "doctor"
): Promise<MatchResponse> {
  const profile =
    mode === "patient"
      ? await extractPatientProfilePatientMode(notes)
      : extractPatientProfile(notes);

  return runMatchPipelineByProfile(profile, mode);
}
