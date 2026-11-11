import { config, HttpError } from "@/server/config";
import { ShareBody } from "@/server/contract";
import { putShare } from "@/server/share";
import { checkRateLimit, clientKey } from "@/server/limits";


const MAX_BODY = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const cfg = config();

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared && declared > MAX_BODY) {
    return Response.json({ message: "That analysis is too large to share." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }

  const parsed = ShareBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: "That analysis is not valid." }, { status: 400 });
  }

  try {
    checkRateLimit(clientKey(req), cfg.RATE_SHARE, cfg.RATE_WINDOW_MS);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Too many requests.";
    return Response.json({ message }, { status: 429 });
  }

  try {
    const id = await putShare(parsed.data);
    return Response.json({ id });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Could not store this analysis.";
    return Response.json({ message }, { status });
  }
}
