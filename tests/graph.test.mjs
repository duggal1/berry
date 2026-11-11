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

test("promotes an inferred edge when a real import supports it without changing its ID", () => {
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
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "ai-edge");
  assert.equal(result[0].inferred, false);
  assert.equal(result[0].kind, "import");
});

test("rejects source excerpts longer than the evidence limit", () => {
  const result = recoverEdges(
    [makeModule("app", ["app.ts"]), makeModule("cleaner", ["cleaner.ts"])],
    [], facts({ links: [{ from: "app.ts", to: "cleaner.ts", specifier: "./cleaner" }] }),
    new Map([["app.ts", 'import x from "./cleaner"; // ' + "x".repeat(125)]]),
  );
  assert.equal(result.length, 0);
});
