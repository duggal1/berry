import { AnalysisCore } from "@/lib/schema";
import { analysisJsonSchema } from "./contract";
import { config } from "./config";
import type { Repository } from "./ingest";
import { prompt } from "./prompts";
import { streamChat } from "./provider";
import type { ToolSpec, Usage, Wire } from "./provider";
import { toolTrace } from "./trace";
import type { TracePayload } from "./trace";
import { factSheetText } from "./scan";
import type { FactSheet } from "./scan";

export type ExploreResult = {
  analysis: AnalysisCore;
  usage: Usage;
  rounds: number;
  toolCalls: number;
};

const MAX_TOOL_OUTPUT = 24_000;

function clip(text: string, max = MAX_TOOL_OUTPUT): string {
  return text.length > max ? `${text.slice(0, max)}\n... truncated` : text;
}

function toolSpecs(): ToolSpec[] {
  return [
    {
      name: "list_files",
      description:
        "List the files under a directory prefix. Returns one line per file with its path, language and line count.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory prefix such as src/api. Use an empty string for the whole repository.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "read_file",
      description:
        "Read a file from the repository, with line numbers. Use start and end for a range; both are 1 based and inclusive.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path of the file to read." },
          start: { type: "number", description: "First line to return, 1 based." },
          end: { type: "number", description: "Last line to return, inclusive." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "search",
      description:
        "Search file contents using a case-insensitive literal substring. Regex characters are treated as text. Returns file, line number and matching line.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regular expression to search for." },
          path: { type: "string", description: "Optional directory or file prefix to limit the search." },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
    {
      name: "imports",
      description:
        "List the import links of one file: the raw import specifiers and the repository files they resolve to.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Path of the file." } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  ];
}

function runTool(
  name: string,
  rawArgs: string,
  repo: Repository,
  facts: FactSheet,
): string {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
    if (parsed && typeof parsed === "object") args = parsed;
  } catch {
    return "The arguments were not valid JSON. Call the tool again with valid JSON.";
  }

  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
  const num = (k: string) => (typeof args[k] === "number" && Number.isFinite(args[k]) ? Math.trunc(args[k] as number) : 0);

  switch (name) {
    case "list_files": {
      const prefix = str("path").replace(/^\/+|\/+$/g, "");
      const rows = facts.files
        .filter((f) => !prefix || f.path === prefix || f.path.startsWith(`${prefix}/`))
        .slice(0, 250)
        .map((f) => `${f.path} [${f.language}, ${f.lines} lines]`);
      if (!rows.length) return `No files under ${prefix || "the repository root"}.`;
      return clip(rows.join("\n"));
    }

    case "read_file": {
      const path = str("path");
      const text = repo.files.get(path);
      if (text === undefined) return `No such file: ${path}. Use list_files to find the real path.`;
      const all = text.split("\n");
      const start = Math.max(1, num("start") || 1);
      const end = Math.min(all.length, start + 299, num("end") || start + 299);
      const out: string[] = [];
      for (let i = start; i <= end; i++) out.push(`${i}: ${all[i - 1]}`);
      return clip(out.join("\n"));
    }

    case "search": {
      const pattern = str("pattern");
      if (!pattern) return "Give a pattern to search for.";
      const prefix = str("path").replace(/^\/+|\/+$/g, "");
      const needle = pattern.toLowerCase();
      if (needle.length > 160) return "Search text must be at most 160 characters.";
      const hits: string[] = [];
      for (const [path, text] of repo.files) {
        if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) continue;
        const lines = text.split("\n");
        for (let i = 0; i < lines.length && hits.length < 60; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push(`${path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
          }
        }
        if (hits.length >= 60) break;
      }
      if (!hits.length) return `No match for ${pattern}.`;
      return clip(hits.join("\n"));
    }

    case "imports": {
      const path = str("path");
      if (!repo.files.has(path)) return `No such file: ${path}.`;
      const specs = facts.imports[path] ?? [];
      const links = facts.links.filter((l) => l.from === path);
      const out: string[] = [];
      for (const spec of specs) {
        const link = links.find((l) => l.specifier === spec);
        out.push(`${spec}${link ? ` -> ${link.to}` : " -> (external, unresolved)"}`);
      }
      const called = facts.calls[path] ?? [];
      if (called.length) out.push(`calls: ${called.slice(0, 60).join(", ")}`);
      const syms = facts.symbols[path] ?? [];
      if (syms.length) out.push(`defines: ${syms.slice(0, 40).join(", ")}`);
      if (!out.length) return "No imports, calls or symbols were found in this file.";
      return clip(out.join("\n"));
    }

    default:
      return `Unknown tool: ${name}.`;
  }
}

function parseAnalysis(content: string): AnalysisCore {
  const cleaned = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return an analysis object.");
  let json: unknown;
  try {
    json = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("The model returned malformed JSON.");
  }
  const parsed = AnalysisCore.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `The model's analysis did not match the expected shape (${issue?.path.join(".") ?? "unknown"}: ${issue?.message ?? "invalid"}).`,
    );
  }
  return parsed.data;
}

/** Step 5 of the pipeline: a bounded agent that explores the repo with read-only tools. */
export async function explore(args: {
  repo: Repository;
  facts: FactSheet;
  feedback?: string[];
  signal: AbortSignal;
  onProgress?: (detail: string) => void;
  onTrace?: (trace: TracePayload) => void;
}): Promise<ExploreResult> {
  const cfg = config();
  const tools = toolSpecs();
  const budget = { tokens: 0 };

  const task = [
    `Repository: ${args.repo.repo} at commit ${args.repo.sha}`,
    "",
    factSheetText(args.facts),
    "",
    "Explore this repository with the tools and return the analysis object.",
    args.feedback?.length
      ? [
          "",
          "Your previous answer was rejected. Fix these problems and answer again:",
          ...args.feedback.map((f) => `- ${f}`),
        ].join("\n")
      : "",
  ].join("\n");

  const messages: Wire[] = [
    { role: "system", content: prompt("explore") },
    { role: "user", content: task },
  ];

  let rounds = 0;
  let toolCalls = 0;
  let last: string | null = null;

  /** One streamed round: reasoning, tool calls, or the final answer. */
  async function runRound(withTools: boolean): Promise<{
    finishReason: string;
    message: ReturnType<typeof buildMessage>;
    content: string;
    usage: Usage;
    calls: { id: string; name: string; arguments: string }[];
  }> {
    let content = "";
    let reasoning = "";
    let finishReason = "stop";
    let usage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const calls: { id: string; name: string; arguments: string }[] = [];
    const thinkId = `think-${rounds + 1}`;

    for await (const ev of streamChat({
      messages,
      tools: withTools ? tools : undefined,
      forceReadFile: withTools && rounds === 0,
      schema: analysisJsonSchema,
      schemaName: "analysis",
      maxTokens: 16_000,
      effort: "high",
      signal: args.signal,
    })) {
      if (ev.type === "reasoning") {
        reasoning += ev.text;
        args.onTrace?.({
          id: thinkId,
          kind: "think",
          label: "Thinking",
          text: ev.text,
          done: false,
        });
      } else if (ev.type === "content") {
        content += ev.text;
      } else if (ev.type === "tool_call") {
        calls.push(ev.call);
      } else {
        finishReason = ev.finishReason;
        usage = ev.usage;
        budget.tokens += usage.totalTokens;
      }
    }

    if (reasoning) {
      args.onTrace?.({ id: thinkId, kind: "think", label: "Thinking", text: "", done: true });
    }

    return {
      finishReason,
      content,
      calls,
      usage,
      message: buildMessage(reasoning, content, calls),
    };
  }

  for (; rounds < cfg.MAX_TOOL_ROUNDS; rounds++) {
    const result = await runRound(true);

    args.onProgress?.(`round ${rounds + 1}, ${result.finishReason}`);

    if (result.finishReason === "tool_calls" && result.calls.length) {
      messages.push(result.message as unknown as Wire);
      for (const call of result.calls) {
        toolCalls += 1;
        const trace = toolTrace(call.id || `tool-${toolCalls}`, call.name, call.arguments);
        args.onTrace?.({
          id: call.id || `tool-${toolCalls}`,
          kind: trace.kind,
          label: trace.label,
          text: "",
          done: false,
        });
        const content = runTool(call.name, call.arguments, args.repo, args.facts);
        messages.push({ role: "tool", tool_call_id: call.id, content });
        args.onTrace?.({
          id: call.id || `tool-${toolCalls}`,
          kind: trace.kind,
          label: trace.label,
          text: "",
          done: true,
        });
      }
      if (budget.tokens > cfg.MAX_JOB_TOKENS) break;
      continue;
    }

    if (result.finishReason === "length") {
      throw new Error("The provider ran out of completion tokens before finishing the analysis.");
    }
    if (result.finishReason === "tool_calls" && !result.calls.length) {
      throw new Error("The provider requested tools but did not return valid tool calls.");
    }
    if (result.content) last = result.content;
    break;
  }

  if (!last) {
    const result = await runRound(false);
    budget.tokens += result.usage.totalTokens;
    if (result.finishReason === "length") {
      throw new Error("The provider ran out of completion tokens before completing the analysis.");
    }
    last = result.content;
  }

  if (!last) throw new Error("The model did not produce an analysis.");

  return {
    analysis: parseAnalysis(last),
    usage: {
      promptTokens: budget.tokens,
      completionTokens: 0,
      totalTokens: budget.tokens,
    },
    rounds: rounds + 1,
    toolCalls,
  };
}

/** Rebuild the assistant turn exactly as the provider sent it. */
function buildMessage(
  reasoning: string,
  content: string,
  calls: { id: string; name: string; arguments: string }[],
) {
  return {
    role: "assistant",
    content: content || null,
    reasoning_content: reasoning || "(no reasoning returned)",
    tool_calls: calls.map((c) => ({
      id: c.id,
      type: "function",
      function: { name: c.name, arguments: c.arguments },
    })),
  };
}
