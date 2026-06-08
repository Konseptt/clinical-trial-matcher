import type { RegistryTrial } from "./types";
import {
  WHO_PORTAL_BASE,
  buildWhoSearchBody,
  parseWhoSearchResults,
} from "./who-ictrp-shared";

const BROWSER_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const WHO_FETCH_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = WHO_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function queryWhoIctrpFromBrowser(
  condition: string
): Promise<RegistryTrial[]> {
  const session = await fetchWithTimeout(`${WHO_PORTAL_BASE}/Default.aspx`, {
    method: "GET",
    credentials: "include",
    headers: BROWSER_HEADERS,
  });

  if (!session.ok) {
    throw new Error(`WHO ICTRP session error: ${session.status}`);
  }

  const html = await session.text();
  if (html.includes("NoAccess.aspx")) {
    throw new Error("WHO ICTRP blocked this search session.");
  }

  const body = buildWhoSearchBody(html, condition);

  const response = await fetchWithTimeout(`${WHO_PORTAL_BASE}/Default.aspx`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...BROWSER_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${WHO_PORTAL_BASE}/Default.aspx`,
    },
    body: body.toString(),
  });

  const resultHtml = await response.text();
  if (resultHtml.includes("NoAccess.aspx")) {
    throw new Error("WHO ICTRP blocked the search request.");
  }

  return parseWhoSearchResults(resultHtml);
}
