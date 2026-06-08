import type { PatientLocation, PatientProfile } from "@/lib/types";

export type RegistrySource =
  | "ClinicalTrials.gov"
  | "WHO ICTRP"
  | "EU-CTR"
  | "ISRCTN";

export interface RegistrySearchParams {
  condition: string;
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
  const terms: string[] = [];

  if (
    profile.primaryDiagnosis &&
    profile.primaryDiagnosis !== "unspecified condition"
  ) {
    terms.push(profile.primaryDiagnosis);
  }

  for (const marker of profile.biomarkers.slice(0, 3)) {
    terms.push(marker);
  }

  if (terms.length === 0) {
    terms.push("cancer");
  }

  const condition = profile.primaryDiagnosis
    .replace(/\b(stage\s+[ivx0-9]+[abc]?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    condition: condition || terms[0],
    terms,
    biomarkers: profile.biomarkers,
    location: profile.location,
  };
}
