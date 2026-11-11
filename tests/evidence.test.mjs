import test from "node:test";
import assert from "node:assert/strict";
import { supportsLink } from "../server/scan.ts";

const facts = {
  links: [{ from: "src/app.ts", to: "src/db.ts", specifier: "./db" }],
  services: [],
  imports: {},
};
const source = ["src/app.ts"];
const target = ["src/db.ts"];

test("a matched import and its cited source file prove an edge", () => {
  assert.equal(supportsLink(facts, source, target, undefined,
    "src/app.ts", 'import { db } from "./db";'), true);
});

test("a real but irrelevant line cannot prove a different dependency", () => {
  assert.equal(supportsLink(facts, source, target, undefined,
    "src/app.ts", "return db.query();"), false);
});

test("the evidence must come from the source module", () => {
  assert.equal(supportsLink(facts, source, target, undefined,
    "src/other.ts", 'import { db } from "./db";'), false);
});
