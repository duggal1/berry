import { AnalysisCore } from "@/lib/schema";
import type { Edge, Module, Step } from "@/lib/schema";
import type { Repository } from "./ingest";
import { supportsLink } from "./scan";
import type { FactSheet } from "./scan";

export type VerifyResult = {
  analysis: AnalysisCore;
  failures: string[];
  dropped: number;
  repaired: number;
  essential: boolean;
};

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "module";

const firstWords = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(" ");

function snippetAppears(file: string, snippet: string): boolean {
  if (!snippet) return false;
  const trimmed = snippet.trim();
  if (trimmed.length > 120) return false;
  if (trimmed.includes("\n")) return false;
  return file.split(/\r?\n/).some((line) => line.includes(trimmed));
}

function fallbackSummary(modules: Module[], repo: string): string[] {
  if (!modules.length) return [`This repository, ${repo}, has no readable source files.`];
  return [
    `${repo} is made up of ${modules.length} parts.`,
    ...modules.slice(0, 5).map((m) => `${m.name} owns ${m.purpose.replace(/\.$/, "").toLowerCase()}.`),
  ];
}

/** Step 6 of the pipeline: every claim is checked against the repository before it ships. */
export function verify(core: AnalysisCore, repo: Repository, facts: FactSheet): VerifyResult {
  const failures: string[] = [];
  let dropped = 0;
  let repaired = 0;

  const modules: Module[] = [];
  const moduleIds = new Set<string>();

  for (const raw of core.modules ?? []) {
    let id = slug(raw.id || raw.name);
    if (!id) continue;
    while (moduleIds.has(id)) id = `${id}-${modules.length + 1}`;
    if (id !== slug(raw.id || raw.name)) repaired += 1;

    const files = (raw.files ?? []).filter((f) => repo.files.has(f));
    const keptFiles = files.length === (raw.files ?? []).length ? files : files;
    if (keptFiles.length !== (raw.files ?? []).length) repaired += 1;

    const external = raw.kind === "external";
    if (!external && keptFiles.length === 0) {
      dropped += 1;
      failures.push(`module ${raw.name} listed files that do not exist, so it was dropped`);
      continue;
    }

    let path = raw.path ?? "";
    if (path && path !== "external" && !keptFiles.some((f) => f.startsWith(path.replace(/\/$/, "") + "/"))) {
      const first = keptFiles[0];
      path = first ? first.split("/").slice(0, -1).join("/") || "." : path;
      repaired += 1;
    }

    const name = firstWords(raw.name ?? id, 3);

    // An outside service has no files in this repo. If the model listed files, it is not
    // external, and the sketch must draw it as a real module.
    let kind = raw.kind;
    if (kind === "external" && keptFiles.length > 0) {
      kind = "service";
      repaired += 1;
    }

    modules.push({
      id,
      name,
      role: raw.role,
      kind,
      purpose: raw.purpose ?? "",
      path: path || (kind === "external" ? "external" : "."),
      files: kind === "external" ? [] : keptFiles,
      group: raw.group ?? "",
    });
    moduleIds.add(id);
  }

  const limited = modules.slice(0, 12);
  if (limited.length < modules.length) dropped += modules.length - limited.length;

  const byId = new Map(limited.map((m) => [m.id, m]));
  const edges: Edge[] = [];
  const edgeIds = new Set<string>();

  for (const raw of core.edges ?? []) {
    let id = slug(raw.id || `${raw.from}-${raw.to}`) || "edge";
    while (edgeIds.has(id)) id = `${id}-${edges.length + 1}`;

    if (!byId.has(raw.from) || !byId.has(raw.to) || raw.from === raw.to) {
      dropped += 1;
      failures.push(`edge ${raw.from} to ${raw.to} pointed at a module that does not exist`);
      continue;
    }

    const path = raw.evidence?.path ?? "";
    const file = repo.files.get(path);
    if (!file) {
      dropped += 1;
      failures.push(`edge ${raw.from} to ${raw.to} cited ${path || "no file"}, which does not exist`);
      continue;
    }

    let snippet = (raw.evidence?.snippet ?? "").trim();
    if (!snippetAppears(file, snippet)) {
      dropped += 1;
      failures.push(
        `edge ${raw.from} to ${raw.to} cited a line in ${path} that is not in the file verbatim`,
      );
      continue;
    }
    if (snippet.length > 120) {
      snippet = snippet.slice(0, 120);
      repaired += 1;
    }

    let inferred = raw.inferred !== false;
    if (!inferred) {
      const from = byId.get(raw.from)!;
      const to = byId.get(raw.to)!;
      const supported = supportsLink(facts, from.files, to.files, to, path);
      if (!supported) {
        inferred = true;
        repaired += 1;
        failures.push(
          `edge ${raw.from} to ${raw.to} was not backed by the fact sheet, so it is now marked inferred`,
        );
      }
    }

    edges.push({
      id,
      from: raw.from,
      to: raw.to,
      kind: raw.kind,
      label: firstWords(raw.label ?? raw.kind, 3),
      inferred,
      evidence: { path, snippet },
    });
    edgeIds.add(id);
  }

  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const flow: Step[] = [];
  const stepIds = new Set<string>();

  for (const raw of core.flow ?? []) {
    if (!byId.has(raw.moduleId)) {
      dropped += 1;
      failures.push(`flow step "${raw.title}" referenced a module that does not exist`);
      continue;
    }
    let edgeId = raw.edgeId ?? "";
    if (edgeId && !edgeById.has(edgeId)) {
      edgeId = "";
      repaired += 1;
    }
    if (edgeId) {
      const edge = edgeById.get(edgeId)!;
      if (edge.from !== raw.moduleId && edge.to !== raw.moduleId) {
        edgeId = "";
        repaired += 1;
      }
    }
    let id = slug(raw.id || raw.title) || "step";
    while (stepIds.has(id)) id = `${id}-${flow.length + 1}`;
    stepIds.add(id);
    flow.push({
      id,
      moduleId: raw.moduleId,
      edgeId,
      title: firstWords(raw.title ?? "", 4),
      text: raw.text ?? "",
    });
    if (flow.length >= 8) break;
  }

  const summary = (core.summary ?? []).filter((s) => typeof s === "string" && s.trim()).slice(0, 8);
  const stack = [...new Set((core.stack ?? []).filter((s) => typeof s === "string" && s.trim()))].slice(0, 12);

  const interview = {
    pitch: core.interview?.pitch ?? "",
    tradeoffs: (core.interview?.tradeoffs ?? []).filter(Boolean).slice(0, 5),
    questions: (core.interview?.questions ?? [])
      .filter((q) => q && typeof q.q === "string" && typeof q.a === "string")
      .slice(0, 8),
  };

  const analysis: AnalysisCore = AnalysisCore.parse({
    meta: {
      repo: repo.repo,
      sha: repo.sha,
      title: core.meta?.title?.trim() || repo.repo,
      generatedAt: new Date().toISOString(),
    },
    summary: summary.length ? summary : fallbackSummary(limited, repo.repo),
    stack,
    modules: limited,
    edges,
    flow,
    interview,
  });

  const essential = analysis.modules.length === 0 || analysis.edges.length === 0;

  return { analysis, failures, dropped, repaired, essential };
}
