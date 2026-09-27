import { collectIndexNowUrls, submitIndexNow } from "@/lib/indexnow";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorized = request.headers.get("authorization") === `Bearer ${secret}`;

  if (process.env.VERCEL_ENV === "production") {
    if (!secret || !authorized) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (secret && !authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const urls = await collectIndexNowUrls();
  const result = await submitIndexNow(urls);
  return Response.json({ urls: urls.length, ...result });
}
