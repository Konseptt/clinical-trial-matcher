export const SITE_URL = "https://clinicaltrial.world";
export const SITE_HOST = "clinicaltrial.world";

export function absoluteUrl(path: string): string {
  if (path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
