import { extractPatientProfileAI } from "@/lib/extract";
import { queryAllRegistries } from "@/lib/registries";
import { scoreAndRankTrials } from "@/lib/scoring";
import type { MatchResponse, PatientProfile } from "@/lib/types";

export async function runMatchPipelineByProfile(profile: PatientProfile): Promise<MatchResponse> {
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
  };
}

export async function runMatchPipeline(notes: string): Promise<MatchResponse> {
  const profile = await extractPatientProfileAI(notes);
  return runMatchPipelineByProfile(profile);
}
