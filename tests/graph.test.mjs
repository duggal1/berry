import test from "node:test";
import assert from "node:assert/strict";
import { recoverEdges } from "../server/graph.ts";

const makeModule = (id, files) => ({
  id, name: id, role: "core", kind: "service",
  purpose: id, path: ".", files, group: "",
});
const facts = (override = {}) => ({
  links: [], symbols: {}, calls: {}, ...override,
});

test("adds a verified import edge with the exact source line", () => {
  const modules = [makeModule("app", ["app.ts"]), makeModule("cleaner", ["cleaner.ts"])];
  const file = 'import { clean } from "./cleaner";';
  const result = recoverEdges(modules, [], facts({
    links: [{ from: "app.ts", to: "cleaner.ts", specifier: "./cleaner" }],
  }), new Map([["app.ts", file], ["cleaner.ts", "export const clean = () => {};"]]));
  assert.equal(result.length, 1);
  assert.deepEqual([result[0].from, result[0].to, result[0].kind, result[0].inferred],
    ["app", "cleaner", "import", false]);
  assert.deepEqual(result[0].evidence, { path: "app.ts", snippet: file });
});

test("recovers every source-backed edge in a branching graph", () => {
  const sourceFiles = new Map();
  const targetFiles = [];
  const links = [];
  const modules = [];
  const sourceLines = [];
  for (let i = 0; i < 10; i++) {
    const targetPath = `targets/target-${i}.ts`;
    const specifier = `./${targetPath}`;
    sourceLines.push(`import { target${i} } from "${specifier}";`);
    targetFiles.push(targetPath);
    links.push({ from: "app.ts", to: targetPath, specifier });
  }
  sourceFiles.set("app.ts", sourceLines.join("\n"));
  modules.push(makeModule("app", ["app.ts"]));
  targetFiles.forEach((path, index) => {
    sourceFiles.set(path, `export const target${index} = () => {};`);
    modules.push(makeModule(`target-${index}`, [path]));
  });

  const result = recoverEdges(modules, [], facts({ links }), sourceFiles);
  assert.equal(result.length, 10);
});

test("recovers a Swift constructor reference but labels it inferred", () => {
  const modules = [makeModule("watchdog", ["Watchdog.swift"]), makeModule("cleaner", ["Cleaner.swift"])];
  const result = recoverEdges(modules, [], facts({
    symbols: { "Cleaner.swift": ["Cleaner"] },
    calls: { "Watchdog.swift": ["Cleaner"] },
  }), new Map([
    ["Watchdog.swift", "let cleanup = Cleaner()"],
    ["Cleaner.swift", "struct Cleaner { }"],
  ]));
  assert.equal(result.length, 1);
  assert.equal(result[0].inferred, true);
  assert.equal(result[0].evidence.snippet, "let cleanup = Cleaner()");
});

test("does not guess a connection without evidence or for ambiguous ownership", () => {
  const modules = [
    makeModule("first", ["shared.ts"]),
    makeModule("second", ["shared.ts"]),
    makeModule("target", ["target.ts"]),
  ];
  const result = recoverEdges(modules, [], facts({
    links: [{ from: "shared.ts", to: "target.ts", specifier: "./target" }],
    calls: { "shared.ts": ["Target"] },
    symbols: { "target.ts": ["Target"] },
  }), new Map([
    ["shared.ts", 'import { Target } from "./target";\nTarget()'],
    ["target.ts", "class Target {}"],
  ]));
  assert.equal(result.length, 0);
});

test("does not guess relationships from symbols merely declared nearby", () => {
  const result = recoverEdges(
    [makeModule("a", ["a.swift"]), makeModule("b", ["b.swift"])],
    [], facts({ symbols: { "b.swift": ["Cleaner"] }, calls: { "a.swift": ["Cleaner"] } }),
    new Map([["a.swift", "// Cleaner() is a comment"], ["b.swift", "struct Cleaner {}"]]),
  );
  assert.equal(result.length, 0);
});

test("keeps a runtime call separate from a resolved import between the same modules", () => {
  const original = [{
    id: "ai-edge", from: "app", to: "cleaner", kind: "call", label: "maybe calls",
    inferred: true, evidence: { path: "app.ts", snippet: "old" },
  }];
  const result = recoverEdges(
    [makeModule("app", ["app.ts"]), makeModule("cleaner", ["cleaner.ts"])],
    original,
    facts({ links: [{ from: "app.ts", to: "cleaner.ts", specifier: "./cleaner" }] }),
    new Map([["app.ts", 'import x from "./cleaner";']]),
  );
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((edge) => [edge.id, edge.kind, edge.inferred]), [
    ["ai-edge", "call", true],
    ["source-app-cleaner", "import", false],
  ]);
});

test("rejects source excerpts longer than the evidence limit", () => {
  const result = recoverEdges(
    [makeModule("app", ["app.ts"]), makeModule("cleaner", ["cleaner.ts"])],
    [], facts({ links: [{ from: "app.ts", to: "cleaner.ts", specifier: "./cleaner" }] }),
    new Map([["app.ts", 'import x from "./cleaner"; // ' + "x".repeat(125)]]),
  );
  assert.equal(result.length, 0);
});

test("recovers Swift static method calls as inferred source-backed links", () => {
  const modules = [
    makeModule("watchdog", ["Purge/Scanner/WatchdogRunner.swift"]),
    makeModule("scanner", ["Purge/Scanner/Scanner.swift"]),
    makeModule("cleaner", ["Purge/Scanner/Cleaner.swift"]),
  ];
  const lines = [
    "let cats = await Scanner.scanWatchdog(config: cfg, hasFDA: hasFDA)",
    "let (outcome, _) = await Cleaner.clean(items: toClean)",
  ];
  const result = recoverEdges(modules, [], facts({
    symbols: {
      "Purge/Scanner/Scanner.swift": ["Scanner"],
      "Purge/Scanner/Cleaner.swift": ["Cleaner"],
    },
    calls: { "Purge/Scanner/WatchdogRunner.swift": ["scanWatchdog", "clean"] },
  }), new Map([
    ["Purge/Scanner/WatchdogRunner.swift", lines.join("\n")],
    ["Purge/Scanner/Scanner.swift", "enum Scanner {}"],
    ["Purge/Scanner/Cleaner.swift", "enum Cleaner {}"],
  ]));
  assert.deepEqual(result.map(e => [e.from, e.to, e.label, e.inferred]), [
    ["watchdog", "scanner", "calls scanWatchdog", true],
    ["watchdog", "cleaner", "calls clean", true],
  ]);
  assert.equal(result[0].evidence.snippet, lines[0]);
  assert.equal(result[1].evidence.snippet, lines[1]);
});

test("Swift static-call inference does not create edges from comments", () => {
  const result = recoverEdges(
    [makeModule("watchdog", ["Watchdog.swift"]), makeModule("scanner", ["Scanner.swift"])],
    [], facts({ symbols: { "Scanner.swift": ["Scanner"] } }),
    new Map([["Watchdog.swift", "// Scanner.scanWatchdog()"], ["Scanner.swift", "enum Scanner {}"]]),
  );
  assert.equal(result.length, 0);
});

test("Swift model annotations become inferred type links, not runtime calls", () => {
  const source = "static func scan() async -> [ScannedItem] { [] }";
  const result = recoverEdges(
    [makeModule("scanner", ["Scanner.swift"]), makeModule("models", ["Junk.swift"])],
    [], facts({ symbols: { "Junk.swift": ["ScannedItem"] } }),
    new Map([["Scanner.swift", source], ["Junk.swift", "struct ScannedItem {}"]]),
  );
  assert.equal(result.length, 1);
  assert.deepEqual([result[0].from, result[0].to, result[0].kind, result[0].inferred],
    ["scanner", "models", "type", true]);
  assert.equal(result[0].evidence.snippet, source);
});

test("Swift comment-only annotations do not produce inferred edges", () => {
  const result = recoverEdges(
    [makeModule("scanner", ["Scanner.swift"]), makeModule("models", ["Junk.swift"])],
    [], facts({ symbols: { "Junk.swift": ["ScannedItem"] } }),
    new Map([["Scanner.swift", "// let x: [ScannedItem]"], ["Junk.swift", "struct ScannedItem {}"]]),
  );
  assert.equal(result.length, 0);
});
