import type { RegistryQueryResult, RegistrySearchParams } from "./types";
import { REGISTRY_TIMEOUT_MS } from "./types";
import {
  WHO_PORTAL_BASE,
  buildWhoSearchBody,
  parseSetCookieHeader,
  parseWhoSearchResults,
} from "./who-ictrp-shared";

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

async function postWhoSearch(
  params: RegistrySearchParams
): Promise<ReturnType<typeof parseWhoSearchResults>> {
  const session = await fetch(`${WHO_PORTAL_BASE}/Default.aspx`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 0 },
    redirect: "manual",
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });

  if (!session.ok) {
    throw new Error(`WHO ICTRP session error: ${session.status}`);
  }

  const html = await session.text();
  if (html.includes("NoAccess.aspx")) {
    throw new Error("WHO_ICTRP_BROWSER_REQUIRED");
  }

  const cookieHeader = parseSetCookieHeader(session.headers);
  const cleanCondition = buildSearchQuery(params);
  const body = buildWhoSearchBody(html, cleanCondition);

  const response = await fetch(`${WHO_PORTAL_BASE}/Default.aspx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      Cookie: cookieHeader,
      Referer: `${WHO_PORTAL_BASE}/Default.aspx`,
    },
    body: body.toString(),
    next: { revalidate: 0 },
    redirect: "manual",
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });

  // WHO answers bot POSTs with 302 → /NoAccess.aspx; following it hangs ~240s then 504s.
  if (!response.ok) {
    throw new Error("WHO_ICTRP_BROWSER_REQUIRED");
  }

  const resultHtml = await response.text();
  if (resultHtml.includes("NoAccess.aspx")) {
    throw new Error("WHO_ICTRP_BROWSER_REQUIRED");
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
    console.warn("WHO ICTRP server search failed:", error instanceof Error ? error.message : error);
    return {
      registry: "WHO ICTRP",
      queryTerms: params.terms,
      trials: [],
      // Any server-side failure (bot block, timeout, 5xx) → let the browser retry.
      error: "WHO_ICTRP_BROWSER_REQUIRED",
    };
  }
}
