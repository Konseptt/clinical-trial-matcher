import { capTrialSummary } from "@/lib/format";
import type { RegistryQueryResult, RegistrySearchParams, RegistryTrial } from "./types";

const LEGACY_SEARCH =
  "https://www.clinicaltrialsregister.eu/ctr-search/search";

function sanitizeQueryParam(val: string): string {
  return val.replace(/[^a-zA-Z0-9\s\-\/]/g, "").trim();
}

function buildSearchQuery(params: RegistrySearchParams): string {
  const cleanCond = sanitizeQueryParam(params.condition);
  if (cleanCond) return cleanCond;

  const terms = params.terms
    .map(sanitizeQueryParam)
    .filter(Boolean)
    .slice(0, 2);

  if (terms.length > 0) {
    return terms.join(" ");
  }

  return "clinical trial";
}

export function extractPhaseFromTitle(title: string): string {
  const match = title.match(
    /\bphase\s*(i{1,3}v?|iv|0|[1-4])(?:\s*\/\s*(i{1,3}v?|iv|[1-4]))?\b/i
  );
  if (!match) return "Not specified";
  const primary = match[1].toUpperCase();
  return match[2] ? `Phase ${primary}/${match[2].toUpperCase()}` : `Phase ${primary}`;
}

export function parseLegacyHtml(html: string): RegistryTrial[] {
  const blocks = html.split('<table class="result">').slice(1);
  const trials: RegistryTrial[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const eudractMatch = block.match(
      /<span class="label">EudraCT Number:<\/span>\s*([0-9-]+)/
    );
    if (!eudractMatch) continue;

    const trialId = eudractMatch[1];
    if (seen.has(trialId)) continue;

    const titleMatch = block.match(
      /<span class="label">Full Title:<\/span>\s*([^<]+)/
    );
    const conditionMatch = block.match(
      /<span class="label">Medical condition:<\/span>\s*([^<]+)/
    );

    const statusMatches = [
      ...block.matchAll(/<span class="status">\(([^)]+)\)<\/span>/g),
    ];
    const statuses = statusMatches.map((m) => m[1].trim());
    const isOngoing = statuses.some((s) =>
      /ongoing|recruit|not yet recruit|authoris/i.test(s)
    );
    if (!isOngoing) continue;

    const countryLinks = [
      ...block.matchAll(/href="\/ctr-search\/trial\/[^/]+\/([A-Z]{2})"/g),
    ];
    const countries = [...new Set(countryLinks.map((m) => m[1]))];

    const title = titleMatch?.[1]?.trim() ?? "Untitled EU trial";
    seen.add(trialId);

    trials.push({
      registry: "EU-CTR",
      trialId,
      title,
      phase: extractPhaseFromTitle(title),
      summary: capTrialSummary(
        conditionMatch?.[1]?.trim() ?? "No summary available."
      ),
      status: statuses[0] ?? "Ongoing",
      locations: countries.map((code) => ({
        facility: "EU member state site",
        city: "",
        state: "",
        country: code,
      })),
      eligibilityText: "",
      url: `https://www.clinicaltrialsregister.eu/ctr-search/trial/${trialId}/GB`,
    });
  }

  return trials;
}

function buildLegacySearchUrl(params: RegistrySearchParams): string {
  const searchQuery = buildSearchQuery(params);
  const search = new URLSearchParams({
    query: searchQuery,
    status: "ongoing",
  });

  return `${LEGACY_SEARCH}?${search.toString()}`;
}

export const CTIS_OPEN_STATUS: Record<number, string> = {
  2: "Not yet recruiting",
  3: "Recruiting",
  4: "Recruiting",
};

export interface CtisSearchHit {
  ctNumber?: string;
  ctTitle?: string;
  trialPhase?: string;
  ctStatus?: number | string;
  trialCountries?: string[];
  conditions?: string;
}

export function mapCtisSearchHit(trial: CtisSearchHit): RegistryTrial | null {
  const code = Number(trial.ctStatus);
  const status = CTIS_OPEN_STATUS[code];
  if (!status || !trial.ctNumber) return null;

  const countries = [...new Set(
    (trial.trialCountries ?? [])
      .map((entry) => entry.replace(/:\d+$/, "").trim())
      .filter(Boolean)
  )];

  return {
    registry: "EU-CTR",
    trialId: trial.ctNumber,
    title: trial.ctTitle?.trim() || "Untitled EU trial",
    phase: trial.trialPhase?.trim() || "Not specified",
    summary: capTrialSummary(trial.conditions?.trim() || "EU CTIS registered trial."),
    status,
    locations: countries.map((country) => ({
      facility: "CTIS site",
      city: "",
      state: "",
      country,
    })),
    eligibilityText: "",
    url: `https://euclinicaltrials.eu/ctis-public/view/${trial.ctNumber}`,
  };
}

async function queryCtisApi(
  params: RegistrySearchParams
): Promise<RegistryTrial[]> {
  const searchQuery = buildSearchQuery(params);
  const response = await fetch(
    "https://euclinicaltrials.eu/ctis-public-api/search",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchCriteria: {
          containAll: searchQuery,
          status: [2, 3, 4],
        },
        pagination: { page: 1, pageSize: 10 },
      }),
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) return [];

  const data = (await response.json()) as { data?: CtisSearchHit[] };
  return (data.data ?? [])
    .map(mapCtisSearchHit)
    .filter((trial): trial is RegistryTrial => trial !== null);
}

function dedupeEuTrials(trials: RegistryTrial[]): RegistryTrial[] {
  const seen = new Set<string>();
  const result: RegistryTrial[] = [];

  for (const trial of trials) {
    const key = trial.trialId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trial);
  }

  return result.slice(0, 15);
}

export async function queryEuCtr(
  params: RegistrySearchParams
): Promise<RegistryQueryResult> {
  const ctisTrials = await queryCtisApi(params).catch(() => []);
  const url = buildLegacySearchUrl(params);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "ClinicalTrialMatcher/1.0",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    if (ctisTrials.length > 0) {
      return {
        registry: "EU-CTR",
        queryTerms: params.terms,
        trials: ctisTrials,
      };
    }
    throw new Error(`EU-CTR search error: ${response.status}`);
  }

  const html = await response.text();
  const legacyTrials = parseLegacyHtml(html);
  const trials = dedupeEuTrials([...ctisTrials, ...legacyTrials]);

  return {
    registry: "EU-CTR",
    queryTerms: params.terms,
    trials,
  };
}
