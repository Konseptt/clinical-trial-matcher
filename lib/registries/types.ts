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

  let condition = profile.primaryDiagnosis
    .replace(/^\s*stage\s+[ivx0-9]+[abc]?\s+/i, "")
    .replace(/\b(stage\s+[ivx0-9]+[abc]?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const lower = condition.toLowerCase();
  for (const cancerType of [
    "breast cancer",
    "lung cancer",
    "melanoma",
    "lymphoma",
    "leukemia",
    "colorectal cancer",
    "colon cancer",
    "prostate cancer",
    "ovarian cancer",
    "pancreatic cancer",
    "hepatocellular",
    "renal cell",
    "bladder cancer",
    "gastric cancer",
    "esophageal cancer",
    "endometrial cancer",
    "cervical cancer",
    "head and neck",
    "thyroid cancer",
    "mesothelioma",
    "sarcoma",
    "glioblastoma",
    "multiple myeloma",
  ]) {
    if (lower.includes(cancerType)) {
      condition = cancerType;
      break;
    }
  }

  return {
    condition: condition || terms[0],
    terms,
    biomarkers: profile.biomarkers,
    location: profile.location,
  };
}
