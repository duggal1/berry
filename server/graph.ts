import type { Edge, Module } from "@/lib/schema";
import type { FactSheet } from "./scan";

const keyOf = (from: string, to: string, kind: Edge["kind"]) => `${from}\u0000${to}\u0000${kind}`;
const idPart = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-+$/g, "").slice(0, 35);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pick a single-line, unmodified source excerpt. Never invent diagram evidence. */
function evidenceLine(text: string | undefined, pattern: (line: string) => boolean): string | null {
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (s.length > 0 && s.length <= 120 && !s.startsWith("//") && !s.startsWith("*") && pattern(s)) {
      return s;
    }
  }
  return null;
}

/**
 * Augment AI output only with relationships that code actually supports.
 * Resolved imports are verified. Cross-file type references are shown as inferred
 * because source-text inspection is not a type checker.
 */
export function recoverEdges(
  modules: Module[],
  original: Edge[],
  facts: FactSheet,
  files: Map<string, string>,
): Edge[] {
  const owners = new Map<string, string | null>();
  for (const m of modules) for (const path of m.files) {
    const previous = owners.get(path);
    if (previous === undefined) owners.set(path, m.id);
    else if (previous !== m.id) owners.set(path, null);
  }

  const result = original.slice();
  const positions = new Map(result.map((e, i) => [keyOf(e.from, e.to, e.kind), i]));
  const ids = new Set(result.map((e) => e.id));

  const add = (from: string | null | undefined, to: string | null | undefined, kind: Edge["kind"], label: string, inferred: boolean, path: string, snippet: string | null) => {
    if (!from || !to || from === to || !snippet) return;
    const pair = keyOf(from, to, kind);
    const position = positions.get(pair);
    if (position !== undefined) {
      // Keep the AI edge ID so existing storyboard references still resolve.
      const previous = result[position];
      if (previous.inferred && !inferred) result[position] = {
        ...previous, kind, label, inferred: false, evidence: { path, snippet },
      };
      return;
    }
    const base = `source-${idPart(from)}-${idPart(to)}`;
    let id = base;
    let n = 2;
    while (ids.has(id)) id = `${base}-${n++}`;
    result.push({ id, from, to, kind, label, inferred, evidence: { path, snippet } });
    ids.add(id);
    positions.set(pair, result.length - 1);
  };

  // A resolved local import provides a strong file-to-file dependency edge.
  for (const link of facts.links) {
    const excerpt = evidenceLine(files.get(link.from), (line) =>
      line.includes(link.specifier) &&
      /\b(import|from|export|require|use)\b/.test(line),
    );
    add(owners.get(link.from), owners.get(link.to), "import", "imports", false, link.from, excerpt);
  }

  // Languages such as Swift often relate modules by constructing types, not by
  // importing individual repository files. Only consider uniquely declared
  // PascalCase symbols with an exact constructor/reference in another file.
  const declarations = new Map<string, string | null>();
  for (const [path, names] of Object.entries(facts.symbols)) {
    for (const name of names) {
      if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) continue;
      const previous = declarations.get(name);
      if (previous === undefined) declarations.set(name, path);
      else if (previous !== path) declarations.set(name, null);
    }
  }

  for (const [source, calls] of Object.entries(facts.calls)) {
    for (const symbol of calls) {
      const target = declarations.get(symbol);
      if (!target || target === source) continue;
      const re = new RegExp(`\\b${escapeRe(symbol)}\\s*\\(`);
      const excerpt = evidenceLine(files.get(source), (line) => re.test(line));
      add(owners.get(source), owners.get(target), "call", `uses ${symbol}`, true, source, excerpt);
    }
  }
  // Swift uses module-local type declarations with static method calls
  // such as Scanner.scanWatchdog() and Cleaner.clean(), not file-level imports.
  // The generic calls index only records the method name, so inspect the
  // qualified source expression and retain it as explicitly inferred.
  for (const [source, text] of files) {
    if (!source.endsWith(".swift")) continue;
    for (const line of text.split(/\r?\n/)) {
      const snippet = line.trim();
      if (!snippet || snippet.length > 120 || snippet.startsWith("//") || snippet.startsWith("*")) continue;
      for (const match of line.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\.\s*([a-zA-Z_][A-Za-z0-9_]*)\s*\(/g)) {
        const target = declarations.get(match[1]);
        if (!target || target === source) continue;
        add(owners.get(source), owners.get(target), "call", `calls ${match[2]}`, true, source, snippet);
      }
    }
  }
  // A Swift type annotation is a static dependency, not an invocation.
  // Distinguish it from calls instead of drawing a misleading execution hop.
  const typeUse = /(?::\s*|\[\s*|<\s*|->\s*)([A-Z][A-Za-z0-9_]*)\b/g;
  for (const [source, text] of files) {
    if (!source.endsWith(".swift")) continue;
    for (const line of text.split(/\r?\n/)) {
      const snippet = line.trim();
      if (!snippet || snippet.length > 120 || snippet.startsWith("//") || snippet.startsWith("*")) continue;
      const code = line.split("//", 1)[0];
      for (const match of code.matchAll(typeUse)) {
        const target = declarations.get(match[1]);
        if (!target || target === source) continue;
        add(owners.get(source), owners.get(target), "type", `type ${match[1]}`, true, source, snippet);
      }
    }
  }
  return result;
}
