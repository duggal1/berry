import { z } from "zod";

export const Role = z.enum(["entry", "core", "data", "integration", "utility", "config"]);
export const Kind = z.enum(["service", "datastore", "queue", "external"]);
export const EdgeKind = z.enum(["import", "call", "data", "event"]);

export const Module = z.object({
  id: z.string(),
  name: z.string(),
  role: Role,
  kind: Kind,
  purpose: z.string(),
  path: z.string(),
  files: z.array(z.string()),
  group: z.string(),
  /** The framework, language, database or service this part is actually built with. */
  tech: z.string().optional(),
  /** Website domain of an outside service, used to fetch its logo (e.g. stripe.com). */
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

export const Step = z.object({
  id: z.string(),
  moduleId: z.string(),
  edgeId: z.string(),
  title: z.string(),
  text: z.string(),
});

export const QA = z.object({ q: z.string(), a: z.string() });

export const AnalysisCore = z.object({
  meta: z.object({ repo: z.string(), sha: z.string(), title: z.string(), generatedAt: z.string() }),
  summary: z.array(z.string()),
  stack: z.array(z.string()),
  modules: z.array(Module),
  edges: z.array(Edge),
  flow: z.array(Step),
  interview: z.object({ pitch: z.string(), tradeoffs: z.array(z.string()), questions: z.array(QA) }),
});

export const Analysis = AnalysisCore.extend({ codingPrompt: z.string() });
export const Stored = Analysis.extend({ id: z.string(), savedAt: z.number() });
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
export type Step = z.infer<typeof Step>;
export type AnalysisCore = z.infer<typeof AnalysisCore>;
export type Analysis = z.infer<typeof Analysis>;
export type Stored = z.infer<typeof Stored>;
export type Stage = z.infer<typeof Stage>;
export type TraceItem = z.infer<typeof TraceItem>;
