import { config, HttpError } from "@/server/config";
import { ShareBody } from "@/server/contract";
import { putShare } from "@/server/share";
import { BodyTooLargeError, readBoundedJson } from "@/server/body";
import { checkRateLimit, clientKey } from "@/server/limits";


const MAX_BODY = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const cfg = config();

  let body: unknown;
  try {
    body = await readBoundedJson(req, MAX_BODY);
  } catch (e) {
    if (e instanceof BodyTooLargeError) {
      return Response.json({ message: "That analysis is too large to share." }, { status: 413 });
    }
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
