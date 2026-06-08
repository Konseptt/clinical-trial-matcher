import { extractPatientProfile } from "@/lib/extract";
import { queryAllRegistries } from "@/lib/registries";
import { scoreAndRankTrials } from "@/lib/scoring";
import type { MatchResponse } from "@/lib/types";

export async function runMatchPipeline(notes: string): Promise<MatchResponse> {
  const profile = extractPatientProfile(notes);
  const { trials, registryResults, queryPlans } =
    await queryAllRegistries(profile);
  const ranked = scoreAndRankTrials(trials, profile);

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
