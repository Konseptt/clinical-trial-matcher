import type { RegistryTrial } from "./types";

export const WHO_PORTAL_BASE = "https://trialsearch.who.int";

export function extractHiddenField(html: string, fieldId: string): string {
  const pattern = new RegExp(`id="${fieldId}"[^>]*value="([^"]*)"`, "i");
  return html.match(pattern)?.[1] ?? "";
}

export function parseSetCookieHeader(
  headers: Headers
): string {
  const getSetCookie = headers.getSetCookie?.bind(headers);
  if (getSetCookie) {
    return getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  }

  const raw = headers.get("set-cookie");
  if (!raw) return "";
  return raw
    .split(/,(?=\s*[^;,]+=)/)
    .map((cookie) => cookie.split(";")[0].trim())
    .join("; ");
}

export function parseWhoSearchResults(html: string): RegistryTrial[] {
  const trials: RegistryTrial[] = [];
  const blocks = html.split("DataList1_ctl").slice(1);

  for (const block of blocks) {
    const trialIdMatch = block.match(/TrialID=([A-Za-z0-9-]+)/);
    const titleMatch = block.match(/Public_titleLabel">([^<]+)</);
    const statusMatch = block.match(/Recruitment_statusLabel[^>]*>([^<]+)</);
    const phaseMatch = block.match(/PhaseLabel[^>]*>([^<]+)</);
    const registryMatch = block.match(/Primary_sponsorLabel[^>]*>([^<]+)</);

    if (!trialIdMatch || !titleMatch) continue;

    const trialId = trialIdMatch[1];
    trials.push({
      registry: "WHO ICTRP",
      trialId,
      title: titleMatch[1].trim(),
      phase: phaseMatch?.[1]?.trim() || "Not specified",
      // The WHO results page exposes the sponsor, not a study abstract. Label it
      // as such so it is not mistaken for a trial summary.
      summary: registryMatch?.[1]?.trim()
        ? `Sponsor: ${registryMatch[1].trim()}`
        : "WHO ICTRP indexed trial.",
      status: statusMatch?.[1]?.trim() ?? "Unknown",
      locations: [],
      eligibilityText: "",
      url: `${WHO_PORTAL_BASE}/Trial2.aspx?TrialID=${encodeURIComponent(trialId)}`,
    });
  }

  return trials;
}

export function buildWhoSearchBody(
  html: string,
  condition: string
): URLSearchParams {
  return new URLSearchParams({
    __VIEWSTATE: extractHiddenField(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: extractHiddenField(html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: extractHiddenField(html, "__EVENTVALIDATION"),
    TextBox1: condition || "cancer",
    Button1: "Search",
  });
}
