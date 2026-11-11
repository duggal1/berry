import { strFromU8, unzipSync } from "fflate";
import ignore from "ignore";
import { ArchiveLimitExceeded, createArchiveFilter } from "./archive-budget";
import { config, HttpError } from "./config";

export type RepoRef = { owner: string; name: string; repo: string };

export type SkipCounts = {
  dependency: number;
  build: number;
  vcs: number;
  lockfile: number;
  binary: number;
  font: number;
  minified: number;
  large: number;
  gitignore: number;
  unreadable: number;
};

export type Repository = {
  repo: string;
  owner: string;
  name: string;
  sha: string;
  branch: string;
  private: boolean;
  files: Map<string, string>;
  bytes: number;
  skipped: SkipCounts;
};

export const emptySkips = (): SkipCounts => ({
  dependency: 0,
  build: 0,
  vcs: 0,
  lockfile: 0,
  binary: 0,
  font: 0,
  minified: 0,
  large: 0,
  gitignore: 0,
  unreadable: 0,
});

const DEPENDENCY_DIRS = new Set([
  "node_modules",
  "bower_components",
  "vendor",
  "Pods",
  ".pnpm",
  ".yarn",
  "site-packages",
  "jspm_packages",
]);

const BUILD_DIRS = new Set([
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  "target",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".gradle",
  ".terraform",
  ".idea",
  ".vscode",
]);

const VCS_DIRS = new Set([".git", ".hg", ".svn", ".bzr"]);

const LOCKFILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  "pipfile.lock",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "packages.lock.json",
]);

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff", "heic",
  "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "flac", "ogg", "m4a", "aac",
  "pdf", "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "jar", "war", "ear",
  "class", "exe", "dll", "so", "dylib", "bin", "wasm", "pyc", "pyo", "o", "a",
  "db", "sqlite", "sqlite3", "pack", "idx", "onnx", "pt", "pth", "h5", "parquet",
]);

const FONT_EXT = new Set(["woff", "woff2", "ttf", "otf", "eot", "fon"]);

/** Only github.com/owner/repo is accepted. Everything else is rejected before any network call. */
export function parseRepoUrl(input: string): RepoRef | null {
  const s = input.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/.*)?$/i);
  if (!m) return null;
  const owner = m[1];
  const name = m[2];
  if (!/^[\w-]+$/.test(owner)) return null;
  if (!/^[\w.-]+$/.test(name)) return null;
  if (name === "." || name === "..") return null;
  return { owner, name, repo: `${owner}/${name}` };
}

export function githubHeaders(userToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": "repo-explainer",
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  const token = userToken?.trim() || config().GITHUB_TOKEN.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function github(path: string, userToken: string | null, signal: AbortSignal): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(userToken),
    signal,
    cache: "no-store",
    redirect: "follow",
  });
  if (res.ok) return res;

  const authenticated = Boolean(userToken?.trim() || config().GITHUB_TOKEN.trim());
  if (res.status === 404) {
    throw new HttpError(
      404,
      authenticated
        ? `Repository not found, or the token cannot read ${path.split("/")[2] ?? "this repository"}.`
        : "Repository not found. A private repository needs a GitHub token.",
    );
  }
  if (res.status === 401) throw new HttpError(401, "The GitHub token was rejected.");
  if (res.status === 403 || res.status === 429) {
    throw new HttpError(429, "GitHub rate limit reached. Try again in a few minutes.");
  }
  throw new HttpError(502, `GitHub request failed (${res.status}).`);
}

export type Resolved = {
  ref: RepoRef;
  sha: string;
  branch: string;
  private: boolean;
  sizeKb: number;
};

/** Step 2 of the pipeline: default branch, latest commit sha, and whether the repo is private. */
export async function resolve(ref: RepoRef, userToken: string | null, signal: AbortSignal): Promise<Resolved> {
  const meta = (await (
    await github(`/repos/${ref.owner}/${ref.name}`, userToken, signal)
  ).json()) as { default_branch?: string; private?: boolean; size?: number };

  const branch = meta.default_branch ?? "main";
  const commit = (await (
    await github(`/repos/${ref.owner}/${ref.name}/commits/${encodeURIComponent(branch)}`, userToken, signal)
  ).json()) as { sha?: string };

  const sha = commit.sha;
  if (!sha) throw new HttpError(502, "GitHub did not return a commit for this repository.");

  return {
    ref,
    sha,
    branch,
    private: Boolean(meta.private),
    sizeKb: meta.size ?? 0,
  };
}

/** Proves the caller can read a repository right now. Used before serving a cached private result. */
export async function canRead(ref: RepoRef, userToken: string | null, signal: AbortSignal): Promise<boolean> {
  if (!userToken?.trim()) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.name}`, {
      headers: githubHeaders(userToken),
      signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

function skipReason(path: string): keyof SkipCounts | null {
  const parts = path.split("/");
  const base = parts[parts.length - 1];
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1).toLowerCase() : "";

  for (const part of parts.slice(0, -1)) {
    if (VCS_DIRS.has(part)) return "vcs";
    if (DEPENDENCY_DIRS.has(part)) return "dependency";
    if (BUILD_DIRS.has(part)) return "build";
  }
  if (LOCKFILES.has(base.toLowerCase())) return "lockfile";
  if (base.endsWith(".min.js") || base.endsWith(".min.css") || base.endsWith(".map")) return "minified";
  if (FONT_EXT.has(ext)) return "font";
  if (BINARY_EXT.has(ext)) return "binary";
  return null;
}

/** Step 3 of the pipeline: download the archive, extract it in memory, drop what is not source. */
export async function ingest(resolved: Resolved, userToken: string | null, signal: AbortSignal): Promise<Repository> {
  const cfg = config();
  const { ref, sha, branch } = resolved;

  if (resolved.sizeKb * 1024 > cfg.MAX_ARCHIVE_BYTES) {
    throw new HttpError(413, "This repository is too large to analyze.");
  }

  const res = await github(`/repos/${ref.owner}/${ref.name}/zipball/${sha}`, userToken, signal);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared && declared > cfg.MAX_ARCHIVE_BYTES) {
    throw new HttpError(413, "This repository is too large to analyze.");
  }

  const archive = new Uint8Array(await res.arrayBuffer());
  if (archive.length > cfg.MAX_ARCHIVE_BYTES) {
    throw new HttpError(413, "This repository is too large to analyze.");
  }

  const skipped = emptySkips();
  const budget = createArchiveFilter({
    maxFileBytes: cfg.MAX_FILE_BYTES,
    maxTotalBytes: cfg.MAX_TOTAL_BYTES,
    maxFiles: cfg.MAX_FILES,
  });
  let entries: ReturnType<typeof unzipSync>;
  try {
    entries = unzipSync(archive, {
      filter(file) {
        if (file.name.endsWith("/")) return false;
        const reason = skipReason(file.name);
        if (reason) {
          skipped[reason] += 1;
          return false;
        }
        if (file.originalSize > cfg.MAX_FILE_BYTES) {
          skipped.large += 1;
          return false;
        }
        return budget(file);
      },
    });
  } catch (e) {
    if (e instanceof ArchiveLimitExceeded) throw new HttpError(413, e.message);
    throw e;
  }
  const names = Object.keys(entries);
  const prefix = names.length ? `${names[0].split("/")[0]}/` : "";

  const gitignoreRaw = entries[`${prefix}.gitignore`];
  const rules = ignore().add(gitignoreRaw ? strFromU8(gitignoreRaw) : "");

  const files = new Map<string, string>();
  let bytes = 0;

  for (const [full, data] of Object.entries(entries)) {
    const path = full.slice(prefix.length);
    if (!path || path.endsWith("/")) continue;

    const reason = skipReason(path);
    if (reason) {
      skipped[reason] += 1;
      continue;
    }
    if (data.length > cfg.MAX_FILE_BYTES) {
      skipped.large += 1;
      continue;
    }
    if (rules.ignores(path)) {
      skipped.gitignore += 1;
      continue;
    }
    const head = data.subarray(0, 4096);
    if (head.includes(0)) {
      skipped.unreadable += 1;
      continue;
    }

    let text: string;
    try {
      text = strFromU8(data);
    } catch {
      skipped.unreadable += 1;
      continue;
    }
    if (text.includes(" ")) {
      skipped.unreadable += 1;
      continue;
    }

    bytes += data.length;
    if (bytes > cfg.MAX_TOTAL_BYTES) {
      throw new HttpError(413, "This repository is too large to analyze.");
    }
    if (files.size >= cfg.MAX_FILES) {
      throw new HttpError(413, "This repository has too many files to analyze.");
    }
    files.set(path, text);
  }

  if (!files.size) throw new HttpError(422, "This repository has no readable source files.");

  return {
    repo: ref.repo,
    owner: ref.owner,
    name: ref.name,
    sha,
    branch,
    private: resolved.private,
    files,
    bytes,
    skipped,
  };
}
