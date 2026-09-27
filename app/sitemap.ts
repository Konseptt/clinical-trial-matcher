import type { MetadataRoute } from "next";
import { listKnownConditions } from "@/lib/normalization";
import { fetchRecruitingStudies } from "@/lib/public-studies";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const conditions = listKnownConditions();
  const snapshots = await Promise.all(
    conditions.map((condition) => fetchRecruitingStudies(condition))
  );

  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    {
      url: absoluteUrl("/how-matching-works"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/conditions"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  conditions.forEach((condition, index) => {
    const snapshot = snapshots[index];
    pages.push({
      url: absoluteUrl(`/conditions/${condition.slug}`),
      lastModified: snapshot?.fetchedAt ? new Date(snapshot.fetchedAt) : now,
      changeFrequency: "daily",
      priority: 0.6,
    });
  });

  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    for (const study of snapshot.studies) {
      if (seen.has(study.nctId)) continue;
      seen.add(study.nctId);
      pages.push({
        url: absoluteUrl(`/trials/${study.nctId}`),
        lastModified: study.registryUpdated
          ? new Date(study.registryUpdated)
          : now,
        changeFrequency: "daily",
        priority: 0.5,
      });
    }
  }

  return pages;
}
