import { capTrialSummary } from "@/lib/format";
import type { ClinicalTrialsGovResponse, ClinicalTrialsGovStudy } from "@/lib/types";
import type { RegistryQueryResult, RegistrySearchParams, RegistryTrial } from "./types";

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";

function sanitizeQueryParam(val: string): string {
  return val.replace(/[^a-zA-Z0-9\s\-\/]/g, "").trim();
}

export function normalizePhase(phases?: string[]): string {
  if (!phases || phases.length === 0) return "Not specified";
  return phases
    .map((p) => {
      const key = p.toUpperCase().trim();
      if (key === "NA") return "Not Applicable";
      if (key === "EARLY_PHASE1") return "Early Phase 1";
      const m = key.match(/^PHASE(\d)$/);
      if (m) return `Phase ${m[1]}`;
      const num = key.replace(/PHASE/g, "").replace(/_/g, " ").trim();
      return num ? `Phase ${num}` : p;
    })
    .join(", ");
}

export function mapStudy(study: ClinicalTrialsGovStudy): RegistryTrial {
  const id = study.protocolSection.identificationModule;
  const locations =
    study.protocolSection.contactsLocationsModule?.locations ?? [];

  return {
    registry: "ClinicalTrials.gov",
    trialId: id.nctId,
    title: id.briefTitle || id.officialTitle || "Untitled Study",
    phase: normalizePhase(study.protocolSection.designModule?.phases),
    summary: capTrialSummary(
      study.protocolSection.descriptionModule?.briefSummary ??
        "No summary available."
    ),
    status: study.protocolSection.statusModule.overallStatus,
    locations: locations.slice(0, 10).map((loc) => ({
      facility: loc.facility ?? "Facility not listed",
      city: loc.city ?? "",
      state: loc.state ?? "",
      country: loc.country ?? "",
    })),
    eligibilityText:
      study.protocolSection.eligibilityModule?.eligibilityCriteria ?? "",
    url: `https://clinicaltrials.gov/study/${id.nctId}`,
  };
}

export async function queryClinicalTrialsGov(
  params: RegistrySearchParams
): Promise<RegistryQueryResult> {
  const sanitizedCondition = sanitizeQueryParam(params.condition);
  
  const searchParams = new URLSearchParams({
    "query.cond": sanitizedCondition || "clinical trial",
    "filter.overallStatus": "RECRUITING,NOT_YET_RECRUITING,ENROLLING_BY_INVITATION,ACTIVE_NOT_RECRUITING",
    pageSize: "30",
    format: "json",
    fields:
      "NCTId,BriefTitle,OfficialTitle,OverallStatus,Phase,BriefSummary,EligibilityCriteria,Sex,MinimumAge,MaximumAge,LocationFacility,LocationCity,LocationState,LocationCountry",
  });

  if (params.biomarkers.length > 0) {
    const biomarkerTerms = params.biomarkers
      .map(sanitizeQueryParam)
      .filter(Boolean)
      .slice(0, 2);

    if (biomarkerTerms.length > 0) {
      searchParams.set("query.term", biomarkerTerms.join(" OR "));
    }
  }

  const response = await fetch(`${API_BASE}?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`ClinicalTrials.gov API error: ${response.status}`);
  }

  const data = (await response.json()) as ClinicalTrialsGovResponse;

  return {
    registry: "ClinicalTrials.gov",
    queryTerms: params.terms,
    trials: (data.studies ?? []).map(mapStudy),
  };
}
