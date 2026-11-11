import { HttpError } from "./config";

const hits = new Map<string, number[]>();

/** Identify the caller well enough to rate limit them. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "local";
}

/** One request per window, per client. */
export function checkRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    throw new HttpError(429, "Too many requests from this client. Try again in a few minutes.");
  }
  list.push(now);
  hits.set(key, list);

  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
}
