import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Analysis } from "@/lib/schema";
import { config, HttpError } from "./config";

const MAX_SHARE_BYTES = 2 * 1024 * 1024;

const dir = () => path.join(process.cwd(), config().DATA_DIR, "share");

/** Store one shared analysis under an unguessable id. */
export async function putShare(analysis: Analysis): Promise<string> {
  const id = randomBytes(24).toString("base64url");
  const body = JSON.stringify({ id, createdAt: Date.now(), analysis });
  if (Buffer.byteLength(body, "utf8") > MAX_SHARE_BYTES) {
    throw new HttpError(413, "This analysis is too large to share.");
  }
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir(), `${id}.json`), body, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return id;
}

/** Read one shared analysis. Nothing else can reach it. */
export async function getShare(id: string): Promise<Analysis | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  try {
    const raw = await readFile(path.join(dir(), `${id}.json`), "utf8");
    const parsed = Analysis.safeParse((JSON.parse(raw) as { analysis?: unknown }).analysis);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
