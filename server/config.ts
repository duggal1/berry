import { z } from "zod";

const Env = z.object({
  REFLECTION_API_KEY: z.string().default(""),
  REFLECTION_BASE_URL: z.string().default("https://api.reflection.ai/openai/v1"),
  REFLECTION_MODEL: z.string().default("Beam-1.0-501B-A23B"),
  GITHUB_TOKEN: z.string().default(""),
  DATA_DIR: z.string().default(".data"),
  MAX_ARCHIVE_BYTES: z.coerce.number().default(200 * 1024 * 1024),
  MAX_FILES: z.coerce.number().default(50_000),
  MAX_FILE_BYTES: z.coerce.number().default(1024 * 1024),
  MAX_TOTAL_BYTES: z.coerce.number().default(200 * 1024 * 1024),
  MAX_JOB_TOKENS: z.coerce.number().default(600_000),
  MAX_JOB_MS: z.coerce.number().default(240_000),
  MAX_TOOL_ROUNDS: z.coerce.number().default(12),
  RATE_ANALYZE: z.coerce.number().default(8),
  RATE_ASK: z.coerce.number().default(40),
  RATE_SHARE: z.coerce.number().default(60),
  RATE_WINDOW_MS: z.coerce.number().default(10 * 60 * 1000),
});

export type Config = z.infer<typeof Env>;

let cached: Config | null = null;

/** Every environment setting the server reads, in one place. */
export function config(): Config {
  cached ??= Env.parse(process.env);
  return cached;
}

export function resetConfig(): void {
  cached = null;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
