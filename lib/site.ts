export const SITE_URL = "https://clinicaltrial.ranjansharma.info.np";
export const SITE_HOST = "clinicaltrial.ranjansharma.info.np";

export function absoluteUrl(path: string): string {
  if (path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
