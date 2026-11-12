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
import { lexicalScores, tokenize } from "./lexical";

function textContains(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-token match: "ms" must not hit "symptoms", "iv" must not hit "positive". */
export function hasTerm(text: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(t)}(?![a-z0-9])`, "i").test(text);
}

/**
 * Split registry eligibility text into inclusion / exclusion parts.
 * When no headings exist, everything counts as inclusion.
 */
export function splitCriteria(text: string): { inclusion: string; exclusion: string } {
  const lower = text.toLowerCase();
  const ex = lower.search(/exclusion\s+criteria|\bexclusions?\s*:|\bexclude(?:d)?\s*:/);
  if (ex < 0) return { inclusion: lower, exclusion: "" };
  return { inclusion: lower.slice(0, ex), exclusion: lower.slice(ex) };
}

function getDaysSinceDate(dateStr: string): number {
  const date = new Date(dateStr);
  const today = new Date();
  const diffTime = today.getTime() - date.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

const WASHOUT_ALIASES: Record<string, string[]> = {
  radiation: ["radiotherapy", "radiation therapy"],
  chemotherapy: ["chemo"],
};

export function extractWashoutPeriod(eligibilityText: string, treatmentName: string): number | null {
  const text = eligibilityText.toLowerCase();
  const name = treatmentName.toLowerCase();

  if (!name) return null;
  // Registries say "radiotherapy" where patients say "radiation".
  const names = WASHOUT_ALIASES[name] ? [name, ...WASHOUT_ALIASES[name]] : [name];
  const found = names.filter((n) => text.includes(n));
  if (found.length === 0) return null;

  const safeName = `(?:${found.map(escapeRegExp).join("|")})`;
  // "X within N days" is an exclusion idiom; in inclusion text it often means
  // the opposite ("progressed on X within 6 months"), so only read it there.
  const { exclusion } = splitCriteria(text);
  const exclusionText = exclusion || text;

  const patterns: Array<[RegExp, string]> = [
    [new RegExp(`${safeName}[^.\\n]{0,200}?(?:at least|minimum of|washout|interval of)\\s*(\\d+)\\s*(day|week|month)`, "i"), text],
    [new RegExp(`(\\d+)\\s*(day|week|month)s?\\s*(?:since|after|prior to|before|from)[^.\\n]{0,200}?${safeName}`, "i"), text],
    [new RegExp(`washout(?:\\s+period)?\\s+(?:of\\s+)?(\\d+)\\s*(day|week|month)s?[^.\\n]{0,200}?${safeName}`, "i"), text],
    [new RegExp(`(\\d+)\\s*-\\s*(day|week|month)\\s+washout[^.\\n]{0,200}?${safeName}`, "i"), text],
    [new RegExp(`${safeName}[^.\\n]{0,200}?(?:within|in the (?:last|past|previous))\\s*(\\d+)\\s*(day|week|month)`, "i"), exclusionText],
  ];

  for (const [pattern, source] of patterns) {
    const match = source.match(pattern);
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

/** Score ceiling for trials with a hard eligibility conflict (biomarker or stage). */
export const BIOMARKER_CONFLICT_SCORE_CAP = 40;

/** Rules the patient fails, e.g. "ER positive" when the profile says ER negative. */
export function biomarkerConflicts(gates: BiomarkerGate[]): string[] {
  return gates
    .filter((g) => !g.passed)
    .flatMap((g) => g.rules.filter((r) => r.status === "mismatched"))
    .map((r) => `${r.marker} ${r.expected}`);
}

export function evaluateBiomarkerGates(
  eligibilityText: string,
  profile: Pick<PatientProfile, "biomarkers">
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
  if ((text.includes("kras") || text.includes("nras")) && (text.includes("wild-type") || text.includes("wild type") || hasTerm(text, "wt"))) {
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
  profile: Pick<PatientProfile, "biomarkers">
): number {
  let penalty = 0;

  const isHer2Positive = profile.biomarkers.some((m) =>
    /her2[\s-]*positive/i.test(m)
  );
  const isHer2Negative = profile.biomarkers.some((m) =>
    /her2[\s-]*negative/i.test(m)
  );
  const isErNegative = profile.biomarkers.some((m) =>
    /(?<![a-z])er\s*negative/i.test(m)
  );
  const isErPositive = profile.biomarkers.some((m) =>
    /(?<![a-z])er\s*positive/i.test(m)
  );

  if (isHer2Positive && /her2[\s\-]*negative|her2-(?![a-z0-9])|her2\s*neg/i.test(combined)) {
    penalty += 30;
  }
  if (isHer2Negative && /her2[\s\-]*positive|her2\+|her2\s*pos/i.test(combined)) {
    penalty += 30;
  }
  if (isErNegative && /(?<![a-z])er[\s\-]*positive|(?<![a-z])er\+|estrogen receptor[\s\-]*positive/i.test(combined)) {
    penalty += 20;
  }
  if (isErPositive && /(?<![a-z])er[\s\-]*negative|(?<![a-z])er-(?![a-z0-9])|estrogen receptor[\s\-]*negative/i.test(combined)) {
    penalty += 20;
  }
  if (isHer2Positive && /triple[\s-]negative|tnbc/i.test(combined)) {
    penalty += 25;
  }

  return penalty;
}

export function biomarkerGatePenalty(
  gates: BiomarkerGate[],
  profile: Pick<PatientProfile, "biomarkers">
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

/**
 * Metastatic patient vs a trial for curable/early disease (neoadjuvant,
 * operable, stage I-III, or "stage IV" listed as an exclusion).
 */
function earlyStageOnlyPenalty(combined: string, eligibilityText: string): number {
  const { inclusion, exclusion } = splitCriteria(eligibilityText);
  const titleSummary = eligibilityText ? combined.replace(eligibilityText.toLowerCase(), "") : combined;
  const inclusionSide = `${titleSummary} ${inclusion}`;
  const early = [
    /\b(?:neo)?adjuvant\b/,
    /\bearly[\s-]+(?:stage|breast)\b/,
    /\boperable\b/,
    /\bstage\s+(?:0|i{1,3}[abc]?)(?:\s*(?:-|to|or)\s*i{1,3}[abc]?)?\b(?!\s*(?:-|to|or)\s*iv)/,
    /\bno (?:evidence of )?distant metasta/,
  ].filter((re) => re.test(inclusionSide)).length;
  const excludesMetastatic = /\bstage\s+iv\b|\bdistant metasta|\bmetastatic (?:breast )?(?:cancer|disease)\b/.test(exclusion);
  // A trial that also enrolls advanced disease ("locally advanced or metastatic") is fine.
  const admitsAdvanced = /\bmetastatic\b|\badvanced\b|\bstage\s+iv\b/.test(inclusionSide.replace(/\bno (?:evidence of )?distant metasta\w*/g, " ").replace(/\blocally advanced\b/g, " "));
  if (excludesMetastatic) return 35;
  if (early > 0 && !admitsAdvanced) return Math.min(early * 15, 35);
  return 0;
}

/**
 * Exclusion criteria that rule out a therapy the patient already had
 * ("prior treatment with trastuzumab", "previously received a CDK4/6
 * inhibitor"). A clause with a time window ("within 28 days") is a washout,
 * handled by checkWashoutEligibility, so it is skipped here.
 */
export function priorTherapyExclusions(
  eligibilityText: string,
  profile: Pick<PatientProfile, "priorTreatments">
): string[] {
  const { exclusion } = splitCriteria(eligibilityText);
  if (!exclusion) return [];
  const clauses = exclusion.split(/[.;\n]|\s\d+\.\s/);
  const hits: string[] = [];
  for (const treatment of profile.priorTreatments) {
    const name = treatment.toLowerCase();
    if (name.length < 4 || /^(?:surgery|chemotherapy|radiation|immunotherapy|targeted therapy)$/.test(name)) continue;
    const re = new RegExp(
      `\\b(?:prior|previous(?:ly)?|history of|received|treated with|exposure to)\\b[^.;]{0,60}?(?:^|[^a-z0-9])${escapeRegExp(name)}(?![a-z0-9])`,
      "i"
    );
    const clause = clauses.find((c) => re.test(c));
    if (!clause) continue;
    if (/\bwithin\b|\b\d+\s*(?:day|week|month)s?\b|\bwashout\b/i.test(clause)) continue;
    // "prior trastuzumab is allowed" / "unless" / "except" are permissions, not exclusions.
    if (/\b(?:allowed|permitted|unless|except|acceptable|eligible)\b/i.test(clause)) continue;
    hits.push(treatment);
  }
  return hits;
}

/**
 * No site coordinates: a same-country site counts like a mid-range distance,
 * a foreign or unlisted site earns nothing. The old flat +8 ranked a trial in
 * China above a US site 2,500 miles away for a Boston patient.
 */
function sameCountryBonus(trial: RegistryTrial, profile: PatientProfile): number {
  const country = profile.location?.country?.toLowerCase();
  if (!country) return 0;
  return trial.locations.some((l) => l.country?.toLowerCase() === country) ? 4 : 0;
}

const ROMAN_STAGE: Record<string, string> = { "0": "0", "1": "i", "2": "ii", "3": "iii", "4": "iv" };

/** "stage 2", "stage II", "Stage IIb" all match a profile stage of "2" or "II". */
export function stagePattern(stage: string): RegExp {
  const s = stage.toLowerCase().replace(/^stage\s+/, "").trim();
  const m = s.match(/^([0-4])([abc])?$/) ?? null;
  const roman = m ? ROMAN_STAGE[m[1]] + (m[2] ?? "") : s;
  const arabic = Object.entries(ROMAN_STAGE).find(([, r]) => roman.replace(/[abc]$/, "") === r)?.[0];
  const sub = roman.match(/[abc]$/)?.[0] ?? "";
  const forms = [...new Set([roman, arabic ? arabic + sub : roman])].map(escapeRegExp);
  return new RegExp(`\\bstage\\s+(?:${forms.join("|")})(?![a-z0-9])`, "i");
}

export function hasContradictoryStageContext(
  combined: string,
  profile: Pick<PatientProfile, "hasMetastaticDisease">,
  eligibilityText = ""
): number {
  if (profile.hasMetastaticDisease === true) {
    return earlyStageOnlyPenalty(combined, eligibilityText);
  }
  if (profile.hasMetastaticDisease !== false) return 0;

  // Exclusion criteria ("no known brain metastases") describe who is turned
  // away; they must not penalise the non-metastatic patient they admit.
  const { inclusion } = splitCriteria(eligibilityText);
  const titleSummary = eligibilityText ? combined.replace(eligibilityText.toLowerCase(), "") : combined;
  const text = `${titleSummary} ${inclusion}`.replace(
    /\b(?:no|without|absence of|non)[\s-]+(?:known\s+|evidence of\s+|active\s+|untreated\s+|brain\s+|cns\s+|distant\s+)*metasta\w*/g,
    " "
  );

  const concepts = [/metasta/, /leptomeningeal/, /\bstage\s+iv\b/, /\bm1\b/];
  const hits = concepts.filter((re) => re.test(text)).length;
  return Math.min(hits * 12, 35);
}

function isSexExcluded(trial: RegistryTrial, profile: PatientProfile, combined: string): boolean {
  if (profile.sex === "unknown") return false;
  if (trial.sex && trial.sex !== "all") return trial.sex !== profile.sex;
  if (profile.sex === "female") return /\b(?:males?|men)\s+only\b/i.test(combined);
  return /\b(?:females?|women)\s+only\b/i.test(combined);
}

/** Reason string when the patient's age falls outside registry limits, else null. */
function ageOutOfRange(trial: RegistryTrial, profile: PatientProfile): string | null {
  if (profile.age === null) return null;
  if (trial.minAgeYears != null && profile.age < trial.minAgeYears) {
    return `Patient age ${profile.age} below registry minimum ${Math.round(trial.minAgeYears)}`;
  }
  if (trial.maxAgeYears != null && profile.age > trial.maxAgeYears) {
    return `Patient age ${profile.age} above registry maximum ${Math.round(trial.maxAgeYears)}`;
  }
  return null;
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
  const diagHit =
    (diagWords.length > 0 && diagWords.every((w) => hasTerm(combined, w))) ||
    norm.synonyms.some((s) => hasTerm(combined, s));

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
    const subHit = subWords.some((w) => hasTerm(combined, w));
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
    const { inclusion, exclusion } = splitCriteria(trial.eligibilityText || "");
    const excluded = profile.priorTreatments.filter((t) => hasTerm(exclusion, t));
    const matchedTreatments = profile.priorTreatments.filter(
      (t) => !excluded.includes(t) && hasTerm(`${trial.title} ${trial.summary} ${inclusion}`, t)
    );
    if (excluded.length > 0) {
      reasonsToConfirm.push(`Exclusion criteria mention ${excluded.join(", ")} — confirm timing/eligibility`);
    }
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
  const ageOut = ageOutOfRange(trial, profile);
  if (profile.age !== null && ageOut) {
    criteriaEvaluations.push({
      name: "Age requirement",
      category: "age",
      status: "not-met",
      evidence: ageOut,
    });
  } else if (profile.age !== null && (trial.minAgeYears != null || trial.maxAgeYears != null)) {
    criteriaEvaluations.push({
      name: "Age requirement",
      category: "age",
      status: "met",
      evidence: `Patient age ${profile.age} within registry limits (${trial.minAgeYears ?? "no min"}–${trial.maxAgeYears ?? "no max"})`,
    });
  } else if (profile.age !== null) {
    criteriaEvaluations.push({
      name: "Age requirement",
      category: "age",
      status: "unknown",
      evidence: `Registry publishes no structured age limits; confirm age ${profile.age} against protocol`,
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
    const sexMismatch = isSexExcluded(trial, profile, combined);
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
    } else if (trial.locations.length > 0) {
      const listed = trial.locations
        .map((l) => [l.city, l.country].filter(Boolean).join(", "))
        .filter(Boolean);
      criteriaEvaluations.push({
        name: "Study location / site availability",
        category: "location",
        status: "not-met",
        evidence: `No listed sites in ${profile.location.state || profile.location.country}${
          listed.length ? `; sites: ${listed.slice(0, 3).join("; ")}` : ""
        }`,
      });
      reasonsToConfirm.push("All listed sites are far away; ask whether new sites are planned");
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

/** Query terms for lexical relevance: raw notes when we have them, else profile fields. */
export function profileQueryText(profile: PatientProfile): string {
  return [
    profile.primaryDiagnosis,
    profile.subtype ?? "",
    profile.stage ? `stage ${profile.stage}` : "",
    ...profile.biomarkers,
    ...profile.priorTreatments,
    ...(profile.interests ?? []),
  ].join(" ");
}

async function scoreTrial(
  trial: RegistryTrial,
  profile: PatientProfile,
  query: Set<string>
): Promise<{
  score: number;
  rankScore: number;
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
  const diagnosisHits = diagnosisWords.filter((w) => hasTerm(combined, w)).length;
  if (diagnosisWords.length > 0) {
    diagnosisMatch = Math.round(Math.min(25, (diagnosisHits / diagnosisWords.length) * 25));
  }
  if (norm.synonyms.some((s) => hasTerm(combined, s))) {
    diagnosisMatch = Math.max(diagnosisMatch, 25);
  }

  // 2. Subtype Match bonus
  const subtype = profile.subtype || norm.subtype;
  if (subtype) {
    const subLower = subtype.toLowerCase();
    const names = [subLower.replace(/\s*\([^)]*\)/g, ""), ...[...subLower.matchAll(/\(([^)]+)\)/g)].map((m) => m[1])];
    if (names.some((n) => hasTerm(combined, n)) || (subLower.includes("relapsing") && hasTerm(combined, "relapsing"))) {
      diagnosisMatch = Math.min(30, diagnosisMatch + 5);
    }
  }

  // 3. Biomarkers Match
  let biomarkerMatchRaw = 0;
  for (const marker of profile.biomarkers) {
    const markerLower = marker.toLowerCase();
    const isShortReceptor = /^(?:er|pr)\b/.test(markerLower);
    if (!isShortReceptor && hasTerm(combined, markerLower)) {
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
  const crit = splitCriteria(trial.eligibilityText || "");
  for (const treatment of profile.priorTreatments) {
    if (hasTerm(crit.exclusion, treatment)) continue;
    if (hasTerm(`${trial.title} ${trial.summary} ${crit.inclusion}`, treatment)) {
      priorTreatmentsMatch += 4;
    }
  }

  // 6. Stage Match
  const stageMatch = profile.stage && stagePattern(profile.stage).test(combined) ? 7 : 0;

  // 7. Phase Bonus
  let phaseBonus = 0;
  const phaseRank = parsePhaseRank(trial.phase);
  if (phaseRank >= 4) phaseBonus = 6;
  else if (phaseRank === 3) phaseBonus = 5;
  else if (phaseRank === 2) phaseBonus = 4;
  else if (phaseRank === 1) phaseBonus = 2;

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
        locationMatch = sameCountryBonus(trial, profile);
      }
    } else {
      locationMatch = sameCountryBonus(trial, profile);
    }
  }

  // 9. Sex Match
  let sexMatch = 0;
  if (profile.sex !== "unknown") {
    if (profile.sex === "female" && /\bfemale\b/i.test(combined)) sexMatch += 4;
    if (profile.sex === "male" && /\bmale\b/i.test(combined)) sexMatch += 4;
    if (isSexExcluded(trial, profile, combined)) sexMatch -= 20;
  }

  // 9b. Structured age limits (hard gate)
  const ageMatch = ageOutOfRange(trial, profile) ? -25 : 0;

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

  // 11b. Lexical relevance (BM25 vs title) and patient terms in exclusion criteria
  const { textRelevance, exclusionOverlap } = lexicalScores(
    query,
    trial.title,
    splitCriteria(trial.eligibilityText || "").exclusion
  );

  // 12. Penalties
  const biomarkerPenalties =
    hasContradictoryBiomarkers(combined, profile) +
    biomarkerGatePenalty(biomarkerGates, profile);
  const stagePenalties = hasContradictoryStageContext(combined, profile, trial.eligibilityText);
  const excludedPriorTherapies = priorTherapyExclusions(trial.eligibilityText || "", profile);

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
    ageMatch +
    textRelevance +
    biomarkerGatesMatch -
    exclusionOverlap - 
    biomarkerPenalties - 
    stagePenalties -
    washoutPenalties;

  // Biomarker and stage conflicts are hard blockers (forecast marks them
  // "Not a match"), so they must not sit at the top on bonus points alone.
  const hardBlocked =
    biomarkerPenalties > 0 || stagePenalties > 0 || excludedPriorTherapies.length > 0;
  const finalScore = Math.max(
    0,
    Math.min(hardBlocked ? BIOMARKER_CONFLICT_SCORE_CAP : 100, Math.round(rawTotal))
  );

  const { criteriaEvaluations, reasonsMatched, reasonsToConfirm } =
    evaluateCriteria(trial, profile);
  if (excludedPriorTherapies.length > 0) {
    for (const c of criteriaEvaluations) {
      if (c.category === "prior-treatment") c.status = "not-met";
    }
    criteriaEvaluations.unshift({
      name: "Prior therapy exclusion",
      category: "prior-treatment",
      status: "not-met",
      evidence: `Exclusion criteria rule out prior ${excludedPriorTherapies.join(", ")}`,
    });
    reasonsMatched.splice(
      0,
      reasonsMatched.length,
      ...reasonsMatched.filter((r) => !excludedPriorTherapies.some((t) => r.includes(t)))
    );
  }
  if (biomarkerPenalties > 0) {
    const conflicts = biomarkerConflicts(biomarkerGates);
    criteriaEvaluations.unshift({
      name: "Biomarker requirement",
      category: "general",
      status: "not-met",
      evidence: conflicts.length
        ? `Study requires ${conflicts.join(", ")}; profile differs`
        : "Study biomarker requirement conflicts with profile",
    });
    reasonsToConfirm.unshift("Confirm biomarker status with study team");
  }

  return {
    score: finalScore,
    rankScore: hardBlocked ? finalScore : rawTotal,
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
      ageMatch,
      textRelevance: Math.round(textRelevance),
      exclusionOverlap: Math.round(exclusionOverlap),
      biomarkerPenalties,
      stagePenalties,
      washoutPenalties,
      excludedPriorTherapies,
      biomarkerGatesMatch,
    }
  };
}

const MIN_DISPLAY_SCORE = 45;
const MAX_RESULTS = 10;
const PER_REGISTRY = 2;

export function selectDisplayedTrials(ranked: MatchedTrial[]): MatchedTrial[] {
  const keyOf = (trial: MatchedTrial) =>
    `${trial.registry}:${trial.trialId}`.toLowerCase();
  const high = ranked.filter((trial) => trial.matchScore >= MIN_DISPLAY_SCORE);
  const picked = new Set<string>();

  for (const trial of (high.length > 0 ? high : ranked).slice(0, MAX_RESULTS)) {
    picked.add(keyOf(trial));
  }

  const registries = [...new Set(ranked.map((trial) => trial.registry))];
  for (const registry of registries) {
    const fromRegistry = ranked.filter((trial) => trial.registry === registry);
    for (const trial of fromRegistry.slice(0, PER_REGISTRY)) {
      picked.add(keyOf(trial));
    }
  }

  return ranked.filter((trial) => picked.has(keyOf(trial)));
}

export function rankMatchedTrials(trials: MatchedTrial[]): MatchedTrial[] {
  const ranked = [...trials].sort((a, b) => {
    // Phase already contributes phaseBonus to the score; sorting phase-first
    // buried a 95-point phase 1 trial under a 46-point phase 2 one.
    const ra = a.rankScore ?? a.matchScore;
    const rb = b.rankScore ?? b.matchScore;
    if (rb !== ra) return rb - ra;
    return (isPhaseTwoOrAbove(b.phase) ? 1 : 0) - (isPhaseTwoOrAbove(a.phase) ? 1 : 0);
  });

  return selectDisplayedTrials(ranked);
}

export async function scoreAllRegistryTrials(
  trials: RegistryTrial[],
  profile: PatientProfile,
  queryText: string = profileQueryText(profile)
): Promise<MatchedTrial[]> {
  const query = new Set(tokenize(queryText));
  const scoredPromises = trials.map(async (trial) => {
    const {
      score,
      rankScore,
      breakdown,
      distance,
      biomarkerGates,
      washoutChecks,
      criteriaEvaluations,
      reasonsMatched,
      reasonsToConfirm,
    } = await scoreTrial(trial, profile, query);

    return {
      registry: trial.registry,
      trialId: trial.trialId,
      title: trial.title,
      matchScore: score,
      rankScore,
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
  profile: PatientProfile,
  queryText?: string
): Promise<MatchedTrial[]> {
  const scored = await scoreAllRegistryTrials(trials, profile, queryText);
  return rankMatchedTrials(scored);
}
