import type { Module } from "@/lib/schema";

export type FileInfo = { path: string; language: string; lines: number };
export type Link = { from: string; to: string; specifier: string };
export type Manifest = {
  path: string;
  name: string;
  main: string;
  scripts: string[];
  deps: string[];
};
export type Service = { name: string; packages: string[]; files: string[] };

export type FactSheet = {
  repo: string;
  sha: string;
  files: FileInfo[];
  languages: Record<string, number>;
  imports: Record<string, string[]>;
  links: Link[];
  manifests: Manifest[];
  entryPoints: string[];
  services: Service[];
  envVars: string[];
  externalDeps: string[];
  symbols: Record<string, string[]>;
  calls: Record<string, string[]>;
  unparsed: string[];
};

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  pyi: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  hpp: "C++",
  swift: "Swift",
  m: "Objective-C",
  scala: "Scala",
  ex: "Elixir",
  exs: "Elixir",
  dart: "Dart",
  lua: "Lua",
  pl: "Perl",
  r: "R",
  jl: "Julia",
  zig: "Zig",
  hs: "Haskell",
  clj: "Clojure",
  sh: "Shell",
  bash: "Shell",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  scss: "CSS",
  less: "CSS",
  vue: "Vue",
  svelte: "Svelte",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  md: "Markdown",
  txt: "Text",
  dockerfile: "Dockerfile",
  proto: "Protobuf",
  graphql: "GraphQL",
  tf: "Terraform",
};

const RESOLVE_EXT = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".py",
  ".go",
  ".rb",
  ".java",
  ".kt",
  ".php",
  ".cs",
  ".rs",
  ".json",
  ".css",
  ".scss",
  ".sql",
  ".sh",
  ".swift",
  ".dart",
  ".ex",
  ".exs",
  ".lua",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".hpp",
];

const SERVICE_PACKAGES: Record<string, string> = {
  pg: "PostgreSQL",
  "pg-core": "PostgreSQL",
  postgres: "PostgreSQL",
  psycopg: "PostgreSQL",
  psycopg2: "PostgreSQL",
  asyncpg: "PostgreSQL",
  mysql: "MySQL",
  mysql2: "MySQL",
  sqlite3: "SQLite",
  "better-sqlite3": "SQLite",
  prisma: "Prisma",
  "@prisma/client": "Prisma",
  mongoose: "MongoDB",
  mongodb: "MongoDB",
  "@mongodb/mongodb": "MongoDB",
  redis: "Redis",
  ioredis: "Redis",
  bull: "Redis queue",
  bullmq: "Redis queue",
  agenda: "MongoDB queue",
  kafkajs: "Kafka",
  "kafka-node": "Kafka",
  amqplib: "RabbitMQ",
  "amqp-connection-manager": "RabbitMQ",
  "@aws-sdk/client-s3": "AWS S3",
  "@aws-sdk/client-sqs": "AWS SQS",
  "@aws-sdk/client-dynamodb": "AWS DynamoDB",
  boto3: "AWS",
  "@google-cloud/storage": "Google Cloud Storage",
  "@azure/storage-blob": "Azure Blob Storage",
  stripe: "Stripe",
  twilio: "Twilio",
  "@sendgrid/mail": "SendGrid",
  mailgun: "Mailgun",
  nodemailer: "SMTP email",
  firebase: "Firebase",
  "firebase-admin": "Firebase",
  "@sentry/node": "Sentry",
  "@sentry/nextjs": "Sentry",
  elasticsearch: "Elasticsearch",
  "@elastic/elasticsearch": "Elasticsearch",
  openai: "OpenAI",
  "@anthropic-ai/sdk": "Anthropic",
  "@apollo/server": "GraphQL",
  graphql: "GraphQL",
  "socket.io": "WebSocket",
  ws: "WebSocket",
  "@cloudflare/workers-types": "Cloudflare Workers",
  "drizzle-orm": "SQL database",
  "typeorm": "SQL database",
  sequelize: "SQL database",
  knex: "SQL database",
  supabase: "Supabase",
  "@supabase/supabase-js": "Supabase",
};

const ENV_PATTERNS: RegExp[] = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  /Deno\.env\.get\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /os\.environ(?:\.get)?\[["']([A-Z][A-Z0-9_]*)["']\]/g,
  /os\.getenv\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /ENV\[["']([A-Z][A-Z0-9_]*)["']\]/g,
  /System\.getenv\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /os\.Getenv\(["']([A-Z][A-Z0-9_]*)["']\)/g,
  /env::var\(["']([A-Z][A-Z0-9_]*)["']\)/g,
];

const CALL_KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "function", "class", "new", "typeof",
  "await", "async", "super", "this", "require", "import", "print", "assert", "elif", "except",
  "with", "lambda", "def", "fn", "func", "match", "do", "then", "and", "or", "not", "in", "of",
  "console", "String", "Number", "Boolean", "Array", "Object", "JSON", "Math", "Date", "Promise",
  "Error", "Map", "Set", "parseInt", "parseFloat", "isNaN", "encodeURIComponent", "decodeURIComponent",
  "require_once", "include", "sizeof", "count", "int", "str", "list", "dict", "set",
]);

export function languageOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (/^dockerfile/i.test(base)) return "Dockerfile";
  if (/^makefile$/i.test(base)) return "Makefile";
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1).toLowerCase() : "";
  return LANGUAGES[ext] ?? "Unknown";
}

function joinPath(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function resolveImport(from: string, spec: string, files: Set<string>): string | null {
  const clean = spec.split("?")[0].replace(/^(@[^/]*\/[^/]+|[^@][^/]*)\//, "$1/");
  const bases: string[] = [];
  if (clean.startsWith(".")) {
    bases.push(joinPath(from.split("/").slice(0, -1).join("/"), clean));
  } else if (clean.startsWith("@/") || clean.startsWith("~/")) {
    const tail = clean.slice(2);
    for (const root of ["src", "app", "lib", "packages", ""]) {
      bases.push(joinPath(root, tail));
    }
  } else if (/^[\w.-]+\/[\w./-]+$/.test(clean) && !clean.includes(".")) {
    bases.push(clean);
  } else if (clean.includes(".")) {
    bases.push(clean);
  }

  for (const base of bases) {
    for (const ext of RESOLVE_EXT) {
      const candidate = base + ext;
      if (files.has(candidate)) return candidate;
    }
    for (const ext of RESOLVE_EXT.slice(1)) {
      const candidate = `${base}/index${ext}`;
      if (files.has(candidate)) return candidate;
    }
  }
  return null;
}

/** Pull the import specifiers out of one file, by language. Never guesses. */
function extractImports(path: string, text: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const v = s.trim();
    if (v && !out.includes(v)) out.push(v);
  };

  if (/\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/.test(path)) {
    for (const m of text.matchAll(/import\s+[^;'"]*from\s*["']([^"']+)["']/g)) push(m[1]);
    for (const m of text.matchAll(/import\s*["']([^"']+)["']/g)) push(m[1]);
    for (const m of text.matchAll(/export\s+[^;'"]*from\s*["']([^"']+)["']/g)) push(m[1]);
    for (const m of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) push(m[1]);
    for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) push(m[1]);
    return out;
  }
  if (/\.py$/.test(path)) {
    for (const m of text.matchAll(/^\s*from\s+([\w.]+)\s+import\s+/gm)) push(m[1]);
    for (const m of text.matchAll(/^\s*import\s+([\w.]+)/gm)) push(m[1]);
    return out;
  }
  if (/\.go$/.test(path)) {
    for (const m of text.matchAll(/import\s+"([^"]+)"/g)) push(m[1]);
    for (const m of text.matchAll(/^\s+"([^"]+)"\s*$/gm)) push(m[1]);
    return out;
  }
  if (/\.rs$/.test(path)) {
    for (const m of text.matchAll(/^\s*use\s+([\w:]+)/gm)) push(m[1]);
    return out;
  }
  if (/\.(java|kt|kts)$/.test(path)) {
    for (const m of text.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)/gm)) push(m[1]);
    return out;
  }
  if (/\.rb$/.test(path)) {
    for (const m of text.matchAll(/require(?:_relative)?\s+["']([^"']+)["']/g)) push(m[1]);
    return out;
  }
  if (/\.php$/.test(path)) {
    for (const m of text.matchAll(/^\s*use\s+([\w\\]+)/gm)) push(m[1]);
    for (const m of text.matchAll(/require(?:_once)?\s*\(?\s*["']([^"']+)["']/g)) push(m[1]);
    return out;
  }
  if (/\.cs$/.test(path)) {
    for (const m of text.matchAll(/^\s*using\s+([\w.]+)/gm)) push(m[1]);
    return out;
  }
  return out;
}

const SYMBOL_PATTERNS: RegExp[] = [
  /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
  /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/g,
  /^\s*def\s+([A-Za-z_][\w]*)/gm,
  /^\s*async\s+def\s+([A-Za-z_][\w]*)/gm,
  /^\s*class\s+([A-Za-z_][\w]*)/gm,
  /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/g,
  /\btype\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/g,
  /\bfn\s+([A-Za-z_][\w]*)/g,
  /\bstruct\s+([A-Za-z_][\w]*)/g,
  /\benum\s+([A-Za-z_][\w]*)/g,
  /\btrait\s+([A-Za-z_][\w]*)/g,
  /\bdef\s+([A-Za-z_][\w]*)/g,
];

function extractSymbols(text: string): string[] {
  const out = new Set<string>();
  for (const re of SYMBOL_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const name = m[1];
      if (name && name.length > 1 && !CALL_KEYWORDS.has(name)) out.add(name);
    }
  }
  return [...out].slice(0, 60);
}

function extractCalls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (name && !CALL_KEYWORDS.has(name)) out.add(name);
  }
  return [...out].slice(0, 120);
}

function readManifest(path: string, text: string, files: Set<string>): Manifest | null {
  if (path.endsWith("package.json")) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const deps = {
        ...(j.dependencies as Record<string, string> | undefined),
        ...(j.devDependencies as Record<string, string> | undefined),
        ...(j.peerDependencies as Record<string, string> | undefined),
      };
      const scripts = j.scripts && typeof j.scripts === "object" ? Object.keys(j.scripts as object) : [];
      const main = typeof j.main === "string" ? j.main : typeof j.module === "string" ? j.module : "";
      return { path, name: typeof j.name === "string" ? j.name : "", main, scripts, deps: Object.keys(deps) };
    } catch {
      return null;
    }
  }
  if (path.endsWith("requirements.txt") || path.endsWith("requirements-dev.txt")) {
    const deps = text
      .split("\n")
      .map((l) => l.split("#")[0].trim())
      .filter((l) => l && !l.startsWith("-"))
      .map((l) => l.split(/[<>=~[\s]/)[0])
      .filter(Boolean);
    return { path, name: "", main: "", scripts: [], deps: [...new Set(deps)] };
  }
  if (path.endsWith("go.mod")) {
    const deps = [...text.matchAll(/^\s*([\w./-]+)\s+v[\w.+-]+/gm)].map((m) => m[1]);
    const mod = /module\s+([\w./-]+)/.exec(text)?.[1] ?? "";
    return { path, name: mod, main: "", scripts: [], deps: [...new Set(deps)] };
  }
  if (path.endsWith("Cargo.toml")) {
    const deps = [...text.matchAll(/^\s*([\w-]+)\s*=/gm)].map((m) => m[1]);
    return { path, name: "", main: "", scripts: [], deps: [...new Set(deps)] };
  }
  if (path.endsWith("Gemfile")) {
    const deps = [...text.matchAll(/gem\s+["']([^"']+)["']/g)].map((m) => m[1]);
    return { path, name: "", main: "", scripts: [], deps };
  }
  if (path.endsWith("composer.json")) {
    try {
      const j = JSON.parse(text) as { name?: string; require?: Record<string, string> };
      return { path, name: j.name ?? "", main: "", scripts: [], deps: Object.keys(j.require ?? {}) };
    } catch {
      return null;
    }
  }
  if (path.endsWith("pyproject.toml")) {
    const deps = [...text.matchAll(/["']([A-Za-z0-9_.-]+)\s*[><=~]/g)].map((m) => m[1]);
    return { path, name: "", main: "", scripts: [], deps: [...new Set(deps)] };
  }
  void files;
  return null;
}

const ENTRY_NAMES = new Set([
  "main.py",
  "app.py",
  "manage.py",
  "wsgi.py",
  "asgi.py",
  "server.js",
  "server.ts",
  "index.js",
  "index.ts",
  "index.tsx",
  "main.ts",
  "main.tsx",
  "main.go",
  "main.rs",
  "main.cpp",
  "program.cs",
  "app.ts",
  "app.js",
]);

function isEntryPath(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  if (ENTRY_NAMES.has(base)) return true;
  if (/^cmd\/[^/]+\/main\.go$/.test(path)) return true;
  if (path === "src/main.rs" || path === "src/lib.rs") return true;
  if (path === "app/page.tsx" || path === "app/layout.tsx") return true;
  if (path === "src/App.tsx" || path === "src/app.tsx") return true;
  return false;
}

/** Step 4 of the pipeline: a deterministic fact sheet the AI is checked against. */
export function scan(repo: string, sha: string, files: Map<string, string>): FactSheet {
  const fileSet = new Set(files.keys());
  const infos: FileInfo[] = [];
  const languages: Record<string, number> = {};
  const imports: Record<string, string[]> = {};
  const links: Link[] = [];
  const symbols: Record<string, string[]> = {};
  const calls: Record<string, string[]> = {};
  const unparsed: string[] = [];
  const envVars = new Set<string>();
  const externalDeps = new Set<string>();
  const serviceHits = new Map<string, { packages: Set<string>; files: Set<string> }>();

  for (const [path, text] of files) {
    const language = languageOf(path);
    const lines = text.split("\n").length;
    infos.push({ path, language, lines });
    languages[language] = (languages[language] ?? 0) + 1;

    if (language === "Unknown") {
      unparsed.push(path);
      continue;
    }

    const specs = extractImports(path, text);
    if (specs.length) imports[path] = specs;
    for (const spec of specs) {
      const target = resolveImport(path, spec, fileSet);
      if (target) links.push({ from: path, to: target, specifier: spec });
      else {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (pkg && !pkg.startsWith(".") && !pkg.startsWith("/")) {
          externalDeps.add(pkg);
          const service = SERVICE_PACKAGES[pkg];
          if (service) {
            const hit = serviceHits.get(service) ?? { packages: new Set(), files: new Set() };
            hit.packages.add(pkg);
            hit.files.add(path);
            serviceHits.set(service, hit);
          }
        }
      }
    }

    const syms = extractSymbols(text);
    if (syms.length) symbols[path] = syms;
    const called = extractCalls(text);
    if (called.length) calls[path] = called;

    for (const re of ENV_PATTERNS) {
      for (const m of text.matchAll(re)) envVars.add(m[1]);
    }
  }

  const manifests: Manifest[] = [];
  const entryPoints = new Set<string>();
  for (const [path, text] of files) {
    const base = path.split("/").pop() ?? path;
    if (
      base === "package.json" ||
      base === "requirements.txt" ||
      base === "requirements-dev.txt" ||
      base === "go.mod" ||
      base === "Cargo.toml" ||
      base === "Gemfile" ||
      base === "composer.json" ||
      base === "pyproject.toml"
    ) {
      const m = readManifest(path, text, fileSet);
      if (m) {
        manifests.push(m);
        for (const dep of m.deps) externalDeps.add(dep);
        if (m.main) {
          const resolved = resolveImport(path, m.main.startsWith(".") ? m.main : `./${m.main}`, fileSet);
          if (resolved) entryPoints.add(resolved);
        }
        for (const s of m.scripts) {
          if (["start", "dev", "serve", "build"].includes(s)) entryPoints.add(path);
        }
      }
    }
    if (isEntryPath(path)) entryPoints.add(path);
    if (/^Dockerfile$/i.test(base)) {
      for (const m of text.matchAll(/^\s*(?:CMD|ENTRYPOINT)\s+(.+)$/gm)) {
        const cmd = m[1].match(/[\w./-]+\.(?:js|ts|py|go|sh)/);
        if (cmd) entryPoints.add(cmd[0]);
      }
    }
  }
  for (const path of files.keys()) {
    if (path.startsWith(".github/workflows/")) entryPoints.add(path);
  }

  const services: Service[] = [...serviceHits.entries()].map(([name, hit]) => ({
    name,
    packages: [...hit.packages],
    files: [...hit.files].slice(0, 12),
  }));

  return {
    repo,
    sha,
    files: infos.sort((a, b) => b.lines - a.lines),
    languages,
    imports,
    links,
    manifests,
    entryPoints: [...entryPoints],
    services,
    envVars: [...envVars].sort().slice(0, 60),
    externalDeps: [...externalDeps].sort().slice(0, 120),
    symbols,
    calls,
    unparsed: unparsed.slice(0, 60),
  };
}

/** A compact, readable dump of the fact sheet for the model. */
export function factSheetText(facts: FactSheet, maxFiles = 260): string {
  const lines: string[] = [];
  lines.push(`REPOSITORY ${facts.repo} @ ${facts.sha.slice(0, 12)}`);

  const langs = Object.entries(facts.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  lines.push(`LANGUAGES ${langs}`);
  lines.push(`FILE COUNT ${facts.files.length}`);

  lines.push("", "FILES (largest first)");
  for (const f of facts.files.slice(0, maxFiles)) {
    lines.push(`  ${f.path} [${f.language}, ${f.lines} lines]`);
  }
  if (facts.files.length > maxFiles) {
    lines.push(`  ... and ${facts.files.length - maxFiles} more files`);
  }

  if (facts.manifests.length) {
    lines.push("", "MANIFESTS");
    for (const m of facts.manifests.slice(0, 12)) {
      lines.push(
        `  ${m.path}${m.name ? ` name=${m.name}` : ""}${m.main ? ` main=${m.main}` : ""}${
          m.scripts.length ? ` scripts=${m.scripts.join(",")}` : ""
        }`,
      );
      if (m.deps.length) lines.push(`    deps: ${m.deps.slice(0, 40).join(", ")}`);
    }
  }

  if (facts.entryPoints.length) {
    lines.push("", "ENTRY POINTS");
    for (const e of facts.entryPoints.slice(0, 40)) lines.push(`  ${e}`);
  }

  if (facts.links.length) {
    lines.push("", `RESOLVED FILE-TO-FILE LINKS (${facts.links.length})`);
    for (const l of facts.links.slice(0, 200)) {
      lines.push(`  ${l.from} -> ${l.to}  (${l.specifier})`);
    }
  }

  if (facts.services.length) {
    lines.push("", "EXTERNAL SERVICES (from SDK imports)");
    for (const s of facts.services) {
      lines.push(`  ${s.name}: ${s.packages.join(", ")} in ${s.files.slice(0, 4).join(", ")}`);
    }
  }

  if (facts.envVars.length) {
    lines.push("", "ENVIRONMENT VARIABLES");
    lines.push(`  ${facts.envVars.join(", ")}`);
  }

  if (facts.unparsed.length) {
    lines.push("", "UNPARSED (no known language)");
    lines.push(`  ${facts.unparsed.slice(0, 20).join(", ")}`);
  }

  return lines.join("\n");
}

/** Does the fact sheet back a direct link between two modules? */
export function supportsLink(
  facts: FactSheet,
  fromFiles: string[],
  toFiles: string[],
  toModule: Module | undefined,
  evidencePath: string,
): boolean {
  const toSet = new Set(toFiles);
  const fromSet = new Set(fromFiles);

  for (const link of facts.links) {
    if (toSet.has(link.to) && fromSet.has(link.from)) return true;
  }

  if (toModule) {
    const toSymbols = new Set<string>();
    for (const f of toFiles) for (const s of facts.symbols[f] ?? []) toSymbols.add(s);
    const calledHere = facts.calls[evidencePath] ?? [];
    for (const c of calledHere) if (toSymbols.has(c)) return true;

    if (toModule.kind === "external") {
      const services = facts.services.filter((s) =>
        s.name.toLowerCase().includes(toModule.name.toLowerCase().split(/\s+/)[0] ?? ""),
      );
      for (const s of services) {
        for (const f of fromFiles) {
          for (const spec of facts.imports[f] ?? []) {
            const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
            if (s.packages.includes(pkg)) return true;
          }
        }
      }
    }
  }

  return false;
}
