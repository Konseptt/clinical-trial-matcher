import type { RegistrySearchParams, RegistrySource } from "./types";

export interface RegistryQueryPlan {
  registry: RegistrySource;
  description: string;
  queryTerms: string[];
  filters: string[];
}

export function buildRegistryQueryPlans(
  params: RegistrySearchParams
): RegistryQueryPlan[] {
  const condition = params.condition;
  const biomarkerClause =
    params.biomarkers.length > 0
      ? params.biomarkers.slice(0, 2).join(" OR ")
      : null;

  const locationClause = params.location?.country
    ? `Location: ${[
        params.location.city,
        params.location.state,
        params.location.country,
      ]
        .filter(Boolean)
        .join(", ")}`
    : null;

  const phaseFilter = "Phase II, III, or IV";
  const statusFilter = "Recruiting or Not yet recruiting";

  return [
    {
      registry: "ClinicalTrials.gov",
      description: "NLM v2 API structured search",
      queryTerms: params.terms,
      filters: [
        `condition: ${condition}`,
        biomarkerClause ? `terms: ${biomarkerClause}` : "terms: (none)",
        `status: ${statusFilter}`,
        `phase: ${phaseFilter}`,
        locationClause ?? "location: (any)",
      ],
    },
    {
      registry: "EU-CTR",
      description: "European Union Clinical Trials Register",
      queryTerms: params.terms,
      filters: [
        `query: ${condition}`,
        "status: Ongoing (legacy EUCTR)",
        `phase: ${phaseFilter}`,
        locationClause ?? "location: (any)",
      ],
    },
    {
      registry: "WHO ICTRP",
      description: "WHO International Clinical Trials Registry Platform",
      queryTerms: params.terms,
      filters: [
        `condition: ${condition}`,
        "recruitment: Recruiting",
        `phase: ${phaseFilter}`,
        locationClause ?? "countries: (any)",
      ],
    },
    {
      registry: "ISRCTN",
      description: "ISRCTN registry search",
      queryTerms: params.terms,
      filters: [
        `query: ${condition}`,
        `status: ${statusFilter}`,
        `phase: ${phaseFilter}`,
        locationClause ?? "location: (any)",
      ],
    },
  ];
}
