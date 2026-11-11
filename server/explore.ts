import { AnalysisCore } from "@/lib/schema";
import { analysisJsonSchema } from "./contract";
import { config } from "./config";
import type { Repository } from "./ingest";
import { prompt } from "./prompts";
import { chat } from "./provider";
import type { ToolSpec, Usage, Wire } from "./provider";
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
        "Search file contents. The pattern is a regular expression, matched case insensitively. Returns file, line number and the matching line.",
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
  const num = (k: string) => (typeof args[k] === "number" ? (args[k] as number) : 0);

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
      const end = Math.min(all.length, num("end") || Math.min(all.length, start + 299));
      const out: string[] = [];
      for (let i = start; i <= end; i++) out.push(`${i}: ${all[i - 1]}`);
      return clip(out.join("\n"));
    }

    case "search": {
      const pattern = str("pattern");
      if (!pattern) return "Give a pattern to search for.";
      const prefix = str("path").replace(/^\/+|\/+$/g, "");
      let re: RegExp;
      try {
        re = new RegExp(pattern, "gi");
      } catch {
        return `"${pattern}" is not a valid regular expression.`;
      }
      const hits: string[] = [];
      for (const [path, text] of repo.files) {
        if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) continue;
        const lines = text.split("\n");
        for (let i = 0; i < lines.length && hits.length < 60; i++) {
          re.lastIndex = 0;
          if (re.test(lines[i])) {
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

  for (; rounds < cfg.MAX_TOOL_ROUNDS; rounds++) {
    const result = await chat({
      messages,
      tools,
      schema: analysisJsonSchema,
      schemaName: "analysis",
      maxTokens: 16_000,
      effort: "high",
      signal: args.signal,
    });

    budget.tokens += result.usage.totalTokens;
    args.onProgress?.(`round ${rounds + 1}, ${result.finishReason}`);

    if (result.finishReason === "tool_calls" && result.message.tool_calls?.length) {
      messages.push(result.message as unknown as Wire);
      for (const call of result.message.tool_calls) {
        if (call.type !== "function") continue;
        toolCalls += 1;
        const content = runTool(call.function.name, call.function.arguments, args.repo, args.facts);
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
      if (budget.tokens > cfg.MAX_JOB_TOKENS) break;
      continue;
    }

    if (result.message.content) last = result.message.content;
    break;
  }

  if (!last) {
    const result = await chat({
      messages,
      schema: analysisJsonSchema,
      schemaName: "analysis",
      maxTokens: 16_000,
      effort: "high",
      signal: args.signal,
    });
    budget.tokens += result.usage.totalTokens;
    last = result.message.content;
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
