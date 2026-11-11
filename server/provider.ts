import OpenAI from "openai";
import { config } from "./config";

export type Usage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** The wire shape the API expects: every tool is a function tool. */
export function toWireTools(tools: ToolSpec[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as OpenAI.FunctionParameters,
    },
  }));
}

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
        ? { tools: toWireTools(args.tools), tool_choice: "auto" as const }
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

export type ToolCallDraft = { id: string; name: string; arguments: string };

export type StreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "content"; text: string }
  | { type: "tool_call"; call: ToolCallDraft }
  | {
      type: "finish";
      finishReason: string;
      usage: Usage;
      message: OpenAI.ChatCompletionMessage;
    };

/**
 * The same request as `chat`, but streamed, so the caller can show what the model is doing
 * while it works. The assistant message is rebuilt exactly as the provider sent it, including
 * `reasoning_content`, which the API requires on every assistant turn it gets back.
 */
export async function* streamChat(args: {
  messages: Wire[];
  tools?: ToolSpec[];
  schema?: Record<string, unknown>;
  schemaName?: string;
  maxTokens?: number;
  effort?: Effort;
  forceReadFile?: boolean;
  signal: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const c = config();
  const stream = await client().chat.completions.create(
    {
      model: c.REFLECTION_MODEL,
      messages: args.messages,
      ...(args.tools?.length
        ? {
            tools: toWireTools(args.tools),
            tool_choice: args.forceReadFile
              ? ({ type: "function" as const, function: { name: "read_file" } } as const)
              : ("auto" as const),
          }
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
      stream: true,
      stream_options: { include_usage: true },
    },
    { signal: args.signal },
  );

  const calls = new Map<number, ToolCallDraft>();
  let content = "";
  let reasoning = "";
  let role = "assistant";
  let finishReason = "stop";
  let usage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for await (const chunk of stream) {
    if (chunk.usage) usage = usageOf(chunk.usage);
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta as unknown as {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    if (delta.role) role = delta.role;
    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content;
      yield { type: "reasoning", text: delta.reasoning_content };
    }
    if (delta.content) {
      content += delta.content;
      yield { type: "content", text: delta.content };
    }
    for (const frag of delta.tool_calls ?? []) {
      const index = frag.index ?? 0;
      const current = calls.get(index) ?? { id: "", name: "", arguments: "" };
      if (frag.id) current.id = frag.id;
      // Function names may arrive in multiple streamed fragments.
      if (frag.function?.name) current.name += frag.function.name;
      if (frag.function?.arguments) current.arguments += frag.function.arguments;
      calls.set(index, current);
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  for (const call of calls.values()) yield { type: "tool_call", call };

  const message = {
    role,
    content: content || null,
    reasoning_content: reasoning || "(no reasoning returned)",
    tool_calls: [...calls.values()].map((c) => ({
      id: c.id,
      type: "function",
      function: { name: c.name, arguments: c.arguments },
    })),
  } as unknown as OpenAI.ChatCompletionMessage;

  yield { type: "finish", finishReason, usage, message };
}
