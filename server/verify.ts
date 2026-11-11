import { AnalysisCore, GENERATOR_VERSION, STORY_SCHEMA_VERSION } from "../lib/schema.ts";
import type { Edge, Module, RuntimeEdgeKind, Story, StoryAction, StoryScene } from "../lib/schema.ts";
import type { Repository } from "./ingest";
import { recoverEdges } from "./graph.ts";
import { supportsLink } from "./scan.ts";
import type { FactSheet } from "./scan";
import { normalizeModulePresentation } from "../lib/module-presentation.ts";

export type VerifyResult = {
  analysis: AnalysisCore;
  failures: string[];
  dropped: number;
  repaired: number;
  essential: boolean;
};

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";

const firstWords = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(" ");

function domain(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .slice(0, 64);
}

function tech(raw: string | undefined, kind: Module["kind"]): string {
  const named = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 32);
  if (kind === "external") return named;
  return /^(?:typescript|javascript|tsx?|jsx?|python|ruby|go|rust|java|kotlin|swift|c#|c\+\+|php)$/i.test(named)
    ? ""
    : named;
}

function snippetAppears(file: string, snippet: string): boolean {
  const trimmed = snippet.trim();
  if (!trimmed || trimmed.length > 120 || trimmed.includes("\n")) return false;
  return file.split(/\r?\n/).some((line) => line.trim() === trimmed);
}

function fallbackSummary(modules: Module[], repo: string): string[] {
  if (!modules.length) return [`This repository, ${repo}, has no readable source files.`];
  return [`${repo} is made up of ${modules.length} source-backed parts.`, ...modules.slice(0, 5).map((m) => `${m.name} owns ${m.purpose.replace(/\.$/, "").toLowerCase()}.`)];
}

function isRuntimeKind(kind: Edge["kind"]): kind is RuntimeEdgeKind {
  return kind === "call" || kind === "data" || kind === "event";
}

function idsForAction(action: StoryAction): string[] {
  switch (action.kind) {
    case "enter":
    case "exit":
    case "effect":
    case "spawn":
      return [action.moduleId];
    case "return":
      return [];
    case "traverse":
    case "fork":
    case "join":
    case "outcome":
      return [];
  }
}

/** Validate the final model graph and storyboard together against the pinned source. */
export function verify(core: AnalysisCore, repo: Repository, facts: FactSheet): VerifyResult {
  const failures: string[] = [];
  let dropped = 0;
  let repaired = 0;
  const modules: Module[] = [];
  const moduleIds = new Set<string>();
  const moduleAliases = new Map<string, string | null>();

  function addModuleAlias(raw: string, id: string) {
    if (!raw) return;
    for (const key of [raw, slug(raw)]) {
      const previous = moduleAliases.get(key);
      if (previous === undefined) moduleAliases.set(key, id);
      else if (previous !== id) moduleAliases.set(key, null);
    }
  }

  function resolveModuleId(raw: string): string | null {
    if (moduleAliases.has(raw)) return moduleAliases.get(raw) ?? null;
    const normalized = slug(raw);
    if (moduleAliases.has(normalized)) return moduleAliases.get(normalized) ?? null;
    return raw;
  }

  for (const raw of core.modules) {
    let id = slug(raw.id || raw.name);
    while (moduleIds.has(id)) id = `${slug(raw.id || raw.name)}-${modules.length + 1}`;
    if (id !== raw.id) repaired += 1;

    const files = raw.files.filter((file) => repo.files.has(file));
    if (files.length !== raw.files.length) {
      repaired += 1;
      failures.push(`module ${raw.name} listed source files that do not exist in this commit`);
    }
    const presentation = normalizeModulePresentation({ ...raw, files });
    let kind = presentation.kind;
    if (kind !== "external" && files.length === 0) {
      dropped += 1;
      failures.push(`module ${raw.name} has no source file in this commit and was removed`);
      continue;
    }
    if (kind === "external" && files.length > 0) {
      kind = "service";
      repaired += 1;
    }
    const path = raw.path && (raw.path === "external" || files.some((file) => file.startsWith(`${raw.path.replace(/\/$/, "")}/`)))
      ? raw.path
      : files[0]?.split("/").slice(0, -1).join("/") || (kind === "external" ? "external" : ".");
    if (path !== raw.path) repaired += 1;
    const verifiedModule: Module = normalizeModulePresentation({
      ...presentation,
      id,
      name: firstWords(raw.name || id, 3),
      kind,
      path,
      files: kind === "external" ? [] : files,
      purpose: raw.purpose.trim(),
      group: raw.group.trim(),
      tech: tech(raw.tech, kind),
      domain: domain(raw.domain),
    });
    if (
      verifiedModule.role !== raw.role ||
      verifiedModule.kind !== raw.kind ||
      verifiedModule.tech !== raw.tech
    ) repaired += 1;
    modules.push(verifiedModule);
    moduleIds.add(id);
    addModuleAlias(raw.id, id);
    addModuleAlias(raw.name, id);
  }

  const byModuleId = new Map(modules.map((module) => [module.id, module]));
  const edges: Edge[] = [];
  const edgeIds = new Set<string>();
  const edgeAliases = new Map<string, string>();
  const recoveredEdges = recoverEdges(core.modules, core.edges, facts, repo.files);

  for (const raw of recoveredEdges) {
    const fromId = resolveModuleId(raw.from);
    const toId = resolveModuleId(raw.to);
    if (!fromId || !toId || !byModuleId.has(fromId) || !byModuleId.has(toId) || fromId === toId) {
      dropped += 1;
      failures.push(`edge ${raw.id} references a missing or ambiguous module`);
      continue;
    }
    const source = byModuleId.get(fromId);
    const file = repo.files.get(raw.evidence.path);
    if (!source || !file || (source.files.length > 0 && !source.files.includes(raw.evidence.path))) {
      dropped += 1;
      failures.push(`edge ${raw.id} cites a source file that is missing or outside its source module`);
      continue;
    }
    if (!snippetAppears(file, raw.evidence.snippet)) {
      dropped += 1;
      failures.push(`edge ${raw.id} cites a line that does not occur verbatim in ${raw.evidence.path}`);
      continue;
    }

    const idBase = slug(raw.id || `${fromId}-${toId}`);
    let id = idBase;
    while (edgeIds.has(id)) id = `${idBase}-${edges.length + 1}`;
    if (!raw.inferred) {
      const target = byModuleId.get(toId);
      if (!target || !supportsLink(facts, source.files, target.files, target, raw.evidence.path, raw.evidence.snippet, raw.kind)) {
        repaired += 1;
        failures.push(`edge ${raw.id} is source-backed but its relationship kind could not be confirmed, so it is marked inferred`);
      }
    }
    const edge: Edge = {
      ...raw,
      id,
      from: fromId,
      to: toId,
      label: firstWords(raw.label || raw.kind, 4),
      inferred: raw.inferred || !supportsLink(
        facts,
        source.files,
        byModuleId.get(toId)?.files ?? [],
        byModuleId.get(toId),
        raw.evidence.path,
        raw.evidence.snippet,
        raw.kind,
      ),
      evidence: { path: raw.evidence.path, snippet: raw.evidence.snippet.trim() },
    };
    edges.push(edge);
    edgeIds.add(id);
    edgeAliases.set(raw.id, id);
    edgeAliases.set(slug(raw.id), id);
  }

  const sceneAliases = new Map<string, string>();
  const sceneIds = new Set<string>();
  const sceneIdByIndex = core.story.scenes.map((scene, index) => {
    const base = slug(scene.id || scene.title);
    let id = base;
    while (sceneIds.has(id)) id = `${base}-${index + 1}`;
    sceneIds.add(id);
    sceneAliases.set(scene.id, id);
    sceneAliases.set(slug(scene.id), id);
    if (id !== scene.id) repaired += 1;
    return id;
  });
  const resolveSceneId = (raw: string): string | null => sceneAliases.get(raw) ?? sceneAliases.get(slug(raw)) ?? null;
  const byEdgeId = new Map(edges.map((edge) => [edge.id, edge]));
  const scenes: StoryScene[] = [];

  for (const [index, raw] of core.story.scenes.entries()) {
    const actions: StoryAction[] = [];
    const sceneId = sceneIdByIndex[index];
    for (const action of raw.actions) {
      if (["enter", "exit", "effect", "spawn"].includes(action.kind)) {
        const ids = idsForAction(action);
        const resolved = ids.map(resolveModuleId);
        if (resolved.some((id) => !id || !byModuleId.has(id))) {
          failures.push(`scene ${raw.id} has an action that references a missing or ambiguous module`);
          dropped += 1;
          continue;
        }
        const mapId = (id: string) => resolveModuleId(id) ?? id;
        switch (action.kind) {
          case "enter": actions.push({ ...action, moduleId: mapId(action.moduleId) }); break;
          case "exit": actions.push({ ...action, moduleId: mapId(action.moduleId) }); break;
          case "effect": actions.push({ ...action, moduleId: mapId(action.moduleId) }); break;
          case "spawn": {
            const targetScene = resolveSceneId(action.sceneId);
            const afterScene = resolveSceneId(action.afterSceneId);
            const edgeId = edgeAliases.get(action.edgeId) ?? edgeAliases.get(slug(action.edgeId));
            const edge = edgeId ? byEdgeId.get(edgeId) : undefined;
            if (!targetScene || !afterScene || !action.afterResponse || !edge || !isRuntimeKind(edge.kind) || edge.from !== mapId(action.moduleId)) {
              failures.push(`scene ${raw.id} does not declare an after-response scene for its deferred task`);
              dropped += 1;
              continue;
            }
            actions.push({ ...action, moduleId: mapId(action.moduleId), edgeId: edge.id, sceneId: targetScene, afterSceneId: afterScene });
            break;
          }
          default: break;
        }
        continue;
      }

      switch (action.kind) {
        case "return": {
          const edgeId = edgeAliases.get(action.edgeId) ?? edgeAliases.get(slug(action.edgeId));
          const edge = edgeId ? byEdgeId.get(edgeId) : undefined;
          if (!edge || !isRuntimeKind(edge.kind)) {
            failures.push(`scene ${raw.id} attempts to animate a missing or non-runtime return relationship`);
            dropped += 1;
            continue;
          }
          actions.push({ kind: "return", edgeId: edge.id });
          break;
        }
        case "traverse": {
          const edgeId = edgeAliases.get(action.edgeId) ?? edgeAliases.get(slug(action.edgeId));
          const edge = edgeId ? byEdgeId.get(edgeId) : undefined;
          if (!edge || !isRuntimeKind(edge.kind)) {
            failures.push(`scene ${raw.id} attempts to animate a missing or non-runtime relationship`);
            dropped += 1;
            continue;
          }
          actions.push({ kind: "traverse", edgeId: edge.id });
          break;
        }
        case "fork":
        case "join": {
          const branches = action.branchSceneIds.map(resolveSceneId);
          if (branches.some((id) => !id)) {
            failures.push(`scene ${raw.id} references a missing scene in its ${action.kind}`);
            dropped += 1;
            continue;
          }
          actions.push({ ...action, branchSceneIds: branches.filter((id): id is string => id !== null) });
          break;
        }
        case "outcome": actions.push(action); break;
      }
    }

    if (actions.length === 0) {
      actions.push({
        kind: "outcome",
        result: "partial",
        text: "This scene has no verified action, so playback shows no execution transition.",
      });
    }

    const evidence = raw.evidence.flatMap((item) => {
      const moduleId = resolveModuleId(item.moduleId);
      if (!moduleId) {
        failures.push(`scene ${raw.id} cites evidence for a missing or ambiguous module`);
        dropped += 1;
        return [];
      }
      const evidenceModule = byModuleId.get(moduleId);
      const file = repo.files.get(item.path);
      if (!evidenceModule || !file || !evidenceModule.files.includes(item.path) || !snippetAppears(file, item.snippet)) {
        failures.push(`scene ${raw.id} cites evidence that is missing, outside its module, or not verbatim`);
        dropped += 1;
        return [];
      }
      return [{ ...item, moduleId, snippet: item.snippet.trim() }];
    });
    if (evidence.length === 0) failures.push(`scene ${raw.id} has no valid source evidence`);

    const dependsOn = raw.dependsOn.flatMap((dependency) => {
      const id = resolveSceneId(dependency);
      if (!id || id === sceneId) {
        failures.push(`scene ${raw.id} depends on a missing or invalid scene`);
        dropped += 1;
        return [];
      }
      return [id];
    });
    scenes.push({
      ...raw,
      id: sceneId,
      title: firstWords(raw.title, 8),
      caption: raw.caption.trim(),
      dependsOn: [...new Set(dependsOn)],
      actions,
      evidence,
    });
  }

  const bySceneId = new Map(scenes.map((scene) => [scene.id, scene]));
  for (const scene of scenes) {
    for (const action of scene.actions) {
      if (action.kind !== "traverse" && action.kind !== "return" && action.kind !== "spawn") continue;
      const edge = byEdgeId.get(action.edgeId);
      if (!edge || !scene.evidence.some((item) => item.path === edge.evidence.path && item.snippet === edge.evidence.snippet)) {
        failures.push(`scene ${scene.id} does not cite the exact source line for its ${action.kind} relationship`);
      }
    }
  }
  const contextOnly = core.story.contextOnly.flatMap((item) => {
    const moduleId = resolveModuleId(item.moduleId);
    if (!moduleId || !byModuleId.has(moduleId) || !item.reason.trim()) {
      failures.push(`context-only declaration for ${item.moduleId} is missing its module or reason`);
      dropped += 1;
      return [];
    }
    return [{ moduleId, reason: item.reason.trim() }];
  });

  const visitedModules = new Set<string>();
  const deferredSpawns: { sceneId: string; schedulerSceneId: string; afterSceneId: string; afterResponse: boolean; moduleId: string; edgeId: string }[] = [];
  let hasOutcome = false;
  for (const scene of scenes) {
    for (const action of scene.actions) {
      if (action.kind === "traverse" || action.kind === "return" || action.kind === "spawn") {
        const edge = byEdgeId.get(action.edgeId);
        if (edge) {
          visitedModules.add(edge.from);
          visitedModules.add(edge.to);
        }
      } else {
        for (const id of idsForAction(action)) visitedModules.add(id);
      }
      if (action.kind === "spawn") {
        deferredSpawns.push({
          sceneId: action.sceneId,
          schedulerSceneId: scene.id,
          afterSceneId: action.afterSceneId,
          afterResponse: action.afterResponse,
          moduleId: action.moduleId,
          edgeId: action.edgeId,
        });
      }
      if (action.kind === "outcome") hasOutcome = true;
      if (action.kind === "fork") {
        const branches = action.branchSceneIds.flatMap((id) => {
          const branch = bySceneId.get(id);
          return branch ? [branch] : [];
        });
        const groups = new Set(branches.map((branch) => branch.parallelGroup ?? ""));
        if (action.mode === "independent" && (groups.size !== 1 || groups.has(""))) {
          failures.push(`independent fork in ${scene.id} does not use one shared parallel group`);
        }
        if (action.mode === "exclusive" && branches.some((branch) => branch.parallelGroup)) {
          failures.push(`exclusive fork in ${scene.id} is incorrectly labeled as parallel work`);
        }
        for (const branchId of action.branchSceneIds) {
          const branch = bySceneId.get(branchId);
          if (!branch || !branch.dependsOn.includes(scene.id)) {
            failures.push(`fork in ${scene.id} does not point to branches triggered by that scene`);
          } else if (branch.branchMode !== action.mode) {
            failures.push(`branch ${branch.id} does not identify the ${action.mode} semantics of its fork`);
          }
        }
      }
      if (action.kind === "join") {
        if (!action.branchSceneIds.every((id) => scene.dependsOn.includes(id))) {
          failures.push(`join in ${scene.id} does not depend on every joined branch`);
        }
      }
    }
  }

  for (const scene of scenes) {
    if (!scene.branchMode) continue;
    const declaredByFork = scenes.some((parent) => parent.actions.some((action) =>
      action.kind === "fork" && action.mode === scene.branchMode && action.branchSceneIds.includes(scene.id),
    ));
    if (!declaredByFork) failures.push(`scene ${scene.id} declares branch semantics without a matching fork`);
  }

  const deferredScenes = scenes.filter((scene) => scene.kind === "deferred");
  const dependsOnScene = (sceneId: string, targetId: string, seen = new Set<string>()): boolean => {
    if (sceneId === targetId) return true;
    if (seen.has(sceneId)) return false;
    seen.add(sceneId);
    const scene = bySceneId.get(sceneId);
    return scene?.dependsOn.some((dependency) => dependsOnScene(dependency, targetId, seen)) ?? false;
  };
  const invalidSpawns = new Set<string>();
  for (const spawn of deferredSpawns) {
    const target = bySceneId.get(spawn.sceneId);
    const edge = byEdgeId.get(spawn.edgeId);
    const targetModules = new Set(target?.actions.flatMap(idsForAction) ?? []);
    const response = bySceneId.get(spawn.afterSceneId);
    const hasResponse = response?.actions.some((action) => action.kind === "return" || (action.kind === "outcome" && action.result === "success"));
    const targetIsConnected = target?.kind === "deferred" && edge?.from === spawn.moduleId && targetModules.has(edge.to);
    const timingIsConnected = spawn.afterResponse && hasResponse &&
      dependsOnScene(spawn.sceneId, spawn.schedulerSceneId) && dependsOnScene(spawn.sceneId, spawn.afterSceneId);
    if (targetIsConnected && timingIsConnected) continue;

    failures.push(`spawn action in ${spawn.schedulerSceneId} does not connect to a deferred scene after the response`);
    invalidSpawns.add(spawn.sceneId);
    const scheduler = bySceneId.get(spawn.schedulerSceneId);
    if (scheduler) {
      scheduler.actions = scheduler.actions.filter((action) =>
        action.kind !== "spawn" || action.sceneId !== spawn.sceneId || action.edgeId !== spawn.edgeId,
      );
      if (scheduler.actions.length === 0) {
        scheduler.actions.push({ kind: "outcome", result: "partial", text: "The deferred transition could not be verified and is not animated." });
      }
    }
  }
  for (const scene of deferredScenes) {
    if (!deferredSpawns.some((spawn) => {
      if (invalidSpawns.has(spawn.sceneId) || !dependsOnScene(scene.id, spawn.sceneId) || !dependsOnScene(scene.id, spawn.schedulerSceneId) || !dependsOnScene(scene.id, spawn.afterSceneId)) return false;
      const response = bySceneId.get(spawn.afterSceneId);
      const hasResponse = response?.actions.some((action) => action.kind === "return" || (action.kind === "outcome" && action.result === "success"));
      return spawn.afterResponse && hasResponse;
    })) {
      failures.push(`deferred scene ${scene.id} lacks a source scene that schedules it after the response`);
      scene.unverified = "After-response scheduling is unverified; no scheduling transition is animated.";
      scene.caption = `${scene.unverified} ${scene.caption}`;
    }
  }

  visitedModules.clear();
  for (const scene of scenes) {
    for (const action of scene.actions) {
      if (action.kind === "traverse" || action.kind === "return" || action.kind === "spawn") {
        const edge = byEdgeId.get(action.edgeId);
        if (edge) {
          visitedModules.add(edge.from);
          visitedModules.add(edge.to);
        }
      } else {
        for (const id of idsForAction(action)) visitedModules.add(id);
      }
    }
  }
  const contextIds = new Set(contextOnly.map((item) => item.moduleId));
  for (const id of contextIds) {
    if (visitedModules.has(id)) failures.push(`module ${id} is both executed and marked context-only`);
  }
  for (const item of modules) {
    if (!visitedModules.has(item.id) && !contextIds.has(item.id)) {
      failures.push(`module ${item.id} is neither visited by the story nor declared context-only`);
    }
  }
  const declaredDeferred = new Set(core.story.completion.deferredSceneIds.flatMap((id) => {
    const resolved = resolveSceneId(id);
    if (!resolved) failures.push(`completion references deferred scene ${id}, which does not exist`);
    return resolved ? [resolved] : [];
  }));
  for (const scene of deferredScenes) {
    if (!declaredDeferred.has(scene.id)) failures.push(`deferred scene ${scene.id} is missing from the declared completion summary`);
  }
  if (declaredDeferred.size !== deferredScenes.length) failures.push("completion lists deferred work that is not marked as a deferred scene");
  if (!hasOutcome) failures.push("story has no declared terminal outcome action");

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitDependency = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const scene = bySceneId.get(id);
    if (!scene) return false;
    visiting.add(id);
    for (const dependency of scene.dependsOn) {
      if (!visitDependency(dependency)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  for (const scene of scenes) {
    if (!visitDependency(scene.id)) failures.push(`story dependencies contain a cycle near ${scene.id}`);
  }

  const parallelGroups = new Map<string, StoryScene[]>();
  for (const scene of scenes) {
    if (!scene.parallelGroup) continue;
    const group = parallelGroups.get(scene.parallelGroup) ?? [];
    group.push(scene);
    parallelGroups.set(scene.parallelGroup, group);
  }
  for (const [groupName, group] of parallelGroups) {
    const first = group[0];
    if (!first) continue;
    const expected = [...first.dependsOn].sort().join("\u0000");
    for (const scene of group) {
      if ([...scene.dependsOn].sort().join("\u0000") !== expected || group.some((other) => scene.dependsOn.includes(other.id))) {
        failures.push(`parallel group ${groupName} incorrectly orders independent scenes`);
        break;
      }
    }
  }

  const story: Story = {
    scenes,
    contextOnly: [...new Map(contextOnly.map((item) => [item.moduleId, item])).values()],
    completion: {
      ...core.story.completion,
      deferredSceneIds: [...declaredDeferred],
      status: failures.length ? "partial" : core.story.completion.status,
    },
  };
  if (story.completion.status === "success" && failures.length > 0) story.completion.status = "partial";

  const summary = core.summary.filter((item) => item.trim());
  const stack = [...new Set(core.stack.filter((item) => item.trim()))];
  const analysis = AnalysisCore.parse({
    meta: {
      repo: repo.repo,
      sha: repo.sha,
      title: core.meta.title.trim() || repo.repo,
      generatedAt: new Date().toISOString(),
      generatorVersion: GENERATOR_VERSION,
      storyVersion: STORY_SCHEMA_VERSION,
    },
    summary: summary.length ? summary : fallbackSummary(modules, repo.repo),
    stack,
    modules,
    edges,
    story,
    interview: {
      pitch: core.interview.pitch,
      tradeoffs: core.interview.tradeoffs.filter(Boolean),
      questions: core.interview.questions.filter((question) => question.q.trim() && question.a.trim()),
    },
  });

  const linkedModules = new Set(analysis.edges.flatMap((edge) => [edge.from, edge.to]));
  const isolated = analysis.modules.filter((item) => !linkedModules.has(item.id)).length;
  const sparse = analysis.modules.length >= 4 && isolated > analysis.modules.length / 2;
  if (sparse) {
    failures.unshift(`The graph has ${isolated} disconnected modules out of ${analysis.modules.length}. Revisit the selected operation, remove irrelevant modules or mark them context-only, and cite only real relationships.`);
    analysis.story.completion.status = "partial";
  }

  return {
    analysis,
    failures,
    dropped,
    repaired,
    essential: analysis.modules.length === 0 || analysis.edges.length === 0 || sparse || failures.length > 0 || analysis.story.completion.status !== "success",
  };
}
