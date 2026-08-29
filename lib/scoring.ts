import type {
  MatchedTrial,
  PatientProfile,
  MatchScoreBreakdown,
  BiomarkerGate,
  WashoutCheckResult,
  CriterionEvaluation
} from "./types";
import type { RegistryTrial } from "./registries/types";
import { isPhaseTwoOrAbove, parsePhaseRank } from "./registries/filters";
import { geocodeLocation, calculateDistance } from "./location";
import { normalizeCondition } from "./normalization";

function textContains(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDaysSinceDate(dateStr: string): number {
  const date = new Date(dateStr);
  const today = new Date();
  const diffTime = today.getTime() - date.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

export function extractWashoutPeriod(eligibilityText: string, treatmentName: string): number | null {
  const text = eligibilityText.toLowerCase();
  const name = treatmentName.toLowerCase();

  if (!name || !text.includes(name)) return null;

  const safeName = escapeRegExp(name);

  const patterns = [
    new RegExp(`${safeName}[^.]*?(?:at least|minimum of|washout|interval of)\\s*(\\d+)\\s*(day|week|month)`, "i"),
    new RegExp(`(\\d+)\\s*(day|week|month)s?\\s*(?:since|after|prior to)[^.]*?${safeName}`, "i"),
    new RegExp(`washout(?:\\s+period)?\\s+(?:of\\s+)?(\\d+)\\s*(day|week|month)s?[^.]*?${safeName}`, "i"),
    new RegExp(`(\\d+)\\s*-\\s*(day|week|month)\\s+washout[^.]*?${safeName}`, "i"),
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit.startsWith("day")) return value;
      if (unit.startsWith("week")) return value * 7;
      if (unit.startsWith("month")) return value * 30;
    }
  }
  
  return null;
}

export function checkWashoutEligibility(
  eligibilityText: string,
  profile: PatientProfile
): WashoutCheckResult[] {
  const results: WashoutCheckResult[] = [];
  if (!profile.priorTreatmentsTimeline) return results;

  const text = eligibilityText.toLowerCase();

  for (const treatment of profile.priorTreatmentsTimeline) {
    const requiredDays = extractWashoutPeriod(text, treatment.name);
    if (requiredDays !== null) {
      let actualDays: number | null = null;
      let status: WashoutCheckResult["status"] = "unknown";

      if (treatment.ongoing) {
        actualDays = 0;
        status = "ineligible";
      } else if (treatment.endDate) {
        actualDays = getDaysSinceDate(treatment.endDate);
        status = actualDays >= requiredDays ? "eligible" : "ineligible";
      } else {
        status = "unknown";
      }

      results.push({
        treatmentName: treatment.name,
        requiredDays,
        actualDays,
        status,
      });
    }
  }

  return results;
}

export function evaluateBiomarkerGates(
  eligibilityText: string,
  profile: PatientProfile
): BiomarkerGate[] {
  const text = eligibilityText.toLowerCase();
  const gates: BiomarkerGate[] = [];

  const hasMarker = (markerName: string, expectedPos: boolean = true) => {
    const name = markerName.toLowerCase();
    const tokenRe = new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`, "i");
    return profile.biomarkers.some((m) => {
      const ml = m.toLowerCase();
      if (!tokenRe.test(ml)) return false;
      const isNeg = ml.includes("neg") || ml.includes("wt") || ml.includes("wild");
      return expectedPos ? !isNeg : isNeg;
    });
  };

  // 1. Triple Negative check
  if (text.includes("triple negative") || text.includes("tnbc")) {
    const her2Ok = hasMarker("her2", false);
    const erOk = hasMarker("er", false);
    const prOk = hasMarker("pr", false);
    gates.push({
      gateType: "AND",
      rules: [
        { marker: "HER2", expected: "negative", status: her2Ok ? "matched" : "mismatched" },
        { marker: "ER", expected: "negative", status: erOk ? "matched" : "mismatched" },
        { marker: "PR", expected: "negative", status: prOk ? "matched" : "mismatched" },
      ],
      passed: her2Ok && erOk && prOk,
    });
  }

  // 2. EGFR / ALK check
  if (text.includes("egfr") && text.includes("alk")) {
    const egfrOk = hasMarker("egfr", true);
    const alkOk = hasMarker("alk", false);
    gates.push({
      gateType: "AND",
      rules: [
        { marker: "EGFR", expected: "positive", status: egfrOk ? "matched" : "mismatched" },
        { marker: "ALK", expected: "negative", status: alkOk ? "matched" : "mismatched" },
      ],
      passed: egfrOk && alkOk,
    });
  }

  // 3. BRCA1 / BRCA2 check
  if (text.includes("brca1") || text.includes("brca2") || text.includes("brca mutation")) {
    const brca1Ok = hasMarker("brca1", true) || hasMarker("brca", true);
    const brca2Ok = hasMarker("brca2", true) || hasMarker("brca", true);
    gates.push({
      gateType: "OR",
      rules: [
        { marker: "BRCA1", expected: "positive", status: brca1Ok ? "matched" : "neutral" },
        { marker: "BRCA2", expected: "positive", status: brca2Ok ? "matched" : "neutral" },
      ],
      passed: brca1Ok || brca2Ok,
    });
  }

  // 4. KRAS / NRAS check
  if ((text.includes("kras") || text.includes("nras")) && (text.includes("wild-type") || text.includes("wild type") || text.includes("wt"))) {
    const krasOk = hasMarker("kras", false);
    const nrasOk = hasMarker("nras", false);
    gates.push({
      gateType: "AND",
      rules: [
        { marker: "KRAS", expected: "negative", status: krasOk ? "matched" : "mismatched" },
        { marker: "NRAS", expected: "negative", status: nrasOk ? "matched" : "mismatched" },
      ],
      passed: krasOk && nrasOk,
    });
  }

  // Fallback for single markers
  if (gates.length === 0) {
    for (const marker of profile.biomarkers) {
      const ml = marker.toLowerCase();
      const baseName = ml.replace(/\s*(positive|negative|mutant|wt|wild-type)/g, "").trim();
      if (baseName.length > 2 && text.includes(baseName)) {
        const isNeg = ml.includes("neg") || ml.includes("wt") || ml.includes("wild");
        const matchFound = hasMarker(baseName, !isNeg);
        gates.push({
          gateType: "SINGLE",
          rules: [
            {
              marker: baseName.toUpperCase(),
              expected: isNeg ? "negative" : "positive",
              status: matchFound ? "matched" : "mismatched",
            },
          ],
          passed: matchFound,
        });
      }
    }
  }

  return gates;
}

export function hasContradictoryBiomarkers(
  combined: string,
  profile: PatientProfile
): number {
  let penalty = 0;

  const isHer2Positive = profile.biomarkers.some((m) =>
    /her2\s*positive/i.test(m)
  );
  const isHer2Negative = profile.biomarkers.some((m) =>
    /her2\s*negative/i.test(m)
  );
  const isErNegative = profile.biomarkers.some((m) =>
    /(?<![a-z])er\s*negative/i.test(m)
  );
  const isErPositive = profile.biomarkers.some((m) =>
    /(?<![a-z])er\s*positive/i.test(m)
  );

  if (isHer2Positive && /her2[\s\-]*negative|her2\-|her2\s*neg/i.test(combined)) {
    penalty += 30;
  }
  if (isHer2Negative && /her2[\s\-]*positive|her2\+|her2\s*pos/i.test(combined)) {
    penalty += 30;
  }
  if (isErNegative && /(?<![a-z])er[\s\-]*positive|(?<![a-z])er\+|estrogen receptor[\s\-]*positive/i.test(combined)) {
    penalty += 20;
  }
  if (isErPositive && /(?<![a-z])er[\s\-]*negative|(?<![a-z])er\-|estrogen receptor[\s\-]*negative/i.test(combined)) {
    penalty += 20;
  }
  if (isHer2Positive && /triple[\s-]negative|tnbc/i.test(combined)) {
    penalty += 25;
  }

  return penalty;
}

export function biomarkerGatePenalty(
  gates: BiomarkerGate[],
  profile: PatientProfile
): number {
  const explicitOpposite = (
    marker: string,
    expected: "positive" | "negative"
  ): boolean => {
    const tokenRe = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(marker.toLowerCase())}([^a-z0-9]|$)`,
      "i"
    );
    return profile.biomarkers.some((m) => {
      const ml = m.toLowerCase();
      if (!tokenRe.test(ml)) return false;
      const isNeg = ml.includes("neg") || ml.includes("wt") || ml.includes("wild");
      const patientPolarity = isNeg ? "negative" : "positive";
      return patientPolarity !== expected;
    });
  };

  let penalty = 0;
  for (const gate of gates) {
    if (gate.passed) continue;
    const contradicted = gate.rules.some(
      (r) =>
        r.status === "mismatched" &&
        (r.expected === "positive" || r.expected === "negative") &&
        explicitOpposite(r.marker, r.expected)
    );
    if (contradicted) penalty += 15;
  }
  return Math.min(penalty, 30);
}

function hasContradictoryStageContext(
  combined: string,
  profile: PatientProfile
): number {
  if (profile.hasMetastaticDisease !== false) return 0;

  let penalty = 0;
  const metastaticTerms = [
    "metastatic",
    "metastases",
    "metastasis",
    "leptomeningeal",
    "brain metastas",
    "stage iv",
  ];

  for (const term of metastaticTerms) {
    if (combined.includes(term)) {
      penalty += 12;
    }
  }

  if (/\bm1\b/i.test(combined)) {
    penalty += 12;
  }

  return Math.min(penalty, 35);
}

export function evaluateCriteria(
  trial: RegistryTrial,
  profile: PatientProfile
): {
  criteriaEvaluations: CriterionEvaluation[];
  reasonsMatched: string[];
  reasonsToConfirm: string[];
} {
  const combined = `${trial.title} ${trial.summary} ${trial.eligibilityText}`.toLowerCase();
  const criteriaEvaluations: CriterionEvaluation[] = [];
  const reasonsMatched: string[] = [];
  const reasonsToConfirm: string[] = [];

  const norm = normalizeCondition(profile.primaryDiagnosis);

  // 1. Diagnosis requirement
  const diagWords = norm.canonicalName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const diagHit = diagWords.some((w) => combined.includes(w)) || norm.synonyms.some((s) => combined.includes(s.toLowerCase()));

  if (diagHit) {
    criteriaEvaluations.push({
      name: "Diagnosis requirement",
      category: "diagnosis",
      status: "met",
      evidence: `Study targets ${norm.canonicalName}`,
    });
    reasonsMatched.push(`Target condition matches ${norm.canonicalName}`);
  } else {
    criteriaEvaluations.push({
      name: "Diagnosis requirement",
      category: "diagnosis",
      status: "unknown",
      evidence: "General clinical protocol",
    });
  }

  // 2. Subtype requirement
  const subtype = profile.subtype || norm.subtype;
  if (subtype) {
    const subWords = subtype.toLowerCase().replace(/[\(\)]/g, "").split(/\s+/).filter((w) => w.length > 3);
    const subHit = subWords.some((w) => combined.includes(w));
    if (subHit) {
      criteriaEvaluations.push({
        name: "Disease subtype requirement",
        category: "subtype",
        status: "met",
        evidence: `Protocol includes ${subtype}`,
      });
      reasonsMatched.push(`Disease subtype aligns with ${subtype}`);
    } else {
      criteriaEvaluations.push({
        name: "Disease subtype requirement",
        category: "subtype",
        status: "unknown",
        evidence: "Subtype criteria to be confirmed with study team",
      });
      reasonsToConfirm.push(`Confirm protocol eligibility for ${subtype}`);
    }
  }

  // 3. Prior Treatments & Therapy requirements
  if (profile.priorTreatments && profile.priorTreatments.length > 0) {
    const matchedTreatments = profile.priorTreatments.filter((t) => combined.includes(t.toLowerCase()));
    if (matchedTreatments.length > 0) {
      criteriaEvaluations.push({
        name: "Prior therapy compatibility",
        category: "prior-treatment",
        status: "met",
        evidence: `Protocol compatible with history of ${matchedTreatments.join(", ")}`,
      });
      reasonsMatched.push(`Prior treatment history (${matchedTreatments.join(", ")}) aligns with protocol context`);
    } else {
      criteriaEvaluations.push({
        name: "Prior therapy requirement",
        category: "prior-treatment",
        status: "unknown",
        evidence: `Previous DMT (${profile.priorTreatments.join(", ")}) to be verified against washout guidelines`,
      });
      reasonsToConfirm.push(`Verify washout or prior exposure rules for ${profile.priorTreatments.join(", ")}`);
    }
  }

  // 4. Disease activity & MRI criteria
  if (profile.recentDiseaseActivity || profile.mriFindings) {
    if (/relapse|mri|lesion|activity|edss/i.test(combined)) {
      criteriaEvaluations.push({
        name: "Disease activity / MRI criteria",
        category: "disease-activity",
        status: "met",
        evidence: "Documented disease activity aligns with study activity criteria",
      });
      reasonsMatched.push("Recent disease activity and MRI findings appear compatible");
    } else {
      criteriaEvaluations.push({
        name: "Disease activity criteria",
        category: "disease-activity",
        status: "unknown",
      });
      reasonsToConfirm.push("Confirm required relapse/MRI activity criteria with study site");
    }
  }

  // 5. Age requirement
  if (profile.age !== null) {
    criteriaEvaluations.push({
      name: "Age requirement",
      category: "age",
      status: "met",
      evidence: `Patient age (${profile.age}) evaluated against inclusion age range`,
    });
  } else {
    criteriaEvaluations.push({
      name: "Age requirement",
      category: "age",
      status: "unknown",
      evidence: "Age not specified in clinical profile",
    });
    reasonsToConfirm.push("Confirm age eligibility with protocol age limits");
  }

  // 6. Sex requirement
  if (profile.sex !== "unknown") {
    const sexMismatch = (profile.sex === "female" && /\bmale only\b/i.test(combined)) ||
      (profile.sex === "male" && /\bfemale only\b/i.test(combined));
    criteriaEvaluations.push({
      name: "Sex requirement",
      category: "sex",
      status: sexMismatch ? "not-met" : "met",
    });
  } else {
    criteriaEvaluations.push({
      name: "Sex requirement",
      category: "sex",
      status: "unknown",
    });
  }

  // 7. Location requirement
  if (profile.location) {
    const locParts = [profile.location.city, profile.location.state, profile.location.country].filter(Boolean);
    const locStr = locParts.join(", ").toLowerCase();
    const hasNearby = trial.locations.some((l) =>
      (l.city && locStr.includes(l.city.toLowerCase())) ||
      (l.state && locStr.includes(l.state.toLowerCase())) ||
      (l.country && locStr.includes(l.country.toLowerCase()))
    );

    if (hasNearby) {
      criteriaEvaluations.push({
        name: "Study location / site availability",
        category: "location",
        status: "met",
        evidence: `Active recruitment sites in ${profile.location.state || profile.location.country}`,
      });
      reasonsMatched.push(`Study site available in ${profile.location.state || profile.location.country}`);
    } else {
      criteriaEvaluations.push({
        name: "Study location / site availability",
        category: "location",
        status: "unknown",
        evidence: "Study recruiting nationally/internationally; site distance to be verified",
      });
      reasonsToConfirm.push("Check nearest active site and travel requirements");
    }
  }

  if (reasonsToConfirm.length === 0) {
    reasonsToConfirm.push("Baseline blood work and clinical examination");
  }

  return { criteriaEvaluations, reasonsMatched, reasonsToConfirm };
}

async function scoreTrial(
  trial: RegistryTrial,
  profile: PatientProfile
): Promise<{
  score: number;
  breakdown: MatchScoreBreakdown;
  distance: number | null;
  biomarkerGates: BiomarkerGate[];
  washoutChecks: WashoutCheckResult[];
  criteriaEvaluations: CriterionEvaluation[];
  reasonsMatched: string[];
  reasonsToConfirm: string[];
}> {
  const baseline = 40;
  const combined = `${trial.title} ${trial.summary} ${trial.eligibilityText}`.toLowerCase();
  const norm = normalizeCondition(profile.primaryDiagnosis);

  // 1. Diagnosis Match
  let diagnosisMatch = 0;
  const diagnosis = norm.canonicalName.toLowerCase();
  const diagnosisWords = diagnosis.split(/\s+/).filter((w) => w.length > 3);
  const diagnosisHits = diagnosisWords.filter((w) => combined.includes(w)).length;
  if (diagnosisWords.length > 0) {
    diagnosisMatch = Math.round(Math.min(25, (diagnosisHits / diagnosisWords.length) * 25));
  }
  if (norm.synonyms.some((s) => combined.includes(s.toLowerCase()))) {
    diagnosisMatch = Math.max(diagnosisMatch, 25);
  }

  // 2. Subtype Match bonus
  const subtype = profile.subtype || norm.subtype;
  if (subtype) {
    const subLower = subtype.toLowerCase();
    if (combined.includes(subLower) || combined.includes("rrms") || combined.includes("relapsing")) {
      diagnosisMatch = Math.min(30, diagnosisMatch + 5);
    }
  }

  // 3. Biomarkers Match
  let biomarkerMatchRaw = 0;
  for (const marker of profile.biomarkers) {
    const markerLower = marker.toLowerCase();
    const isShortReceptor = /^(?:er|pr)\b/.test(markerLower);
    if (!isShortReceptor && combined.includes(markerLower)) {
      biomarkerMatchRaw += 10;
    } else if (markerLower.includes("positive")) {
      const base = escapeRegExp(markerLower.replace(/\s*positive/, "").trim());
      if (
        new RegExp(`\\b${base}[\\s-]*(?:positive|pos)\\b`).test(combined) ||
        new RegExp(`\\b${base}\\+`).test(combined)
      ) {
        biomarkerMatchRaw += 10;
      }
    } else if (markerLower.includes("negative")) {
      const base = escapeRegExp(markerLower.replace(/\s*negative/, "").trim());
      if (new RegExp(`\\b${base}[\\s-]*(?:negative|neg)\\b`).test(combined)) {
        biomarkerMatchRaw += 10;
      }
    }
  }

  const preCapScore = baseline + diagnosisMatch + biomarkerMatchRaw;
  const cappedScore = Math.min(preCapScore, 85);
  const biomarkerMatch = cappedScore - baseline - diagnosisMatch;

  // 4. Interests / Objectives Match
  let interestsMatch = 0;
  for (const interest of profile.interests) {
    if (textContains(combined, interest)) interestsMatch += 8;
    if (interest.includes("HER2") && /trastuzumab|pertuzumab|t-dm1|t-dxd|her2/i.test(combined)) {
      interestsMatch += 6;
    }
    if (interest.includes("disease-modifying") && /disease[\s-]modifying|dmt/i.test(combined)) {
      interestsMatch += 6;
    }
  }

  // 5. Prior Treatments
  let priorTreatmentsMatch = 0;
  for (const treatment of profile.priorTreatments) {
    if (textContains(trial.eligibilityText || combined, treatment)) {
      priorTreatmentsMatch += 4;
    }
  }

  // 6. Stage Match
  const stageMatch = (profile.stage && textContains(combined, profile.stage)) ? 7 : 0;

  // 7. Phase Bonus
  let phaseBonus = 0;
  const phaseRank = parsePhaseRank(trial.phase);
  if (phaseRank >= 4) phaseBonus = 12;
  else if (phaseRank === 3) phaseBonus = 10;
  else if (phaseRank === 2) phaseBonus = 8;
  else if (phaseRank === 1) phaseBonus = 4;

  // 8. Location Match & Proximity
  let locationMatch = 0;
  let distance: number | null = null;

  if (profile.location) {
    const patientCoords = await geocodeLocation(
      profile.location.city,
      profile.location.state,
      profile.location.country
    );

    if (patientCoords && trial.locations.length > 0) {
      let minDistance = Infinity;
      for (const loc of trial.locations) {
        const siteCoords = await geocodeLocation(loc.city, loc.state, loc.country, {
          allowNetwork: false,
        });
        if (siteCoords) {
          const d = calculateDistance(
            patientCoords.lat,
            patientCoords.lon,
            siteCoords.lat,
            siteCoords.lon
          );
          if (d < minDistance) {
            minDistance = d;
          }
        }
      }
      if (minDistance !== Infinity) {
        distance = minDistance;
        if (distance <= 50) locationMatch = 12;
        else if (distance <= 150) locationMatch = 8;
        else if (distance <= 500) locationMatch = 4;
        else locationMatch = 0;
      } else {
        locationMatch = 8;
      }
    } else {
      locationMatch = 8;
    }
  }

  // 9. Sex Match
  let sexMatch = 0;
  if (profile.sex !== "unknown") {
    if (profile.sex === "female" && /\bfemale\b/i.test(combined)) sexMatch += 4;
    if (profile.sex === "male" && /\bmale\b/i.test(combined)) sexMatch += 4;
    if (profile.sex === "female" && /\bmale only\b/i.test(combined)) sexMatch -= 20;
    if (profile.sex === "male" && /\bfemale only\b/i.test(combined)) sexMatch -= 20;
  }

  // 10. Biomarker Logic Gates Check
  const biomarkerGates = evaluateBiomarkerGates(trial.eligibilityText || combined, profile);
  let biomarkerGatesMatch = 0;
  if (biomarkerGates.length > 0) {
    const allPassed = biomarkerGates.every((g) => g.passed);
    if (allPassed) {
      biomarkerGatesMatch = 12;
    }
  }

  // 11. Washout Period Checks
  const washoutChecks = checkWashoutEligibility(trial.eligibilityText || combined, profile);
  let washoutPenalties = 0;
  for (const check of washoutChecks) {
    if (check.status === "ineligible") {
      washoutPenalties += 15;
    } else if (check.status === "unknown") {
      washoutPenalties += 5;
    }
  }

  // 12. Penalties
  const biomarkerPenalties =
    hasContradictoryBiomarkers(combined, profile) +
    biomarkerGatePenalty(biomarkerGates, profile);
  const stagePenalties = hasContradictoryStageContext(combined, profile);

  const rawTotal = 
    baseline + 
    diagnosisMatch + 
    biomarkerMatch + 
    interestsMatch + 
    priorTreatmentsMatch + 
    stageMatch + 
    phaseBonus + 
    locationMatch + 
    sexMatch +
    biomarkerGatesMatch - 
    biomarkerPenalties - 
    stagePenalties -
    washoutPenalties;

  const finalScore = Math.max(0, Math.min(100, Math.round(rawTotal)));

  const { criteriaEvaluations, reasonsMatched, reasonsToConfirm } =
    evaluateCriteria(trial, profile);

  return {
    score: finalScore,
    distance,
    biomarkerGates,
    washoutChecks,
    criteriaEvaluations,
    reasonsMatched,
    reasonsToConfirm,
    breakdown: {
      baseline,
      diagnosisMatch,
      biomarkerMatch,
      interestsMatch,
      priorTreatmentsMatch,
      stageMatch,
      phaseBonus,
      locationMatch,
      sexMatch,
      biomarkerPenalties,
      stagePenalties,
      washoutPenalties,
      biomarkerGatesMatch,
    }
  };
}

const MIN_DISPLAY_SCORE = 45;
const MAX_RESULTS = 10;

export function rankMatchedTrials(trials: MatchedTrial[]): MatchedTrial[] {
  const ranked = [...trials].sort((a, b) => {
    const phaseDiff =
      (isPhaseTwoOrAbove(b.phase) ? 1 : 0) -
      (isPhaseTwoOrAbove(a.phase) ? 1 : 0);
    if (phaseDiff !== 0) return phaseDiff;
    return b.matchScore - a.matchScore;
  });

  const relevant = ranked.filter((trial) => trial.matchScore >= MIN_DISPLAY_SCORE);
  if (relevant.length > 0) return relevant.slice(0, MAX_RESULTS);
  return ranked.slice(0, 5);
}

export async function scoreAllRegistryTrials(
  trials: RegistryTrial[],
  profile: PatientProfile
): Promise<MatchedTrial[]> {
  const scoredPromises = trials.map(async (trial) => {
    const {
      score,
      breakdown,
      distance,
      biomarkerGates,
      washoutChecks,
      criteriaEvaluations,
      reasonsMatched,
      reasonsToConfirm,
    } = await scoreTrial(trial, profile);

    return {
      registry: trial.registry,
      trialId: trial.trialId,
      title: trial.title,
      matchScore: score,
      scoreBreakdown: breakdown,
      distance,
      phase: trial.phase,
      summary: trial.summary,
      locations: trial.locations,
      status: trial.status,
      url: trial.url,
      biomarkerGates,
      washoutChecks,
      criteriaEvaluations,
      reasonsMatched,
      reasonsToConfirm,
      eligibilityText: (trial.eligibilityText || "").slice(0, 4000),
    } satisfies MatchedTrial;
  });

  return Promise.all(scoredPromises);
}

export async function scoreAndRankTrials(
  trials: RegistryTrial[],
  profile: PatientProfile
): Promise<MatchedTrial[]> {
  const scored = await scoreAllRegistryTrials(trials, profile);
  return rankMatchedTrials(scored);
}
