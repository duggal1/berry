import { AnalysisCore } from "@/lib/schema";
import { prompt } from "./prompts";
import { streamText } from "./provider";
import type { Wire } from "./provider";
import { factSheetText } from "./scan";
import type { FactSheet } from "./scan";

/** Step 7 of the pipeline: the coding agent brief, streamed from the verified analysis. */
export async function* writeBrief(
  analysis: AnalysisCore,
  facts: FactSheet,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const messages: Wire[] = [
    { role: "system", content: prompt("brief") },
    {
      role: "user",
      content: [
        "VERIFIED ANALYSIS",
        JSON.stringify(analysis, null, 2),
        "",
        "FACT SHEET",
        factSheetText(facts, 120),
        "",
        "Write only the GitHub-flavoured Markdown briefing; no surrounding code fence.",
      ].join("\n"),
    },
  ];

  yield* streamText({ messages, maxTokens: 4000, effort: "medium", signal });
}
