import test from "node:test";
import assert from "node:assert/strict";
import { scan } from "../server/scan.ts";

test("recognizes Swift @main app entry points", () => {
  const files = new Map([
    ["JupiterApp.swift", "@main\nstruct JupiterApp: App { var body: some Scene { WindowGroup { ContentView() } } }"],
    ["Purge/Scanner.swift", "struct Scanner {}"],
  ]);
  const facts = scan("example/Jupiter", "0123456789", files);
  assert.deepEqual(facts.entryPoints, ["JupiterApp.swift"]);
});

test("recognizes Swift main.swift without an @main attribute", () => {
  const facts = scan("owner/repo", "abc", new Map([["Sources/main.swift", 'print("Hello")']]));
  assert.ok(facts.entryPoints.includes("Sources/main.swift"));
});

test("does not call every Swift model a startup entry point", () => {
  const facts = scan("owner/repo", "abc", new Map([["JunkModel.swift", "struct JunkModel {}"]]));
  assert.deepEqual(facts.entryPoints, []);
});
