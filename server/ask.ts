import type { Analysis } from "@/lib/schema";
import { prompt } from "./prompts";
import { streamText } from "./provider";
import type { Wire } from "./provider";

export type Turn = { role: "user" | "assistant"; text: string };

/** Grounded answers over one analysis. History is folded in as text, never as assistant turns. */
export async function* answerQuestion(
  analysis: Analysis,
  question: string,
  history: Turn[],
  signal: AbortSignal,
): AsyncGenerator<string> {
  const transcript = history
    .filter((h) => h.text.trim())
    .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
    .join("\n");

  const messages: Wire[] = [
    { role: "system", content: prompt("answer") },
    {
      role: "user",
      content: [
        "ANALYSIS",
        JSON.stringify(analysis),
        "",
        transcript ? `CONVERSATION SO FAR\n${transcript}\n` : "",
        `QUESTION\n${question}`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  yield* streamText({ messages, maxTokens: 3000, effort: "medium", signal });
}
