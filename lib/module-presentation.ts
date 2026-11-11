import type { Module } from "./schema";

const DATABASE_TECHNOLOGIES: [RegExp, string][] = [
  [/\bpostgres(?:ql)?\b/i, "PostgreSQL"],
  [/\bmysql\b/i, "MySQL"],
  [/\bsqlite\b/i, "SQLite"],
  [/\b(?:mongo\s?db|mongodb)\b/i, "MongoDB"],
  [/\bdynamodb\b/i, "DynamoDB"],
  [/\bredis\b/i, "Redis"],
  [/\bneon\b/i, "Neon"],
];

const LANGUAGE_TAG = /^(?:typescript|javascript|tsx?|jsx?|python|ruby|go|rust|java|kotlin|swift|c#|c\+\+|php)$/i;

function databaseTechnology(module: Module): string {
  const source = `${module.name} ${module.purpose} ${module.tech ?? ""}`;
  return DATABASE_TECHNOLOGIES.find(([pattern]) => pattern.test(source))?.[1] ?? "";
}

function moduleKind(module: Module): Module["kind"] {
  if (module.kind === "external" || module.kind === "queue" || module.kind === "datastore") {
    return module.kind;
  }

  const name = module.name.toLowerCase();
  const pathParts = module.path.toLowerCase().split("/").filter(Boolean);
  const databasePath = pathParts.some((part) => ["db", "database", "databases", "persistence"].includes(part));
  const databaseName = /\b(?:database|datastore|postgres(?:ql)?|mysql|sqlite|mongodb|dynamodb)\b/i.test(name);
  const databasePurpose = /\b(?:database|postgres(?:ql)?|mysql|sqlite|mongodb|dynamodb)\b/i.test(module.purpose);
  if (databaseName || (databasePath && databasePurpose)) return "datastore";

  if (/\b(?:message\s+)?queue\b/i.test(name)) return "queue";
  return module.kind;
}

function moduleRole(module: Module, kind: Module["kind"]): Module["role"] {
  if (kind === "datastore" || kind === "queue") return "data";
  if (kind === "external") return "integration";

  const identity = `${module.name} ${module.path}`.toLowerCase();
  const text = `${identity} ${module.purpose}`;
  if (/\b(config|configuration|settings|environment|feature flags?)\b/.test(text)) return "config";
  if (/\b(redux slice|state store|repository|repositories|cache|schema)\b/.test(identity)) return "data";
  if (/\b(auth|authentication|middleware|validator|validation|logger|logging|helper|utilities)\b/.test(text)) return "utility";
  if (/\b(api client|provider|sdk|gateway|payment|integration|external service|llm)\b/.test(text)) return "integration";
  if (/\b(page|tab|route|routes|router|endpoint|entry point|http handler|command line)\b/.test(text)) return "entry";
  if (/\b(controller|agent|worker|processor|orchestrator|thunk|service|business logic)\b/.test(text)) return "core";
  return module.role;
}

/** Repair presentation metadata that model output often collapses to one role. */
export function normalizeModulePresentation(module: Module): Module {
  const kind = moduleKind(module);
  const inferredDatabaseTech = kind === "datastore" ? databaseTechnology(module) : "";
  const tech = inferredDatabaseTech || (LANGUAGE_TAG.test(module.tech?.trim() ?? "") ? "" : module.tech?.trim() ?? "");
  return {
    ...module,
    role: moduleRole(module, kind),
    kind,
    tech: tech || undefined,
  };
}

export function normalizeModulePresentations(modules: Module[]): Module[] {
  return modules.map(normalizeModulePresentation);
}
