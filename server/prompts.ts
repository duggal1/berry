import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

/** Prompt text lives in versioned files under server/prompts, never inline in logic. */
export function prompt(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const file = path.join(process.cwd(), "server", "prompts", `${name}.md`);
  const text = readFileSync(file, "utf8").trim();
  cache.set(name, text);
  return text;
}
