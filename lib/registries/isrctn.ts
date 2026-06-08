import type { RegistryQueryResult, RegistrySearchParams, RegistryTrial } from "./types";

const LEGACY_XML =
  "https://www.isrctn.com/api/query/default";
const TRACKER_URL = "https://www.isrctn.com/vueajax/search/tracker";

function parseLegacyXml(xml: string): RegistryTrial[] {
  const trials: RegistryTrial[] = [];
  const blocks = xml.split("<trial>").slice(1);

  for (const block of blocks) {
    const id = block.match(/<isrctnId>([^<]+)/)?.[1];
    const title = block.match(/<title>([^<]+)/)?.[1];
    const status = block.match(/<recruitmentStatus>([^<]+)/)?.[1];
    const phase = block.match(/<phase>([^<]+)/)?.[1];

    if (!id || !title) continue;

    trials.push({
      registry: "ISRCTN",
      trialId: id,
      title: title.trim(),
      phase: phase?.trim() || "Not specified",
      summary: "ISRCTN registered trial.",
      status: status?.trim() ?? "Unknown",
      locations: [],
      eligibilityText: "",
      url: `https://www.isrctn.com/${id}`,
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
