import { config, HttpError } from "@/server/config";
import { AnalyzeBody } from "@/server/contract";
import { canRead, ingest, parseRepoUrl, resolve } from "@/server/ingest";
import type { Resolved } from "@/server/ingest";
import { scan } from "@/server/scan";
import { explore } from "@/server/explore";
import { verify } from "@/server/verify";
import { writeBrief } from "@/server/brief";
import { getCache, putCache } from "@/server/cache";
import { chunkText, eventStream } from "@/server/sse";
import { checkRateLimit, clientKey } from "@/server/limits";

export const maxDuration = 300;

const statusOf = (e: unknown) => (e instanceof HttpError ? e.status : 502);
const messageOf = (e: unknown) => (e instanceof Error ? e.message : "The request failed.");

const skippedTotal = (s: Record<string, number>) =>
  Object.values(s).reduce((a, b) => a + b, 0);

export async function POST(req: Request) {
  const cfg = config();
  if (!cfg.REFLECTION_API_KEY) {
    return Response.json({ message: "The AI provider is not configured on this server." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }
  const parsed = AnalyzeBody.safeParse(body);
  if (!parsed.success) return Response.json({ message: "Send a repository URL." }, { status: 400 });

  const ref = parseRepoUrl(parsed.data.url);
  if (!ref) {
    return Response.json({ message: "Use a GitHub URL like github.com/owner/repo." }, { status: 400 });
  }

  try {
    checkRateLimit(clientKey(req), cfg.RATE_ANALYZE, cfg.RATE_WINDOW_MS);
  } catch (e) {
    return Response.json({ message: messageOf(e) }, { status: statusOf(e) });
  }

  const userToken = req.headers.get("x-github-token")?.trim() || null;

  let resolved: Resolved;
  try {
    resolved = await resolve(ref, userToken, req.signal);
  } catch (e) {
    return Response.json({ message: messageOf(e) }, { status: statusOf(e) });
  }

  return eventStream(async (send) => {
    send("stage", {
      id: "resolve",
      label: "Repository found",
      detail: `${resolved.ref.repo} at ${resolved.sha.slice(0, 7)} on ${resolved.branch}.`,
    });

    const cached = await getCache(resolved.ref.repo, resolved.sha);
    if (cached) {
      const allowed = !cached.private || (await canRead(resolved.ref, userToken, req.signal));
      if (allowed) {
        send("stage", {
          id: "cache",
          label: "Same commit",
          detail: "This commit was already analysed, so the result replays instantly.",
        });
        send("analysis", cached.analysis);
        for (const chunk of chunkText(cached.prompt)) send("prompt", { text: chunk });
        send("done", {});
        return;
      }
    }

    send("stage", {
      id: "ingest",
      label: "Reading files",
      detail: "Downloading the archive and dropping what is not source.",
    });
    const repo = await ingest(resolved, userToken, req.signal);
    send("stage", {
      id: "ingest",
      label: "Files collected",
      detail: `${repo.files.size} files read, ${skippedTotal(repo.skipped)} skipped.`,
    });

    send("stage", {
      id: "scan",
      label: "Mapping the code",
      detail: "Imports, manifests, entry points and outside services.",
    });
    const facts = scan(repo.repo, repo.sha, repo.files);

    send("stage", {
      id: "explore",
      label: "Exploring",
      detail: "The agent is reading the repository.",
    });
    let explored = await explore({
      repo,
      facts,
      signal: req.signal,
      onProgress: (detail) =>
        send("stage", { id: "explore", label: "Exploring", detail: `The agent is reading the repository. ${detail}.` }),
    });

    send("stage", {
      id: "verify",
      label: "Checking every claim",
      detail: "Modules, files and links against the real code.",
    });
    let checked = verify(explored.analysis, repo, facts);

    if (checked.essential) {
      send("stage", {
        id: "explore",
        label: "Fixing the gaps",
        detail: `${checked.failures.length} claims failed the check. Trying once more.`,
      });
      explored = await explore({
        repo,
        facts,
        feedback: checked.failures.slice(0, 12),
        signal: req.signal,
      });
      checked = verify(explored.analysis, repo, facts);
    }

    if (!checked.analysis.modules.length) {
      throw new Error("Nothing in this repository could be verified against the code.");
    }

    send("analysis", checked.analysis);

    send("stage", {
      id: "brief",
      label: "Writing the brief",
      detail: "The prompt that briefs your coding agent.",
    });
    let brief = "";
    for await (const text of writeBrief(checked.analysis, facts, req.signal)) {
      brief += text;
      send("prompt", { text });
    }

    await putCache({
      repo: repo.repo,
      sha: repo.sha,
      private: repo.private,
      analysis: checked.analysis,
      prompt: brief,
      createdAt: Date.now(),
    });

    send("done", {});
  });
}
