export type TraceKind = "think" | "read" | "list" | "search" | "write";

export type TracePayload = {
  id: string;
  kind: TraceKind;
  label: string;
  text: string;
  done: boolean;
};

const VERB: Record<Exclude<TraceKind, "think">, string> = {
  read: "Reading",
  list: "Listing",
  search: "Searching",
  write: "Writing",
};

/** Map a tool name onto the kind of work it is. */
export function kindOf(tool: string): Exclude<TraceKind, "think"> {
  if (/grep|search|find/i.test(tool)) return "search";
  if (/list|glob|tree|\bls\b/i.test(tool)) return "list";
  if (/write|edit/i.test(tool)) return "write";
  return "read";
}

/** The one argument worth showing in the trace. */
export function argOf(json: string): string {
  try {
    const j = JSON.parse(json || "{}") as Record<string, unknown>;
    const v = j.path ?? j.file_path ?? j.pattern ?? j.query ?? "";
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

/** One trace row for a tool call the agent just made. */
export function toolTrace(
  id: string,
  tool: string,
  argsJson: string,
): { kind: Exclude<TraceKind, "think">; label: string; text: string } {
  const kind = kindOf(tool);
  const arg = argOf(argsJson);
  return {
    kind,
    label: `${VERB[kind]} ${arg}`.trim(),
    text: arg ? `${tool} ${arg}` : tool,
  };
}
