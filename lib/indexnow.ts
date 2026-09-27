import { listKnownConditions } from "@/lib/normalization";
import { fetchRecruitingStudies } from "@/lib/public-studies";
import { SITE_HOST, SITE_URL, absoluteUrl } from "@/lib/site";

export interface IndexNowBody {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export function indexNowKeyLocation(key: string): string {
  return absoluteUrl(`/${key}.txt`);
}

export function indexNowBody(key: string, urlList: string[]): IndexNowBody {
  return {
    host: SITE_HOST,
    key,
    keyLocation: indexNowKeyLocation(key),
    urlList,
  };
}

export async function submitIndexNow(urlList: string[]): Promise<{
  submitted: number;
  status: number | null;
  skipped?: string;
}> {
  const key = process.env.INDEXNOW_KEY?.trim() ?? "";
  if (!/^[A-Za-z0-9]{8,128}$/.test(key)) {
    return { submitted: 0, status: null, skipped: "INDEXNOW_KEY is not set" };
  }

  const unique = [...new Set(urlList)].slice(0, 10000);
  if (unique.length === 0) {
    return { submitted: 0, status: null, skipped: "No URLs" };
  }

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowBody(key, unique)),
  });

  return { submitted: unique.length, status: response.status };
}

export function publicPageUrls(): string[] {
  return [
    absoluteUrl("/"),
    absoluteUrl("/how-matching-works"),
    absoluteUrl("/conditions"),
    ...listKnownConditions().map((condition) =>
      absoluteUrl(`/conditions/${condition.slug}`)
    ),
  ];
}

export async function collectIndexNowUrls(): Promise<string[]> {
  const conditions = listKnownConditions();
  const snapshots = await Promise.all(conditions.map((condition) => fetchRecruitingStudies(condition)));
  const seen = new Set<string>();
  const trialUrls: string[] = [];

  for (const snapshot of snapshots) {
    for (const study of snapshot.studies) {
      if (seen.has(study.nctId)) continue;
      seen.add(study.nctId);
      trialUrls.push(absoluteUrl(`/trials/${study.nctId}`));
    }
  }

  return [...publicPageUrls(), ...trialUrls];
}

export { SITE_URL };
