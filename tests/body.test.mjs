import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedJson, BodyTooLargeError } from "../server/body.ts";

test("parses bounded JSON requests", async () => {
  const req = new Request("http://localhost/share", { method: "POST", body: '{"id":"abc"}' });
  assert.deepEqual(await readBoundedJson(req, 50), { id: "abc" });
});

test("rejects a declared oversized JSON body", async () => {
  const req = new Request("http://localhost/share", {
    method: "POST", headers: { "content-length": "400" }, body: "{}",
  });
  await assert.rejects(() => readBoundedJson(req, 10), BodyTooLargeError);
});

test("rejects an oversized streaming body without relying on Content-Length", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"x":"'));
      controller.enqueue(new TextEncoder().encode("a".repeat(100)));
      controller.close();
    },
  });
  const req = new Request("http://localhost/share", {
    method: "POST", body: stream, duplex: "half",
  });
  await assert.rejects(() => readBoundedJson(req, 40), BodyTooLargeError);
});

test("rejects malformed JSON", async () => {
  const req = new Request("http://localhost/share", { method: "POST", body: "{oops" });
  await assert.rejects(() => readBoundedJson(req, 100), SyntaxError);
});
