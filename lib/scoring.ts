import type { MatchedTrial, PatientProfile } from "./types";
import type { RegistryTrial } from "./registries/types";
import { isPhaseTwoOrAbove, matchesLocation, parsePhaseRank } from "./registries/filters";

function textContains(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

function scoreTrial(trial: RegistryTrial, profile: PatientProfile): number {
  let score = 40;
  const combined = `${trial.title} ${trial.summary} ${trial.eligibilityText}`.toLowerCase();

  const diagnosis = profile.primaryDiagnosis.toLowerCase();
  const diagnosisWords = diagnosis.split(/\s+/).filter((w) => w.length > 3);
  const diagnosisHits = diagnosisWords.filter((w) => combined.includes(w)).length;
  if (diagnosisWords.length > 0) {
    score += Math.min(25, (diagnosisHits / diagnosisWords.length) * 25);
  }

  for (const marker of profile.biomarkers) {
    if (textContains(combined, marker)) score += 8;
  }
  score = Math.min(score, 85);

  for (const treatment of profile.priorTreatments) {
    if (textContains(trial.eligibilityText || combined, treatment)) {
      if (
        combined.includes("prior") ||
        combined.includes("previous")
      ) {
        score += 3;
      }
    }
  }

  if (profile.stage && textContains(combined, profile.stage)) score += 7;

  const phaseRank = parsePhaseRank(trial.phase);
  if (phaseRank >= 4) score += 12;
  else if (phaseRank === 3) score += 10;
  else if (phaseRank === 2) score += 8;

  if (profile.location && matchesLocation(trial, profile.location)) {
    score += 10;
  }

  if (profile.sex !== "unknown") {
    const combinedSex = combined;
    if (combinedSex.includes(profile.sex)) score += 3;
    if (
      profile.sex === "female" &&
      combinedSex.includes("female") &&
      !combinedSex.includes("male only")
    ) {
      score += 4;
    }
    if (
      profile.sex === "male" &&
      combinedSex.includes("male") &&
      !combinedSex.includes("female only")
    ) {
      score += 4;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreAndRankTrials(
  trials: RegistryTrial[],
  profile: PatientProfile
): MatchedTrial[] {
  const scored = trials.map((trial) => ({
    registry: trial.registry,
    trialId: trial.trialId,
    title: trial.title,
    matchScore: scoreTrial(trial, profile),
    phase: trial.phase,
    summary: trial.summary,
    locations: trial.locations,
    status: trial.status,
    url: trial.url,
  } satisfies MatchedTrial));

  return scored.sort((a, b) => {
    const phaseDiff =
      (isPhaseTwoOrAbove(b.phase) ? 1 : 0) -
      (isPhaseTwoOrAbove(a.phase) ? 1 : 0);
    if (phaseDiff !== 0) return phaseDiff;
    return b.matchScore - a.matchScore;
  });
}
