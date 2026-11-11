import { config } from "@/server/config";
import { AskBody } from "@/server/contract";
import { BodyTooLargeError, readBoundedJson } from "@/server/body";
import { answerQuestion } from "@/server/ask";
import { eventStream } from "@/server/sse";
import { checkRateLimit, clientKey } from "@/server/limits";

export const maxDuration = 120;

export async function POST(req: Request) {
  const cfg = config();
  if (!cfg.REFLECTION_API_KEY) {
    return Response.json(
      { message: "The AI provider is not configured on this server." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(req, 3 * 1024 * 1024);
  } catch (e) {
    if (e instanceof BodyTooLargeError) {
      return Response.json({ message: "The question or analysis is too large." }, { status: 413 });
    }
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }
  const parsed = AskBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: "That question or analysis is not valid." }, { status: 400 });
  }

  try {
    checkRateLimit(clientKey(req), cfg.RATE_ASK, cfg.RATE_WINDOW_MS);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Too many requests.";
    return Response.json({ message }, { status: 429 });
  }

  return eventStream(async (send) => {
    for await (const text of answerQuestion(
      parsed.data.analysis,
      parsed.data.question,
      parsed.data.history,
      req.signal,
    )) {
      send("delta", { text });
    }
    send("done", {});
  });
}
