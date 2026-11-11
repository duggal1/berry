import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AnalysisCore } from "@/lib/schema";
import { config } from "./config";

const ANALYSIS_CACHE_VERSION = 2;

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
  await mkdir(dir(), { recursive: true });
  await writeFile(
    path.join(dir(), `${key(record.repo, record.sha)}.json`),
    JSON.stringify({ ...record, version: ANALYSIS_CACHE_VERSION }),
    "utf8",
  );
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
