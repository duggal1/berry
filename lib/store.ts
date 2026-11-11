import { GENERATOR_VERSION, STORY_SCHEMA_VERSION, Stored } from "./schema";
import type { Analysis } from "./schema";

const DB_NAME = "berry";
const OLD_DB_NAME = "repo-explainer";
const STORE = "analyses";

let dbp: Promise<IDBDatabase> | null = null;
let migrated: Promise<void> | null = null;

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Move anything saved under the old name into the new one. Runs once. */
function migrate(): Promise<void> {
  return (migrated ??= (async () => {
    try {
      if (localStorage.getItem("berry.migrated")) return;
      const old = await open(OLD_DB_NAME);
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const r = old.transaction(STORE, "readonly").objectStore(STORE).getAll();
        r.onsuccess = () => resolve(r.result as unknown[]);
        r.onerror = () => reject(r.error);
      });
      old.close();
      if (rows.length) {
        const d = await db();
        await new Promise<void>((resolve, reject) => {
          const t = d.transaction(STORE, "readwrite");
          const s = t.objectStore(STORE);
          for (const row of rows) s.put(row);
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
        });
      }
      localStorage.setItem("berry.migrated", "1");
    } catch {
      /* nothing to migrate */
    }
  })());
}

function db(): Promise<IDBDatabase> {
  return (dbp ??= open(DB_NAME));
}

function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const r = f(d.transaction(STORE, mode).objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export const idFor = (a: Analysis) => `${a.meta.repo.replace("/", "~")}~${a.meta.sha.slice(0, 7)}`;

function versionedIdFor(a: Analysis): string {
  const generated = Date.parse(a.meta.generatedAt);
  const suffix = Number.isFinite(generated) ? generated.toString(36) : Date.now().toString(36);
  return `${idFor(a)}~story-${a.meta.storyVersion}-${suffix}`;
}

export async function saveAnalysis(a: Analysis, options: { preserveExisting?: boolean } = {}): Promise<Stored> {
  await migrate();
  const canonicalId = idFor(a);
  const current = Stored.safeParse(await run("readonly", (s) => s.get(canonicalId)));
  const isNewer = current.success && (
    current.data.meta.storyVersion < STORY_SCHEMA_VERSION ||
    current.data.meta.generatorVersion !== GENERATOR_VERSION
  );
  const id = options.preserveExisting || isNewer ? versionedIdFor(a) : canonicalId;
  const rec = { ...a, id, savedAt: Date.now() };
  await run("readwrite", (s) => s.put(rec));
  const parsed = Stored.parse(rec);
  return parsed;
}

export async function listAnalyses(): Promise<Stored[]> {
  await migrate();
  const all = await run("readonly", (s) => s.getAll());
  return all
    .map((x) => Stored.safeParse(x))
    .flatMap((r) => (r.success ? [r.data] : []))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function getAnalysis(id: string): Promise<Stored | null> {
  await migrate();
  const r = Stored.safeParse(await run("readonly", (s) => s.get(id)));
  return r.success ? r.data : null;
}

export const deleteAnalysis = (id: string) =>
  run("readwrite", (s) => s.delete(id)).then(() => undefined);
