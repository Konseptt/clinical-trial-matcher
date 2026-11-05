import { absoluteUrl } from "@/lib/site";

/** schema.org BreadcrumbList from [name, path] pairs. */
export function breadcrumbs(items: Array<[string, string]>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: absoluteUrl(path),
    })),
  };
}

/** Serialize JSON-LD safely for a <script> tag. */
export function jsonLdHtml(data: object): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
