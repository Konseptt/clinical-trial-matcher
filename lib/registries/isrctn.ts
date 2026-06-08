import { capTrialSummary, normalizeTrialSummary } from "@/lib/format";
import type { RegistryQueryResult, RegistrySearchParams, RegistryTrial } from "./types";

const LEGACY_XML =
  "https://www.isrctn.com/api/query/format/default";
const TRACKER_URL = "https://www.isrctn.com/vueajax/search/tracker";

function parseLegacyXml(xml: string): RegistryTrial[] {
  const trials: RegistryTrial[] = [];
  const blocks = xml.split("<fullTrial>").slice(1);

  for (const block of blocks) {
    const id = block.match(/<isrctn[^>]*>([^<]+)/)?.[1];
    const title = block.match(/<title>([^<]+)/)?.[1];
    const phase = block.match(/<phase[^>]*>([^<]+)/)?.[1];

    const startStr = block.match(/<recruitmentStart>([^<]+)/)?.[1];
    const endStr = block.match(/<recruitmentEnd>([^<]+)/)?.[1];
    let status = "Unknown";
    if (startStr && endStr) {
      const start = new Date(startStr);
      const end = new Date(endStr);
      const now = new Date();
      if (now >= start && now <= end) {
        status = "Recruiting";
      } else if (now < start) {
        status = "Not yet recruiting";
      } else {
        status = "Completed";
      }
    }

    const inclusion = block.match(/<inclusion>([\s\S]*?)<\/inclusion>/i)?.[1] ?? "";
    const exclusion = block.match(/<exclusion>([\s\S]*?)<\/exclusion>/i)?.[1] ?? "";
    const eligibilityText = `Inclusion Criteria:\n${inclusion}\n\nExclusion Criteria:\n${exclusion}`.trim();

    const plainEnglish = block.match(/<plainEnglishSummary>([\s\S]*?)<\/plainEnglishSummary>/i)?.[1] ?? "";
    const hypothesis = block.match(/<studyHypothesis>([\s\S]*?)<\/studyHypothesis>/i)?.[1] ?? "";
    const rawSummary = (plainEnglish && !plainEnglish.includes("Not provided"))
      ? plainEnglish.trim()
      : hypothesis.trim() || "ISRCTN registered trial.";
    const summary = capTrialSummary(normalizeTrialSummary(rawSummary));

    const countriesMatches = [...block.matchAll(/<country>([^<]+)/g)];
    const locations = countriesMatches.map(m => ({
      facility: "Recruitment Site",
      city: "",
      state: "",
      country: m[1].trim()
    }));

    if (!id || !title) continue;

    trials.push({
      registry: "ISRCTN",
      trialId: id,
      title: title.trim(),
      phase: phase?.trim() || "Not specified",
      summary,
      status,
      locations,
      eligibilityText,
      url: `https://www.isrctn.com/ISRCTN${id}`,
    });
  }

  return trials;
}

function sanitizeQueryParam(val: string): string {
  return val.replace(/[^a-zA-Z0-9\s\-\/]/g, "").trim();
}

async function queryLegacyApi(
  params: RegistrySearchParams
): Promise<RegistryTrial[]> {
  const cleanCondition = sanitizeQueryParam(params.condition);
  const url = `${LEGACY_XML}?q=${encodeURIComponent(cleanCondition || "cancer")}&limit=15`;
  const response = await fetch(url, {
    headers: { Accept: "application/xml,text/xml" },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`ISRCTN legacy API unavailable (${response.status})`);
  }

  const xml = await response.text();
  return parseLegacyXml(xml);
}

async function verifyIsrctnReachable(
  params: RegistrySearchParams
): Promise<boolean> {
  const cleanCondition = sanitizeQueryParam(params.condition);
  const response = await fetch(
    `${TRACKER_URL}?q=${encodeURIComponent(cleanCondition || "cancer")}`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) return false;

  const data = (await response.json()) as {
    searchQuery?: { queryText?: string };
  };

  return Boolean(data.searchQuery?.queryText);
}

export async function queryIsrctn(
  params: RegistrySearchParams
): Promise<RegistryQueryResult> {
  try {
    const trials = await queryLegacyApi(params);
    return {
      registry: "ISRCTN",
      queryTerms: params.terms,
      trials,
    };
  } catch {
    const reachable = await verifyIsrctnReachable(params).catch(() => false);

    return {
      registry: "ISRCTN",
      queryTerms: params.terms,
      trials: [],
      error: reachable
        ? "ISRCTN search requires client-side access. The registry API is not publicly available for server queries."
        : "ISRCTN registry could not be reached.",
    };
  }
}
