export interface PatientLocation {
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface PatientProfile {
  age: number | null;
  sex: "male" | "female" | "unknown";
  primaryDiagnosis: string;
  stage: string | null;
  biomarkers: string[];
  priorTreatments: string[];
  location: PatientLocation | null;
}

export interface TrialLocation {
  facility: string;
  city: string;
  state: string;
  country: string;
}

export type TrialRegistry =
  | "ClinicalTrials.gov"
  | "WHO ICTRP"
  | "EU-CTR"
  | "ISRCTN";

export interface MatchedTrial {
  registry: TrialRegistry;
  trialId: string;
  title: string;
  matchScore: number;
  phase: string;
  summary: string;
  locations: TrialLocation[];
  status: string;
  url: string;
}

export interface RegistryQuerySummary {
  registry: TrialRegistry;
  queryTerms: string[];
  trialCount: number;
  error?: string;
}

export interface MatchResponse {
  profile: PatientProfile;
  trials: MatchedTrial[];
  queryTerms: string[];
  registrySummaries: RegistryQuerySummary[];
}

export interface ClinicalTrialsGovStudy {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
      officialTitle?: string;
    };
    statusModule: {
      overallStatus: string;
    };
    designModule?: {
      phases?: string[];
    };
    descriptionModule?: {
      briefSummary?: string;
    };
    eligibilityModule?: {
      eligibilityCriteria?: string;
      sex?: string;
      minimumAge?: string;
      maximumAge?: string;
    };
    contactsLocationsModule?: {
      locations?: Array<{
        facility?: string;
        city?: string;
        state?: string;
        country?: string;
      }>;
    };
  };
}

export interface ClinicalTrialsGovResponse {
  studies: ClinicalTrialsGovStudy[];
  nextPageToken?: string;
}
