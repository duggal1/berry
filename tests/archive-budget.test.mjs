import test from "node:test";
import assert from "node:assert/strict";
import { createArchiveFilter, ArchiveLimitExceeded } from "../server/archive-budget.ts";

const entry = (name, originalSize, size = 5) =>
  ({ name, originalSize, size, compression: 8 });
const limits = { maxFileBytes: 100, maxTotalBytes: 150, maxFiles: 3 };

test("budgets the uncompressed size, never the compressed ZIP size", () => {
  const accept = createArchiveFilter(limits);
  assert.equal(accept(entry("repo/a.swift", 100, 1)), true);
  assert.throws(() => accept(entry("repo/b.swift", 60, 1)), ArchiveLimitExceeded);
});

test("skips oversized entries before allocating decompression buffers", () => {
  const accept = createArchiveFilter(limits);
  assert.equal(accept(entry("repo/huge.png", 1_000_000)), false);
  assert.equal(accept(entry("repo/small.swift", 10)), true);
});

test("skipped paths and archive directories do not consume file budget", () => {
  const accept = createArchiveFilter(limits, (name) => name.includes("node_modules"));
  assert.equal(accept(entry("repo/", 0)), false);
  assert.equal(accept(entry("repo/node_modules/dependency.js", 100)), false);
  assert.equal(accept(entry("repo/one.swift", 10)), true);
});

test("limits number of extracted files", () => {
  const accept = createArchiveFilter(limits);
  for (let i = 0; i < 3; i++) assert.equal(accept(entry(`repo/${i}.swift`, 1)), true);
  assert.throws(() => accept(entry("repo/four.swift", 1)), ArchiveLimitExceeded);
});

test("rejects unsafe uncompressed-size metadata", () => {
  const accept = createArchiveFilter(limits);
  assert.throws(() => accept(entry("repo/invalid.swift", Number.MAX_SAFE_INTEGER + 1)), ArchiveLimitExceeded);
  assert.throws(() => accept(entry("repo/negative.swift", -1)), ArchiveLimitExceeded);
});
