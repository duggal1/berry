import { z } from "zod";

export const STORY_SCHEMA_VERSION = 3;
export const GENERATOR_VERSION = "4";

export const Role = z.enum(["entry", "core", "data", "integration", "utility", "config"]);
export const Kind = z.enum(["service", "datastore", "queue", "external"]);
export const EdgeKind = z.enum(["import", "call", "data", "event", "type"]);
export const RuntimeEdgeKind = z.enum(["call", "data", "event"]);

export const Module = z.object({
  id: z.string(),
  name: z.string(),
  role: Role,
  kind: Kind,
  purpose: z.string(),
  path: z.string(),
  files: z.array(z.string()),
  group: z.string(),
  tech: z.string().optional(),
  domain: z.string().optional(),
});

export const Edge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: EdgeKind,
  label: z.string(),
  inferred: z.boolean(),
  evidence: z.object({ path: z.string(), snippet: z.string() }),
});

export const StoryEvidence = z.object({
  moduleId: z.string(),
  path: z.string(),
  snippet: z.string(),
});

export const StoryAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enter"), moduleId: z.string() }),
  z.object({ kind: z.literal("exit"), moduleId: z.string() }),
  z.object({ kind: z.literal("traverse"), edgeId: z.string() }),
  z.object({ kind: z.literal("fork"), mode: z.enum(["independent", "exclusive"]), branchSceneIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("join"), branchSceneIds: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("return"), edgeId: z.string() }),
  z.object({
    kind: z.literal("spawn"),
    moduleId: z.string(),
    edgeId: z.string(),
    sceneId: z.string(),
    afterResponse: z.boolean(),
    afterSceneId: z.string(),
  }),
  z.object({
    kind: z.literal("effect"),
    moduleId: z.string(),
    effect: z.enum(["cache", "revalidation", "notification", "client-update", "write", "other"]),
    text: z.string(),
  }),
  z.object({ kind: z.literal("outcome"), result: z.enum(["success", "failure", "partial"]), text: z.string() }),
]);

export const StoryScene = z.object({
  id: z.string(),
  title: z.string(),
  caption: z.string(),
  unverified: z.string().optional(),
  kind: z.enum(["spine", "branch", "deferred", "outcome", "failure"]),
  branchMode: z.enum(["independent", "exclusive"]).optional(),
  dependsOn: z.array(z.string()),
  parallelGroup: z.string().optional(),
  actions: z.array(StoryAction).min(1),
  evidence: z.array(StoryEvidence),
});

export const Story = z.object({
  scenes: z.array(StoryScene),
  contextOnly: z.array(z.object({ moduleId: z.string(), reason: z.string() })),
  completion: z.object({
    status: z.enum(["success", "partial", "failure"]),
    summary: z.string(),
    deferredSceneIds: z.array(z.string()),
  }),
});

export const Step = z.object({
  id: z.string(),
  moduleId: z.string(),
  edgeId: z.string(),
  title: z.string(),
  text: z.string(),
});

export const QA = z.object({ q: z.string(), a: z.string() });

const Interview = z.object({ pitch: z.string(), tradeoffs: z.array(z.string()), questions: z.array(QA) });
const LegacyMeta = z.object({ repo: z.string(), sha: z.string(), title: z.string(), generatedAt: z.string() });
const Meta = LegacyMeta.extend({
  generatorVersion: z.string(),
  storyVersion: z.number().int().nonnegative(),
});

const AnalysisFields = {
  summary: z.array(z.string()),
  stack: z.array(z.string()),
  modules: z.array(Module),
  edges: z.array(Edge),
  interview: Interview,
};

export const AnalysisCore = z.object({
  meta: Meta,
  ...AnalysisFields,
  story: Story,
});

const LegacyAnalysisCore = z.object({
  meta: LegacyMeta,
  ...AnalysisFields,
  flow: z.array(Step),
});

export const Analysis = AnalysisCore.extend({ codingPrompt: z.string() });
const LegacyAnalysis = LegacyAnalysisCore.extend({ codingPrompt: z.string() });

const CurrentStored = Analysis.extend({ id: z.string(), savedAt: z.number() });
const LegacyStored = LegacyAnalysis.extend({ id: z.string(), savedAt: z.number() });

/** Existing saved analyses remain readable and are presented as incomplete storyboards. */
export const Stored = z.union([CurrentStored, LegacyStored]).transform((value) => {
  if ("story" in value) return value;
  return { ...migrateLegacyAnalysis(value), id: value.id, savedAt: value.savedAt };
});

export const Stage = z.object({ id: z.string(), label: z.string(), detail: z.string() });

export const TraceItem = z.object({
  id: z.string(),
  kind: z.enum(["think", "read", "list", "search", "write"]),
  label: z.string().default(""),
  text: z.string().default(""),
  done: z.boolean().default(false),
});

export type Module = z.infer<typeof Module>;
export type Edge = z.infer<typeof Edge>;
export type RuntimeEdgeKind = z.infer<typeof RuntimeEdgeKind>;
export type StoryEvidence = z.infer<typeof StoryEvidence>;
export type StoryAction = z.infer<typeof StoryAction>;
export type StoryScene = z.infer<typeof StoryScene>;
export type Story = z.infer<typeof Story>;
export type Step = z.infer<typeof Step>;
export type AnalysisCore = z.infer<typeof AnalysisCore>;
export type Analysis = z.infer<typeof Analysis>;
export type Stored = z.infer<typeof Stored>;
export type Stage = z.infer<typeof Stage>;
export type TraceItem = z.infer<typeof TraceItem>;

function migrateLegacyAnalysis(value: z.infer<typeof LegacyAnalysis>): Analysis {
  const moduleIds = new Set(value.modules.map((module) => module.id));
  const edgeById = new Map(value.edges.map((edge) => [edge.id, edge]));
  const scenes: StoryScene[] = [];
  const visited = new Set<string>();
  let previousModuleId: string | null = null;
  let previousSceneId: string | null = null;

  for (const step of value.flow) {
    if (!moduleIds.has(step.moduleId)) {
      continue;
    }

    if (!previousModuleId && !step.edgeId) {
      const scene: StoryScene = {
        id: step.id,
        title: step.title,
        caption: step.text,
        kind: "spine",
        dependsOn: [],
        actions: [{ kind: "enter", moduleId: step.moduleId }],
        evidence: [],
      };
      scenes.push(scene);
      visited.add(step.moduleId);
      previousModuleId = step.moduleId;
      previousSceneId = scene.id;
      continue;
    }

    const edge = edgeById.get(step.edgeId);
    if (
      !edge ||
      !["call", "data", "event"].includes(edge.kind) ||
      edge.from !== previousModuleId ||
      edge.to !== step.moduleId
    ) {
      continue;
    }

    const scene: StoryScene = {
      id: step.id,
      title: step.title,
      caption: step.text,
      kind: "spine",
      dependsOn: previousSceneId ? [previousSceneId] : [],
      actions: [{ kind: "traverse", edgeId: edge.id }],
      evidence: [],
    };
    scenes.push(scene);
    visited.add(edge.from);
    visited.add(edge.to);
    previousModuleId = step.moduleId;
    previousSceneId = scene.id;
  }

  const contextOnly = value.modules
    .filter((module) => !visited.has(module.id))
    .map((module) => ({ moduleId: module.id, reason: "This older single-path storyboard did not verify this module as an executed step." }));
  const story: Story = {
    scenes,
    contextOnly,
    completion: {
      status: "partial",
      summary: "This saved analysis uses the earlier single-path storyboard and cannot establish complete branch coverage.",
      deferredSceneIds: [],
    },
  };

  return {
    ...value,
    meta: { ...value.meta, generatorVersion: "legacy", storyVersion: 1 },
    story,
  };
}

export function fromLegacyAnalysis(value: unknown): Analysis {
  return migrateLegacyAnalysis(LegacyAnalysis.parse(value));
}
