export type AppMode = "patient" | "doctor";

export interface PatientLocation {
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface TreatmentHistory {
  name: string;
  startDate?: string; // YYYY-MM
  endDate?: string;   // YYYY-MM
  ongoing: boolean;
}

export interface PatientProfile {
  age: number | null;
  sex: "male" | "female" | "unknown";
  primaryDiagnosis: string;
  stage: string | null;
  biomarkers: string[];
  priorTreatments: string[];
  location: PatientLocation | null;
  hasMetastaticDisease: boolean | null;
  interests: string[];
  priorTreatmentsTimeline?: TreatmentHistory[];
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

export interface MatchScoreBreakdown {
  baseline: number;
  diagnosisMatch: number;
  biomarkerMatch: number;
  interestsMatch: number;
  priorTreatmentsMatch: number;
  stageMatch: number;
  phaseBonus: number;
  locationMatch: number;
  sexMatch: number;
  biomarkerPenalties: number;
  stagePenalties: number;
  washoutPenalties?: number;
  biomarkerGatesMatch?: number;
}

export interface BiomarkerGateRule {
  marker: string;
  expected: "positive" | "negative";
  status: "matched" | "mismatched" | "neutral";
}

export interface BiomarkerGate {
  gateType: "AND" | "OR" | "SINGLE";
  rules: BiomarkerGateRule[];
  passed: boolean;
}

export interface WashoutCheckResult {
  treatmentName: string;
  requiredDays: number;
  actualDays: number | null;
  status: "eligible" | "ineligible" | "unknown";
}

export interface SimplifiedTrialGuide {
  headline: string;
  goodFit: string;
  studyBasics: string[];
  whatToExpect: string[];
  goodToKnow: string;
  askYourDoctor: string[];
}

export interface MatchedTrial {
  registry: TrialRegistry;
  trialId: string;
  title: string;
  matchScore: number;
  scoreBreakdown: MatchScoreBreakdown;
  phase: string;
  summary: string;
  locations: TrialLocation[];
  status: string;
  url: string;
  distance: number | null;
  biomarkerGates?: BiomarkerGate[];
  washoutChecks?: WashoutCheckResult[];
  /** Capped registry eligibility text, used by the review panel. */
  eligibilityText?: string;
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
  mode?: AppMode;
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
