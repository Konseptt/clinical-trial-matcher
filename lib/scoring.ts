import type {
  MatchedTrial,
  PatientProfile,
  MatchScoreBreakdown,
  TreatmentHistory,
  BiomarkerGate,
  WashoutCheckResult
} from "./types";
import type { RegistryTrial } from "./registries/types";
import { isPhaseTwoOrAbove, matchesLocation, parsePhaseRank } from "./registries/filters";
import { geocodeLocation, calculateDistance } from "./location";

function textContains(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

function getDaysSinceDate(dateStr: string): number {
  const date = new Date(dateStr);
  const today = new Date();
  const diffTime = today.getTime() - date.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

export function extractWashoutPeriod(eligibilityText: string, treatmentName: string): number | null {
  const text = eligibilityText.toLowerCase();
  const name = treatmentName.toLowerCase();
  
  if (!text.includes(name)) return null;
  
  const patterns = [
    new RegExp(`${name}[^.]*?(?:at least|minimum of|washout|interval of)\\s*(\\d+)\\s*(day|week|month)`, "i"),
    new RegExp(`(\\d+)\\s*(day|week|month)s?\\s*(?:since|after|prior to)[^.]*?${name}`, "i"),
    new RegExp(`washout(?:\\s+period)?\\s+(?:of\\s+)?(\\d+)\\s*(day|week|month)s?[^.]*?${name}`, "i"),
    new RegExp(`(\\d+)\\s*-\\s*(day|week|month)\\s+washout[^.]*?${name}`, "i"),
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
    return profile.biomarkers.some(m => {
      const ml = m.toLowerCase();
      if (!ml.includes(markerName.toLowerCase())) return false;
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

  // Default fallback for single markers
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

function hasContradictoryBiomarkers(
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
    /er\s*negative/i.test(m)
  );
  const isErPositive = profile.biomarkers.some((m) =>
    /er\s*positive/i.test(m)
  );

  if (isHer2Positive && /her2[\s\-]*negative|her2\-|her2\s*neg/i.test(combined)) {
    penalty += 30;
  }
  if (isHer2Negative && /her2[\s\-]*positive|her2\+|her2\s*pos/i.test(combined)) {
    penalty += 30;
  }
  if (isErNegative && /er[\s\-]*positive|er\+|estrogen receptor[\s\-]*positive/i.test(combined)) {
    penalty += 20;
  }
  if (isErPositive && /er[\s\-]*negative|er\-|estrogen receptor[\s\-]*negative/i.test(combined)) {
    penalty += 20;
  }
  if (isHer2Positive && /triple[\s-]negative|tnbc/i.test(combined)) {
    penalty += 25;
  }

  return penalty;
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
    "advanced or metastatic",
    "m1",
  ];

  for (const term of metastaticTerms) {
    if (combined.includes(term)) {
      penalty += 12;
    }
  }

  return Math.min(penalty, 35);
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
}> {
  const baseline = 40;
  const combined = `${trial.title} ${trial.summary} ${trial.eligibilityText}`.toLowerCase();

  // 1. Diagnosis Match
  let diagnosisMatch = 0;
  const diagnosis = profile.primaryDiagnosis.toLowerCase();
  const diagnosisWords = diagnosis.split(/\s+/).filter((w) => w.length > 3);
  const diagnosisHits = diagnosisWords.filter((w) => combined.includes(w)).length;
  if (diagnosisWords.length > 0) {
    diagnosisMatch = Math.round(Math.min(25, (diagnosisHits / diagnosisWords.length) * 25));
  }

  // 2. Biomarkers Match
  let biomarkerMatchRaw = 0;
  for (const marker of profile.biomarkers) {
    const markerLower = marker.toLowerCase();
    if (combined.includes(markerLower)) {
      biomarkerMatchRaw += 10;
    } else if (markerLower.includes("positive")) {
      const base = markerLower.replace(/\s*positive/, "").trim();
      if (combined.includes(`${base} positive`) || combined.includes(`${base}+`)) {
        biomarkerMatchRaw += 10;
      }
    } else if (markerLower.includes("negative")) {
      const base = markerLower.replace(/\s*negative/, "").trim();
      if (combined.includes(`${base} negative`) || combined.includes(`${base}-`)) {
        biomarkerMatchRaw += 10;
      }
    }
  }

  const preCapScore = baseline + diagnosisMatch + biomarkerMatchRaw;
  const cappedScore = Math.min(preCapScore, 85);
  const biomarkerMatch = cappedScore - baseline - diagnosisMatch;

  // 3. Interests Match
  let interestsMatch = 0;
  for (const interest of profile.interests) {
    if (textContains(combined, interest)) interestsMatch += 8;
    if (interest.includes("HER2") && /trastuzumab|pertuzumab|t-dm1|t-dxd|her2/i.test(combined)) {
      interestsMatch += 6;
    }
  }

  // 4. Prior Treatments
  let priorTreatmentsMatch = 0;
  for (const treatment of profile.priorTreatments) {
    if (textContains(trial.eligibilityText || combined, treatment)) {
      if (combined.includes("prior") || combined.includes("previous")) {
        priorTreatmentsMatch += 3;
      }
    }
  }

  // 5. Stage Match
  const stageMatch = (profile.stage && textContains(combined, profile.stage)) ? 7 : 0;

  // 6. Phase Bonus
  let phaseBonus = 0;
  const phaseRank = parsePhaseRank(trial.phase);
  if (phaseRank >= 4) phaseBonus = 12;
  else if (phaseRank === 3) phaseBonus = 10;
  else if (phaseRank === 2) phaseBonus = 8;

  // 7. Location Match & Proximity
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
        const siteCoords = await geocodeLocation(loc.city, loc.state, loc.country);
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
      }
    } else {
      if (matchesLocation(trial, profile.location)) {
        locationMatch = 12;
      }
    }
  }

  // 8. Sex Match
  let sexMatch = 0;
  if (profile.sex !== "unknown") {
    if (profile.sex === "female" && combined.includes("female")) sexMatch += 4;
    if (profile.sex === "male" && combined.includes("male")) sexMatch += 4;
    if (profile.sex === "female" && /male only/i.test(combined)) sexMatch -= 20;
    if (profile.sex === "male" && /female only/i.test(combined)) sexMatch -= 20;
  }

  // 9. Biomarker Logic Gates Check
  const biomarkerGates = evaluateBiomarkerGates(trial.eligibilityText || combined, profile);
  let biomarkerGatesMatch = 0;
  if (biomarkerGates.length > 0) {
    const allPassed = biomarkerGates.every(g => g.passed);
    if (allPassed) {
      biomarkerGatesMatch = 12; // Extra bonus for passing logic gate rules
    }
  }

  // 10. Washout Period Checks
  const washoutChecks = checkWashoutEligibility(trial.eligibilityText || combined, profile);
  let washoutPenalties = 0;
  for (const check of washoutChecks) {
    if (check.status === "ineligible") {
      washoutPenalties += 15;
    } else if (check.status === "unknown") {
      washoutPenalties += 5;
    }
  }

  // 11. Penalties
  const biomarkerPenalties = hasContradictoryBiomarkers(combined, profile);
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

  return {
    score: finalScore,
    distance,
    biomarkerGates,
    washoutChecks,
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

export async function scoreAndRankTrials(
  trials: RegistryTrial[],
  profile: PatientProfile
): Promise<MatchedTrial[]> {
  const scoredPromises = trials.map(async (trial) => {
    const { score, breakdown, distance, biomarkerGates, washoutChecks } = await scoreTrial(trial, profile);
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
    } satisfies MatchedTrial;
  });

  const scored = await Promise.all(scoredPromises);

  const ranked = scored.sort((a, b) => {
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
