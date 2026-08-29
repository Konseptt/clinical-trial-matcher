import type { PatientLocation, PatientProfile } from "@/lib/types";
import { normalizeCondition } from "@/lib/normalization";

export type RegistrySource =
  | "ClinicalTrials.gov"
  | "WHO ICTRP"
  | "EU-CTR"
  | "ISRCTN";

export interface RegistrySearchParams {
  condition: string;
  subtype: string | null;
  terms: string[];
  biomarkers: string[];
  location: PatientLocation | null;
}

export type { PatientLocation };

export interface RegistryTrial {
  registry: RegistrySource;
  trialId: string;
  title: string;
  phase: string;
  summary: string;
  status: string;
  locations: Array<{
    facility: string;
    city: string;
    state: string;
    country: string;
  }>;
  eligibilityText: string;
  url: string;
}

export interface RegistryQueryResult {
  registry: RegistrySource;
  queryTerms: string[];
  trials: RegistryTrial[];
  error?: string;
}

export function buildRegistrySearchParams(
  profile: PatientProfile
): RegistrySearchParams {
  const norm = normalizeCondition(profile.primaryDiagnosis);
  const terms: string[] = [];

  // 1. Add canonical name
  if (norm.canonicalName && norm.canonicalName !== "unspecified condition") {
    terms.push(norm.canonicalName);
  } else if (profile.primaryDiagnosis && profile.primaryDiagnosis !== "unspecified condition") {
    terms.push(profile.primaryDiagnosis);
  }

  // 2. Add subtype if available
  const subtype = profile.subtype || norm.subtype || null;
  if (subtype) {
    terms.push(subtype.replace(/\s*\([^)]*\)/g, "").trim());
  }

  // 3. Add synonyms
  for (const syn of norm.synonyms) {
    if (!terms.includes(syn)) {
      terms.push(syn);
    }
  }

  // 4. Add biomarkers if available
  for (const marker of profile.biomarkers.slice(0, 3)) {
    if (!terms.includes(marker)) {
      terms.push(marker);
    }
  }

  if (terms.length === 0) {
    terms.push("clinical trial");
  }

  const cleanCondition = norm.canonicalName !== "unspecified condition"
    ? norm.canonicalName
    : terms[0];

  return {
    condition: cleanCondition,
    subtype,
    terms: terms.slice(0, 5),
    biomarkers: profile.biomarkers,
    location: profile.location,
  };
}
