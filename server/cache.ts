import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { AnalysisCore } from "@/lib/schema";
import { config } from "./config";

const ANALYSIS_CACHE_VERSION = 5;

export type CacheRecord = {
  version?: number;
  repo: string;
  sha: string;
  private: boolean;
  analysis: AnalysisCore;
  prompt: string;
  createdAt: number;
};

const dir = () => path.join(process.cwd(), config().DATA_DIR, "cache");

const key = (repo: string, sha: string) =>
  `${repo.replace(/[^\w.-]+/g, "_")}~${sha}`.slice(0, 180);

/** The verified analysis and prompt for one commit. */
export async function getCache(repo: string, sha: string): Promise<CacheRecord | null> {
  try {
    const raw = await readFile(path.join(dir(), `${key(repo, sha)}.json`), "utf8");
    return parseCache(raw);
  } catch {
    return null;
  }
}

export async function putCache(record: CacheRecord): Promise<void> {
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  const dest = path.join(dir(), `${key(record.repo, record.sha)}.json`);
  const temp = `${dest}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    // A same-directory rename prevents readers observing half-written JSON.
    await writeFile(temp, JSON.stringify({ ...record, version: ANALYSIS_CACHE_VERSION }), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temp, dest);
  } finally {
    await rm(temp, { force: true });
  }
}

export function parseCache(raw: string): CacheRecord | null {
  try {
    const value = JSON.parse(raw) as CacheRecord;
    if (value.version !== ANALYSIS_CACHE_VERSION) return null;
    const analysis = AnalysisCore.safeParse(value.analysis);
    if (!analysis.success || typeof value.prompt !== "string") return null;
    return { ...value, analysis: analysis.data };
  } catch {
    return null;
  }
}
