import { mapStudy } from "@/lib/registries/clinicaltrials-gov";
import type { ClinicalTrialsGovResponse, ClinicalTrialsGovStudy } from "@/lib/types";
import {
  registryConditionQuery,
  type ListedCondition,
} from "@/lib/normalization";

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = "8";
const REVALIDATE_SECONDS = 60 * 60 * 24;

const LIST_FIELDS =
  "NCTId,BriefTitle,OfficialTitle,OverallStatus,Phase,BriefSummary,EligibilityCriteria,LastUpdatePostDate,LeadSponsorName";

export interface PublicStudy {
  nctId: string;
  title: string;
  phase: string;
  status: string;
  summary: string;
  eligibilityText: string;
  url: string;
  sponsor: string | null;
  registryUpdated: string | null;
}

export interface RecruitingSnapshot {
  query: string;
  studies: PublicStudy[];
  total: number | null;
  fetchedAt: string;
  error?: string;
}

type StudyRecord = ClinicalTrialsGovStudy & {
  protocolSection: ClinicalTrialsGovStudy["protocolSection"] & {
    statusModule: ClinicalTrialsGovStudy["protocolSection"]["statusModule"] & {
      lastUpdatePostDateStruct?: { date?: string };
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: { name?: string };
    };
  };
};

function toPublicStudy(study: StudyRecord): PublicStudy {
  const mapped = mapStudy(study);
  const updated = study.protocolSection.statusModule.lastUpdatePostDateStruct?.date;
  const sponsor = study.protocolSection.sponsorCollaboratorsModule?.leadSponsor?.name?.trim();
  return {
    nctId: mapped.trialId,
    title: mapped.title,
    phase: mapped.phase,
    status: mapped.status,
    summary: mapped.summary,
    eligibilityText: (mapped.eligibilityText || "").slice(0, 6000),
    url: mapped.url,
    sponsor: sponsor || null,
    registryUpdated: updated || null,
  };
}

export async function fetchRecruitingStudies(
  condition: ListedCondition
): Promise<RecruitingSnapshot> {
  const query = registryConditionQuery(condition);
  const fetchedAt = new Date().toISOString();
  const searchParams = new URLSearchParams({
    "query.cond": query,
    "filter.overallStatus": "RECRUITING,NOT_YET_RECRUITING",
    pageSize: PAGE_SIZE,
    countTotal: "true",
    format: "json",
    fields: LIST_FIELDS,
  });

  try {
    const response = await fetch(`${API_BASE}?${searchParams.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      return {
        query,
        studies: [],
        total: null,
        fetchedAt,
        error: `ClinicalTrials.gov returned ${response.status}`,
      };
    }

    const data = (await response.json()) as ClinicalTrialsGovResponse & {
      totalCount?: number;
    };

    return {
      query,
      studies: (data.studies ?? []).map((study) =>
        toPublicStudy(study as StudyRecord)
      ),
      total: typeof data.totalCount === "number" ? data.totalCount : null,
      fetchedAt,
    };
  } catch (error) {
    return {
      query,
      studies: [],
      total: null,
      fetchedAt,
      error: error instanceof Error ? error.message : "ClinicalTrials.gov request failed",
    };
  }
}

export function isNctId(value: string): boolean {
  return /^NCT\d{8}$/i.test(value);
}

export async function fetchPublicStudy(nctId: string): Promise<PublicStudy | null> {
  if (!isNctId(nctId)) return null;
  const id = nctId.toUpperCase();

  try {
    const response = await fetch(`${API_BASE}/${id}?format=json`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (response.status === 404) return null;
    if (!response.ok) return null;

    const study = (await response.json()) as StudyRecord;
    if (!study?.protocolSection?.identificationModule?.nctId) return null;
    return toPublicStudy(study);
  } catch {
    return null;
  }
}
