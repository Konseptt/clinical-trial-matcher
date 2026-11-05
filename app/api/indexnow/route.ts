import { timingSafeEqual } from "node:crypto";
import { collectIndexNowUrls, submitIndexNow } from "@/lib/indexnow";

function isAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  // Fail closed in every environment: preview deployments are public too.
  if (!isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET?.trim())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const urls = await collectIndexNowUrls();
  const result = await submitIndexNow(urls);
  return Response.json({ urls: urls.length, ...result });
}
