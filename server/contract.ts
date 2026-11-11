import { z } from "zod";
import { Analysis, AnalysisCore, Stage } from "@/lib/schema";

/**
 * The wire contract. Every boundary validates against these shapes:
 * the browser, the event stream, the model output and the share store.
 */
export { Analysis, AnalysisCore, Stage };

export const AnalyzeBody = z.object({ url: z.string().min(1).max(400) });
export const PromptEvent = z.object({ text: z.string() });
export const DeltaEvent = z.object({ text: z.string() });
export const DoneEvent = z.object({}).loose();
export const ErrorEvent = z.object({ message: z.string() });

export const AskBody = z.object({
  analysis: Analysis,
  question: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string(),
      }),
    )
    .max(30),
});

export const ShareBody = Analysis;

/** JSON Schema for the model, derived from the same Zod shape the browser uses. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

export const analysisJsonSchema = jsonSchemaOf(AnalysisCore);
