import OpenAI from "openai";
import { config } from "./config";

export type Usage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type Wire = OpenAI.ChatCompletionMessageParam;

/** The assistant message exactly as the provider returned it, ready to send back. */
export type AssistantTurn = OpenAI.ChatCompletionMessage;

export type ChatResult = {
  message: AssistantTurn;
  finishReason: string;
  usage: Usage;
};

const client = () => {
  const c = config();
  return new OpenAI({
    baseURL: c.REFLECTION_BASE_URL,
    apiKey: c.REFLECTION_API_KEY,
    timeout: 180_000,
    maxRetries: 2,
  });
};

export function usageOf(u: OpenAI.CompletionUsage | null | undefined): Usage {
  return {
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    totalTokens: u?.total_tokens ?? 0,
  };
}

/** One request that may answer, or ask for tools. */
export async function chat(args: {
  messages: Wire[];
  tools?: ToolSpec[];
  schema?: Record<string, unknown>;
  schemaName?: string;
  maxTokens?: number;
  effort?: Effort;
  signal: AbortSignal;
}): Promise<ChatResult> {
  const c = config();
  const response = await client().chat.completions.create(
    {
      model: c.REFLECTION_MODEL,
      messages: args.messages,
      ...(args.tools?.length
        ? { tools: args.tools as unknown as OpenAI.ChatCompletionTool[], tool_choice: "auto" as const }
        : {}),
      ...(args.schema
        ? {
            response_format: {
              type: "json_schema" as const,
              json_schema: { name: args.schemaName ?? "analysis", schema: args.schema },
            },
          }
        : {}),
      ...(args.maxTokens ? { max_completion_tokens: args.maxTokens } : {}),
      ...(args.effort ? { reasoning_effort: args.effort as OpenAI.ChatCompletionReasoningEffort } : {}),
    },
    { signal: args.signal },
  );

  const choice = response.choices[0];
  if (!choice) throw new Error("The model returned no answer.");
  return {
    message: choice.message,
    finishReason: choice.finish_reason ?? "stop",
    usage: usageOf(response.usage),
  };
}

/** Streaming plain text. Yields content deltas only. */
export async function* streamText(args: {
  messages: Wire[];
  maxTokens?: number;
  effort?: Effort;
  signal: AbortSignal;
}): AsyncGenerator<string> {
  const c = config();
  const stream = await client().chat.completions.create(
    {
      model: c.REFLECTION_MODEL,
      messages: args.messages,
      ...(args.maxTokens ? { max_completion_tokens: args.maxTokens } : {}),
      ...(args.effort ? { reasoning_effort: args.effort as OpenAI.ChatCompletionReasoningEffort } : {}),
      stream: true,
    },
    { signal: args.signal },
  );

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
