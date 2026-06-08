import type { RegistryQueryResult, RegistrySearchParams, RegistryTrial } from "./types";

const PORTAL_BASE = "https://trialsearch.who.int";

function extractHiddenField(html: string, fieldId: string): string {
  const pattern = new RegExp(
    `id="${fieldId}"[^>]*value="([^"]*)"`,
    "i"
  );
  return html.match(pattern)?.[1] ?? "";
}

function parseWhoSearchResults(html: string): RegistryTrial[] {
  const trials: RegistryTrial[] = [];
  const blocks = html.split("DataList1_ctl").slice(1);

  for (const block of blocks) {
    const trialIdMatch = block.match(
      /TrialID=([A-Za-z0-9-]+)/
    );
    const titleMatch = block.match(
      /Public_titleLabel">([^<]+)</
    );
    const statusMatch = block.match(
      /Recruitment_statusLabel[^>]*>([^<]+)</
    );
    const phaseMatch = block.match(/PhaseLabel[^>]*>([^<]+)</);
    const registryMatch = block.match(
      /Primary_sponsorLabel[^>]*>([^<]+)</
    );

    if (!trialIdMatch || !titleMatch) continue;

    const trialId = trialIdMatch[1];
    trials.push({
      registry: "WHO ICTRP",
      trialId,
      title: titleMatch[1].trim(),
      phase: phaseMatch?.[1]?.trim() || "Not specified",
      summary: registryMatch?.[1]?.trim() ?? "WHO ICTRP indexed trial.",
      status: statusMatch?.[1]?.trim() ?? "Unknown",
      locations: [],
      eligibilityText: "",
      url: `${PORTAL_BASE}/Trial2.aspx?TrialID=${encodeURIComponent(trialId)}`,
    });
  }

  return trials;
}

function sanitizeQueryParam(val: string): string {
  return val.replace(/[^a-zA-Z0-9\s\-\/]/g, "").trim();
}

async function postWhoSearch(
  params: RegistrySearchParams
): Promise<RegistryTrial[]> {
  const session = await fetch(`${PORTAL_BASE}/Default.aspx`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TrialRegistryBot/1.0; clinical-trial-matching)",
      Accept: "text/html",
    },
    next: { revalidate: 0 },
  });

  if (!session.ok) {
    throw new Error(`WHO ICTRP session error: ${session.status}`);
  }

  const html = await session.text();
  if (html.includes("NoAccess.aspx")) {
    throw new Error(
      "WHO ICTRP blocks automated search from this environment. Use ClinicalTrials.gov or EU-CTR results, or search manually at trialsearch.who.int."
    );
  }

  const cleanCondition = sanitizeQueryParam(params.condition);

  const body = new URLSearchParams({
    __VIEWSTATE: extractHiddenField(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: extractHiddenField(html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: extractHiddenField(html, "__EVENTVALIDATION"),
    TextBox1: cleanCondition || "cancer",
    Button1: "Search",
  });

  const response = await fetch(`${PORTAL_BASE}/Default.aspx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (compatible; TrialRegistryBot/1.0; clinical-trial-matching)",
      Accept: "text/html",
      Cookie: session.headers.get("set-cookie") ?? "",
      Referer: `${PORTAL_BASE}/Default.aspx`,
    },
    body: body.toString(),
    next: { revalidate: 0 },
  });

  const resultHtml = await response.text();
  if (resultHtml.includes("NoAccess.aspx")) {
    throw new Error(
      "WHO ICTRP search POST blocked. The portal requires browser-based access."
    );
  }

  return parseWhoSearchResults(resultHtml);
}

export async function queryWhoIctrp(
  params: RegistrySearchParams
): Promise<RegistryQueryResult> {
  try {
    const trials = await postWhoSearch(params);
    return {
      registry: "WHO ICTRP",
      queryTerms: params.terms,
      trials,
    };
  } catch (error) {
    return {
      registry: "WHO ICTRP",
      queryTerms: params.terms,
      trials: [],
      error:
        error instanceof Error
          ? error.message
          : "WHO ICTRP search unavailable",
    };
  }
}
