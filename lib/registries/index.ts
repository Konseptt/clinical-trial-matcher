import { applyTrialFilters } from "./filters";
import { queryClinicalTrialsGov } from "./clinicaltrials-gov";
import { queryEuCtr } from "./eu-ctr";
import { queryIsrctn } from "./isrctn";
import { queryWhoIctrp } from "./who-ictrp";
import { buildRegistryQueryPlans } from "./query-builder";
import {
  buildRegistrySearchParams,
  type RegistryQueryResult,
  type RegistryTrial,
} from "./types";
import type { PatientProfile } from "@/lib/types";

export type { RegistryTrial, RegistryQueryResult, RegistrySource } from "./types";

function dedupeTrials(trials: RegistryTrial[]): RegistryTrial[] {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const result: RegistryTrial[] = [];

  for (const trial of trials) {
    const idKey = `${trial.registry}:${trial.trialId}`.toLowerCase();
    // Match on the full normalized title. A 60-char prefix collapses distinct
    // trials that share a boilerplate opening ("A Phase 3 Study of ...").
    const titleKey = trial.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenIds.has(idKey) || seenTitles.has(titleKey)) continue;
    seenIds.add(idKey);
    seenTitles.add(titleKey);
    result.push(trial);
  }

  return result;
}

export async function queryAllRegistries(profile: PatientProfile): Promise<{
  trials: RegistryTrial[];
  registryResults: RegistryQueryResult[];
  queryPlans: ReturnType<typeof buildRegistryQueryPlans>;
}> {
  const params = buildRegistrySearchParams(profile);
  const queryPlans = buildRegistryQueryPlans(params);

  const settled = await Promise.allSettled([
    queryClinicalTrialsGov(params),
    queryEuCtr(params),
    queryWhoIctrp(params),
    queryIsrctn(params),
  ]);

  const registryResults: RegistryQueryResult[] = settled.map((result, index) => {
    const registries = [
      "ClinicalTrials.gov",
      "EU-CTR",
      "WHO ICTRP",
      "ISRCTN",
    ] as const;

    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      registry: registries[index],
      queryTerms: params.terms,
      trials: [],
      error:
        result.reason instanceof Error
          ? result.reason.message
          : "Registry query failed",
    };
  });

  const merged = registryResults.flatMap((result) => result.trials);
  const filtered = applyTrialFilters(dedupeTrials(merged), {
    location: params.location,
    prioritizePhaseTwoPlus: true,
  });

  return {
    trials: filtered,
    registryResults,
    queryPlans,
  };
}
